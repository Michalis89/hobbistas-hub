import 'server-only';

import type { ZodTypeAny } from 'zod';
import { readClampedIntEnv } from '@/lib/ai/shared/env';
import { AiProviderHttpError } from '@/lib/ai/shared/provider/errors';
import {
  normalizeGeminiModelId,
  readGeminiCandidate,
  requestGeminiGenerateContent,
} from '@/lib/ai/shared/provider/gemini';
import { parseStructuredJson } from '@/lib/ai/shared/structured-output';
import { summarizeTasteSchemaIssues } from './schema-issues';

export { normalizeGeminiModelId };

/**
 * The Gemini transport for a taste generation.
 *
 * Category-independent: the request differs only in its prompts, its contract and its env names,
 * all of which arrive as configuration. What is *not* configurable is the retry policy, which is
 * the part that was learned the expensive way and must behave identically everywhere.
 *
 * The policy, in short: attempt once at a low temperature; if the output is unparseable or misses
 * the structural contract, retry once at temperature zero with the formatting rules hardened — but
 * only if there is enough of the caller's budget left for the retry to finish. A retry started too
 * late is pure waste: it spends a request and converts a precise `schema` failure into an opaque
 * `timeout`, which backs off six times as long and says nothing about what went wrong.
 */

export const DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS = 6_000;

/**
 * Budget a retry needs to stand a reasonable chance.
 *
 * Measured against the first live anime run, where a 2,585-character first response arrived and
 * then the retry ran into the 20s wall, producing no profile and a twelve-minute cooldown.
 */
export const TASTE_RETRY_RESERVE_MS = 9_000;

export type TasteProviderInput<TEvidence> = {
  evidence: TEvidence;
  model: string;
  signal?: AbortSignal;
  /**
   * Epoch milliseconds at which the caller's timeout fires.
   *
   * Supplied so the structural retry can be skipped when there is not enough budget left for it to
   * finish. Without this a slow first attempt turns a diagnosable schema failure into an opaque
   * timeout.
   */
  deadlineAt?: number;
};

export interface TasteAiProvider<TEvidence> {
  generateProfile(input: TasteProviderInput<TEvidence>): Promise<unknown>;
}

/** A non-2xx response from Gemini on a taste path. The category names itself in the message. */
export class GeminiTasteProviderError extends AiProviderHttpError {
  constructor(category: string, status: number, detail: string | null, retryAfterMs: number | null) {
    super(
      `Gemini ${category} taste profile failed with ${status}${detail ? `: ${detail}` : ''}`,
      status,
      retryAfterMs,
    );
    this.name = 'GeminiTasteProviderError';
  }
}

export type TasteProviderConfig<TEvidence> = {
  category: string;
  logScope: string;
  /** Mirrors the Zod contract field for field. Built by `buildGeminiTasteResponseSchema`. */
  responseSchema: object;
  /** The Zod contract, used only to decide whether a structural retry is warranted. */
  profileSchema: ZodTypeAny;
  buildPrompt: (evidence: TEvidence) => string;
  buildRetryPrompt: (evidence: TEvidence) => string;
  maxOutputTokensEnv: string;
};

export function readGeminiTasteMaxOutputTokens(envName: string): number {
  return readClampedIntEnv(envName, {
    fallback: DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS,
    min: 2_500,
    max: 12_000,
  });
}

type TasteResponseMetadata = {
  finishReason: string | null;
  partCount: number;
  textLength: number;
  maxOutputTokens: number;
};

export class GeminiTasteProvider<TEvidence> implements TasteAiProvider<TEvidence> {
  private readonly apiKey: string;
  private readonly config: TasteProviderConfig<TEvidence>;
  private readonly invalidJsonMessage: string;

  constructor(apiKey: string, config: TasteProviderConfig<TEvidence>) {
    this.apiKey = apiKey;
    this.config = config;
    this.invalidJsonMessage = `Gemini ${config.category} taste profile response was not valid JSON`;
  }

  async generateProfile({
    evidence,
    model,
    signal,
    deadlineAt,
  }: TasteProviderInput<TEvidence>): Promise<unknown> {
    const { logScope, profileSchema, buildPrompt, buildRetryPrompt, maxOutputTokensEnv } =
      this.config;
    const modelId = normalizeGeminiModelId(model);
    const maxOutputTokens = readGeminiTasteMaxOutputTokens(maxOutputTokensEnv);

    const first = await this.generateStructuredJson({
      modelId,
      prompt: buildPrompt(evidence),
      temperature: 0.2,
      maxOutputTokens,
      signal,
    });

    let firstParsed: unknown;
    try {
      firstParsed = this.parseJson(first.text);
    } catch (error) {
      if (!this.isInvalidJsonError(error) || signal?.aborted) {
        throw error;
      }
      console.warn(`[${logScope}] Gemini returned invalid JSON; retrying once.`, first.metadata);
    }

    if (firstParsed !== undefined) {
      // The response schema mirrors the Zod contract, so a structural miss here is unexpected.
      // Retry once deterministically rather than discarding the whole generation.
      const structural = profileSchema.safeParse(firstParsed);
      if (structural.success) {
        return firstParsed;
      }
      if (signal?.aborted) {
        return firstParsed;
      }

      console.warn(`[${logScope}] Gemini output missed the structural contract; retrying once.`, {
        ...first.metadata,
        issues: summarizeTasteSchemaIssues(structural.error, firstParsed),
      });

      if (!hasBudgetForRetry(deadlineAt)) {
        console.warn(
          `[${logScope}] skipping structural retry; under ${TASTE_RETRY_RESERVE_MS}ms of budget left.`,
        );
        return firstParsed;
      }
    }

    const retry = await this.generateStructuredJson({
      modelId,
      prompt: buildRetryPrompt(evidence),
      temperature: 0,
      maxOutputTokens,
      signal,
    });

    try {
      return this.parseJson(retry.text);
    } catch (error) {
      if (this.isInvalidJsonError(error)) {
        console.warn(`[${logScope}] Gemini retry returned invalid JSON.`, retry.metadata);
      }
      // Nothing usable from the retry either; surface the first attempt so the service can report
      // a precise validation category instead of a generic provider error.
      if (firstParsed !== undefined) {
        return firstParsed;
      }
      throw error;
    }
  }

  private async generateStructuredJson({
    modelId,
    prompt,
    temperature,
    maxOutputTokens,
    signal,
  }: {
    modelId: string;
    prompt: string;
    temperature: number;
    maxOutputTokens: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; metadata: TasteResponseMetadata }> {
    const { category, responseSchema } = this.config;

    const payload = await requestGeminiGenerateContent({
      apiKey: this.apiKey,
      modelId,
      prompt,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema,
      },
      signal,
      onHttpError: (status, detail, retryAfterMs) =>
        new GeminiTasteProviderError(category, status, detail, retryAfterMs),
    });

    const candidate = readGeminiCandidate(payload);
    if (!candidate.text) {
      throw new Error(`Gemini ${category} taste profile response was empty`);
    }

    return {
      text: candidate.text,
      metadata: {
        finishReason: candidate.finishReason,
        partCount: candidate.partCount,
        textLength: candidate.text.length,
        maxOutputTokens,
      },
    };
  }

  private parseJson(text: string): unknown {
    return parseStructuredJson(text, () => new Error(this.invalidJsonMessage));
  }

  private isInvalidJsonError(error: unknown): boolean {
    return error instanceof Error && error.message === this.invalidJsonMessage;
  }
}

function hasBudgetForRetry(deadlineAt: number | undefined): boolean {
  // No deadline supplied means the caller is not enforcing one; behave as before.
  return deadlineAt === undefined || deadlineAt - Date.now() >= TASTE_RETRY_RESERVE_MS;
}
