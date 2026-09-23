import 'server-only';

import { readClampedIntEnv } from '@/lib/ai/shared/env';
import { AiProviderHttpError } from '@/lib/ai/shared/provider/errors';
import {
  normalizeGeminiModelId,
  readGeminiCandidate,
  requestGeminiGenerateContent,
  resolveGeminiApiKey,
} from '@/lib/ai/shared/provider/gemini';
import { parseStructuredJson } from '@/lib/ai/shared/structured-output';
import { MANGA_TASTE_LOG_SCOPE } from '../constants';
import { buildMangaTastePrompt, buildMangaTasteRetryPrompt } from './prompt';
import { summarizeSchemaIssues } from './validation';
import {
  AiMangaTasteProfileSchema,
  DEFAULT_GEMINI_MANGA_TASTE_MODEL,
  MANGA_AI_TASTE_LIST_LIMITS,
  MANGA_AI_TASTE_SCHEMA_VERSION,
  MANGA_AI_TASTE_TEXT_LIMITS,
  type AiMangaTasteProfile,
  type MangaAiEvidenceDocument,
} from './types';

export { normalizeGeminiModelId };
export { buildMangaTastePrompt };

export type MangaTasteProviderInput = {
  evidence: MangaAiEvidenceDocument;
  model: string;
  signal?: AbortSignal;
  /**
   * Epoch milliseconds at which the caller's timeout fires.
   *
   * Supplied so the structural retry can be skipped when there is not enough budget left for it
   * to finish. Without this a slow first attempt turns a diagnosable schema failure into an
   * opaque timeout — and a twelve-minute provider cooldown instead of a two-minute one.
   */
  deadlineAt?: number;
};

export interface MangaTasteAiProvider {
  generateProfile(input: MangaTasteProviderInput): Promise<unknown>;
}

export const DEFAULT_GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS = 6_000;

/** Budget a retry needs to stand a reasonable chance. Matches the anime figure. */
export const MANGA_TASTE_RETRY_RESERVE_MS = 9_000;

/** A non-2xx response from Gemini on the manga taste path. */
export class GeminiMangaTasteProviderError extends AiProviderHttpError {
  constructor(status: number, detail: string | null, retryAfterMs: number | null) {
    super(
      `Gemini manga taste profile failed with ${status}${detail ? `: ${detail}` : ''}`,
      status,
      retryAfterMs,
    );
    this.name = 'GeminiMangaTasteProviderError';
  }
}

/**
 * Mirrors `AiMangaTasteProfileSchema` field for field.
 *
 * Every bound Zod enforces must also appear here, or constrained decoding produces output that
 * Zod then rejects wholesale — a whole generation thrown away over one long string.
 */
const GEMINI_MANGA_TASTE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    // Zod: z.literal(1). Gemini's `enum` is string-only, so pin the integer by range.
    schemaVersion: {
      type: 'integer',
      minimum: MANGA_AI_TASTE_SCHEMA_VERSION,
      maximum: MANGA_AI_TASTE_SCHEMA_VERSION,
    },
    identity: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          minLength: 1,
          maxLength: MANGA_AI_TASTE_TEXT_LIMITS.identityLabel,
        },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: MANGA_AI_TASTE_TEXT_LIMITS.description,
        },
      },
      required: ['label', 'description'],
      propertyOrdering: ['label', 'description'],
    },
    pillars: {
      type: 'array',
      minItems: MANGA_AI_TASTE_LIST_LIMITS.pillarsMin,
      maxItems: MANGA_AI_TASTE_LIST_LIMITS.pillarsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: MANGA_AI_TASTE_TEXT_LIMITS.name },
          kind: { type: 'string', enum: ['content', 'form'] },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: MANGA_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: MANGA_AI_TASTE_LIST_LIMITS.pillarEvidenceMin,
            maxItems: MANGA_AI_TASTE_LIST_LIMITS.evidenceMax,
            items: { type: 'string', minLength: 1 },
          },
        },
        required: ['name', 'kind', 'description', 'evidenceTitles'],
        propertyOrdering: ['name', 'kind', 'description', 'evidenceTitles'],
      },
    },
    negativeSignals: {
      type: 'array',
      minItems: 0,
      maxItems: MANGA_AI_TASTE_LIST_LIMITS.negativeSignalsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: MANGA_AI_TASTE_TEXT_LIMITS.name },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: MANGA_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: MANGA_AI_TASTE_LIST_LIMITS.negativeEvidenceMin,
            maxItems: MANGA_AI_TASTE_LIST_LIMITS.evidenceMax,
            items: { type: 'string', minLength: 1 },
          },
        },
        required: ['name', 'description', 'evidenceTitles'],
        propertyOrdering: ['name', 'description', 'evidenceTitles'],
      },
    },
    summary: { type: 'string', minLength: 1, maxLength: MANGA_AI_TASTE_TEXT_LIMITS.summary },
    openQuestions: {
      type: 'array',
      minItems: 0,
      maxItems: MANGA_AI_TASTE_LIST_LIMITS.openQuestionsMax,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: MANGA_AI_TASTE_TEXT_LIMITS.openQuestion,
      },
    },
  },
  required: ['schemaVersion', 'identity', 'pillars', 'negativeSignals', 'summary', 'openQuestions'],
  propertyOrdering: [
    'schemaVersion',
    'identity',
    'pillars',
    'negativeSignals',
    'summary',
    'openQuestions',
  ],
} as const;

/** Exposed so tests can assert parity with `AiMangaTasteProfileSchema`. */
export function getGeminiMangaTasteResponseSchema(): typeof GEMINI_MANGA_TASTE_RESPONSE_SCHEMA {
  return GEMINI_MANGA_TASTE_RESPONSE_SCHEMA;
}

const INVALID_JSON_MESSAGE = 'Gemini manga taste profile response was not valid JSON';

export class GeminiMangaTasteProvider implements MangaTasteAiProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateProfile({
    evidence,
    model,
    signal,
    deadlineAt,
  }: MangaTasteProviderInput): Promise<unknown> {
    const modelId = normalizeGeminiModelId(model);
    const maxOutputTokens = getGeminiMangaTasteMaxOutputTokens();
    const first = await this.generateStructuredJson({
      modelId,
      prompt: buildMangaTastePrompt(evidence),
      temperature: 0.2,
      maxOutputTokens,
      signal,
    });

    let firstParsed: unknown;
    try {
      firstParsed = parseMangaTasteJson(first.text);
    } catch (error) {
      if (!isInvalidJsonError(error) || signal?.aborted) {
        throw error;
      }
      console.warn(
        `[${MANGA_TASTE_LOG_SCOPE}] Gemini returned invalid JSON; retrying once.`,
        first.metadata,
      );
    }

    if (firstParsed !== undefined) {
      // The response schema mirrors the Zod contract, so a structural miss here is unexpected.
      // Retry once deterministically rather than discarding the whole generation.
      const structural = AiMangaTasteProfileSchema.safeParse(firstParsed);
      if (structural.success) {
        return firstParsed as AiMangaTasteProfile;
      }
      if (signal?.aborted) {
        return firstParsed;
      }

      // Gemini enforces types, enums and required fields under constrained decoding, but treats
      // string-length and array-length bounds as advisory — so the overrun that lands here is
      // almost always a length one. Shape only: path, code, bound, and the received type/size.
      const issues = summarizeSchemaIssues(structural.error, firstParsed);
      console.warn(
        `[${MANGA_TASTE_LOG_SCOPE}] Gemini output missed the structural contract; retrying once.`,
        { ...first.metadata, issues },
      );

      // A retry that cannot finish before the caller's deadline is pure waste: it spends a
      // request and converts a precise `schema` failure into a `timeout`, which backs off six
      // times as long and says nothing about what went wrong.
      if (!hasBudgetForRetry(deadlineAt)) {
        console.warn(
          `[${MANGA_TASTE_LOG_SCOPE}] skipping structural retry; under ${MANGA_TASTE_RETRY_RESERVE_MS}ms of budget left.`,
        );
        return firstParsed;
      }
    }

    const retry = await this.generateStructuredJson({
      modelId,
      prompt: buildMangaTasteRetryPrompt(evidence),
      temperature: 0,
      maxOutputTokens,
      signal,
    });

    try {
      return parseMangaTasteJson(retry.text) as AiMangaTasteProfile;
    } catch (error) {
      if (isInvalidJsonError(error)) {
        console.warn(
          `[${MANGA_TASTE_LOG_SCOPE}] Gemini retry returned invalid JSON.`,
          retry.metadata,
        );
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
  }): Promise<{ text: string; metadata: MangaTasteResponseMetadata }> {
    const payload = await requestGeminiGenerateContent({
      apiKey: this.apiKey,
      modelId,
      prompt,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_MANGA_TASTE_RESPONSE_SCHEMA,
      },
      signal,
      onHttpError: (status, detail, retryAfterMs) =>
        new GeminiMangaTasteProviderError(status, detail, retryAfterMs),
    });

    const candidate = readGeminiCandidate(payload);
    if (!candidate.text) {
      throw new Error('Gemini manga taste profile response was empty');
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
}

type MangaTasteResponseMetadata = {
  finishReason: string | null;
  partCount: number;
  textLength: number;
  maxOutputTokens: number;
};

export function getGeminiMangaTasteMaxOutputTokens(): number {
  return readClampedIntEnv('GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS', {
    fallback: DEFAULT_GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS,
    min: 2_500,
    max: 12_000,
  });
}

function hasBudgetForRetry(deadlineAt: number | undefined): boolean {
  // No deadline supplied means the caller is not enforcing one; behave as before.
  return deadlineAt === undefined || deadlineAt - Date.now() >= MANGA_TASTE_RETRY_RESERVE_MS;
}

function parseMangaTasteJson(text: string): unknown {
  return parseStructuredJson(text, () => new Error(INVALID_JSON_MESSAGE));
}

function isInvalidJsonError(error: unknown): boolean {
  return error instanceof Error && error.message === INVALID_JSON_MESSAGE;
}

/**
 * Resolves the configured manga taste provider.
 *
 * Its own enable flag, deliberately separate from the games and anime ones: manga taste must be
 * switchable off without touching two features that are already live, and vice versa. The model
 * and the API key are shared because they are account-level facts, not per-category ones.
 */
export function getConfiguredMangaTasteProvider(): {
  provider: MangaTasteAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_MANGA_TASTE_MODEL ||
      process.env.GEMINI_TASTE_MODEL ||
      DEFAULT_GEMINI_MANGA_TASTE_MODEL,
  );
  const enabled = process.env.MANGA_AI_TASTE_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiMangaTasteProvider(apiKey), model, enabled };
}
