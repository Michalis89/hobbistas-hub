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
import { ANIME_TASTE_LOG_SCOPE } from '../constants';
import { buildAnimeTastePrompt, buildAnimeTasteRetryPrompt } from './prompt';
import { summarizeSchemaIssues } from './validation';
import {
  AiAnimeTasteProfileSchema,
  ANIME_AI_TASTE_LIST_LIMITS,
  ANIME_AI_TASTE_SCHEMA_VERSION,
  ANIME_AI_TASTE_TEXT_LIMITS,
  DEFAULT_GEMINI_ANIME_TASTE_MODEL,
  type AiAnimeTasteProfile,
  type AnimeAiEvidenceDocument,
} from './types';

export { normalizeGeminiModelId };
export { buildAnimeTastePrompt };

export type AnimeTasteProviderInput = {
  evidence: AnimeAiEvidenceDocument;
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

export interface AnimeTasteAiProvider {
  generateProfile(input: AnimeTasteProviderInput): Promise<unknown>;
}

export const DEFAULT_GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS = 6_000;

/**
 * Budget a retry needs to stand a reasonable chance.
 *
 * Measured against the first live anime run, where a 2,585-character first response arrived, then
 * the retry ran into the 20s wall. A retry started with less than this left is near-certain to be
 * aborted, so it is better to surface the first attempt's precise validation failure instead.
 */
export const ANIME_TASTE_RETRY_RESERVE_MS = 9_000;

/** A non-2xx response from Gemini on the anime taste path. */
export class GeminiAnimeTasteProviderError extends AiProviderHttpError {
  constructor(status: number, detail: string | null, retryAfterMs: number | null) {
    super(
      `Gemini anime taste profile failed with ${status}${detail ? `: ${detail}` : ''}`,
      status,
      retryAfterMs,
    );
    this.name = 'GeminiAnimeTasteProviderError';
  }
}

/**
 * Mirrors `AiAnimeTasteProfileSchema` field for field.
 *
 * Every bound Zod enforces must also appear here, or constrained decoding produces output that
 * Zod then rejects wholesale — a whole generation thrown away over one long string. Note the
 * `kind` enum is `content | form`, which is where this schema diverges from the games one.
 */
const GEMINI_ANIME_TASTE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    // Zod: z.literal(1). Gemini's `enum` is string-only, so pin the integer by range.
    schemaVersion: {
      type: 'integer',
      minimum: ANIME_AI_TASTE_SCHEMA_VERSION,
      maximum: ANIME_AI_TASTE_SCHEMA_VERSION,
    },
    identity: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          minLength: 1,
          maxLength: ANIME_AI_TASTE_TEXT_LIMITS.identityLabel,
        },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: ANIME_AI_TASTE_TEXT_LIMITS.description,
        },
      },
      required: ['label', 'description'],
      propertyOrdering: ['label', 'description'],
    },
    pillars: {
      type: 'array',
      minItems: ANIME_AI_TASTE_LIST_LIMITS.pillarsMin,
      maxItems: ANIME_AI_TASTE_LIST_LIMITS.pillarsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: ANIME_AI_TASTE_TEXT_LIMITS.name },
          kind: { type: 'string', enum: ['content', 'form'] },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: ANIME_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: ANIME_AI_TASTE_LIST_LIMITS.pillarEvidenceMin,
            maxItems: ANIME_AI_TASTE_LIST_LIMITS.evidenceMax,
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
      maxItems: ANIME_AI_TASTE_LIST_LIMITS.negativeSignalsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: ANIME_AI_TASTE_TEXT_LIMITS.name },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: ANIME_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: ANIME_AI_TASTE_LIST_LIMITS.negativeEvidenceMin,
            maxItems: ANIME_AI_TASTE_LIST_LIMITS.evidenceMax,
            items: { type: 'string', minLength: 1 },
          },
        },
        required: ['name', 'description', 'evidenceTitles'],
        propertyOrdering: ['name', 'description', 'evidenceTitles'],
      },
    },
    summary: { type: 'string', minLength: 1, maxLength: ANIME_AI_TASTE_TEXT_LIMITS.summary },
    openQuestions: {
      type: 'array',
      minItems: 0,
      maxItems: ANIME_AI_TASTE_LIST_LIMITS.openQuestionsMax,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: ANIME_AI_TASTE_TEXT_LIMITS.openQuestion,
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

/** Exposed so tests can assert parity with `AiAnimeTasteProfileSchema`. */
export function getGeminiAnimeTasteResponseSchema(): typeof GEMINI_ANIME_TASTE_RESPONSE_SCHEMA {
  return GEMINI_ANIME_TASTE_RESPONSE_SCHEMA;
}

const INVALID_JSON_MESSAGE = 'Gemini anime taste profile response was not valid JSON';

export class GeminiAnimeTasteProvider implements AnimeTasteAiProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateProfile({
    evidence,
    model,
    signal,
    deadlineAt,
  }: AnimeTasteProviderInput): Promise<unknown> {
    const modelId = normalizeGeminiModelId(model);
    const maxOutputTokens = getGeminiAnimeTasteMaxOutputTokens();
    const first = await this.generateStructuredJson({
      modelId,
      prompt: buildAnimeTastePrompt(evidence),
      temperature: 0.2,
      maxOutputTokens,
      signal,
    });

    let firstParsed: unknown;
    try {
      firstParsed = parseAnimeTasteJson(first.text);
    } catch (error) {
      if (!isInvalidJsonError(error) || signal?.aborted) {
        throw error;
      }
      console.warn(
        `[${ANIME_TASTE_LOG_SCOPE}] Gemini returned invalid JSON; retrying once.`,
        first.metadata,
      );
    }

    if (firstParsed !== undefined) {
      // The response schema mirrors the Zod contract, so a structural miss here is unexpected.
      // Retry once deterministically rather than discarding the whole generation.
      const structural = AiAnimeTasteProfileSchema.safeParse(firstParsed);
      if (structural.success) {
        return firstParsed as AiAnimeTasteProfile;
      }
      if (signal?.aborted) {
        return firstParsed;
      }

      // Gemini enforces types, enums and required fields under constrained decoding, but treats
      // string-length and array-length bounds as advisory — so the overrun that lands here is
      // almost always a length one. Naming the field turns the next occurrence into a fact
      // instead of a guess. Shape only: path, code, bound, and the received type/size.
      const issues = summarizeSchemaIssues(structural.error, firstParsed);
      console.warn(
        `[${ANIME_TASTE_LOG_SCOPE}] Gemini output missed the structural contract; retrying once.`,
        { ...first.metadata, issues },
      );

      // A retry that cannot finish before the caller's deadline is pure waste: it spends a
      // request and converts a precise `schema` failure into a `timeout`, which backs off six
      // times as long and says nothing about what went wrong.
      if (!hasBudgetForRetry(deadlineAt)) {
        console.warn(
          `[${ANIME_TASTE_LOG_SCOPE}] skipping structural retry; under ${ANIME_TASTE_RETRY_RESERVE_MS}ms of budget left.`,
        );
        return firstParsed;
      }
    }

    const retry = await this.generateStructuredJson({
      modelId,
      prompt: buildAnimeTasteRetryPrompt(evidence),
      temperature: 0,
      maxOutputTokens,
      signal,
    });

    try {
      return parseAnimeTasteJson(retry.text) as AiAnimeTasteProfile;
    } catch (error) {
      if (isInvalidJsonError(error)) {
        console.warn(
          `[${ANIME_TASTE_LOG_SCOPE}] Gemini retry returned invalid JSON.`,
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
  }): Promise<{ text: string; metadata: AnimeTasteResponseMetadata }> {
    const payload = await requestGeminiGenerateContent({
      apiKey: this.apiKey,
      modelId,
      prompt,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_ANIME_TASTE_RESPONSE_SCHEMA,
      },
      signal,
      onHttpError: (status, detail, retryAfterMs) =>
        new GeminiAnimeTasteProviderError(status, detail, retryAfterMs),
    });

    const candidate = readGeminiCandidate(payload);
    if (!candidate.text) {
      throw new Error('Gemini anime taste profile response was empty');
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

type AnimeTasteResponseMetadata = {
  finishReason: string | null;
  partCount: number;
  textLength: number;
  maxOutputTokens: number;
};

export function getGeminiAnimeTasteMaxOutputTokens(): number {
  return readClampedIntEnv('GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS', {
    fallback: DEFAULT_GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS,
    min: 2_500,
    max: 12_000,
  });
}

function hasBudgetForRetry(deadlineAt: number | undefined): boolean {
  // No deadline supplied means the caller is not enforcing one; behave as before.
  return deadlineAt === undefined || deadlineAt - Date.now() >= ANIME_TASTE_RETRY_RESERVE_MS;
}

function parseAnimeTasteJson(text: string): unknown {
  return parseStructuredJson(text, () => new Error(INVALID_JSON_MESSAGE));
}

function isInvalidJsonError(error: unknown): boolean {
  return error instanceof Error && error.message === INVALID_JSON_MESSAGE;
}

/**
 * Resolves the configured anime taste provider.
 *
 * Its own enable flag, deliberately separate from the games one: anime taste must be switchable
 * off without touching a feature that is already live, and vice versa. The model and the API key
 * are shared because they are account-level facts, not per-category ones.
 */
export function getConfiguredAnimeTasteProvider(): {
  provider: AnimeTasteAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_ANIME_TASTE_MODEL ||
      process.env.GEMINI_TASTE_MODEL ||
      DEFAULT_GEMINI_ANIME_TASTE_MODEL,
  );
  const enabled = process.env.ANIME_AI_TASTE_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiAnimeTasteProvider(apiKey), model, enabled };
}
