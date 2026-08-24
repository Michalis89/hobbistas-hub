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
import { GAMES_TASTE_LOG_SCOPE } from '../constants';
import { buildGamingTastePrompt, buildGamingTasteRetryPrompt } from './prompt';
import {
  AiGamingTasteProfileSchema,
  DEFAULT_GEMINI_TASTE_MODEL,
  GAME_AI_TASTE_LIST_LIMITS,
  GAME_AI_TASTE_SCHEMA_VERSION,
  GAME_AI_TASTE_TEXT_LIMITS,
  type AiGamingTasteProfile,
  type GameAiEvidenceDocument,
} from './types';

export { normalizeGeminiModelId };
export { buildGamingTastePrompt };

export type GameTasteProviderInput = {
  evidence: GameAiEvidenceDocument;
  model: string;
  signal?: AbortSignal;
};

export interface GameTasteAiProvider {
  generateProfile(input: GameTasteProviderInput): Promise<unknown>;
}

export const DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS = 6_000;

/**
 * A non-2xx response from Gemini on the taste path.
 *
 * Kept as its own class rather than the shared base so the taste service can distinguish a taste
 * failure from a rerank failure in a stack it did not raise, and so the message text stays stable
 * for anything reading logs.
 */
export class GeminiTasteProviderError extends AiProviderHttpError {
  constructor(status: number, detail: string | null, retryAfterMs: number | null) {
    super(
      `Gemini taste profile failed with ${status}${detail ? `: ${detail}` : ''}`,
      status,
      retryAfterMs,
    );
    this.name = 'GeminiTasteProviderError';
  }
}

/**
 * Mirrors `AiGamingTasteProfileSchema` field for field.
 *
 * Every bound Zod enforces must also appear here, or constrained decoding happily produces
 * output that Zod then rejects wholesale — a whole generation thrown away over one long string.
 * `GAME_AI_TASTE_TEXT_LIMITS` is the single source of truth for the shared numbers; keep any
 * change to one side reflected on the other.
 */
const GEMINI_TASTE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    // Zod: z.literal(1). Gemini's `enum` is string-only, so pin the integer by range.
    schemaVersion: {
      type: 'integer',
      minimum: GAME_AI_TASTE_SCHEMA_VERSION,
      maximum: GAME_AI_TASTE_SCHEMA_VERSION,
    },
    identity: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          minLength: 1,
          maxLength: GAME_AI_TASTE_TEXT_LIMITS.identityLabel,
        },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: GAME_AI_TASTE_TEXT_LIMITS.description,
        },
      },
      required: ['label', 'description'],
      propertyOrdering: ['label', 'description'],
    },
    pillars: {
      type: 'array',
      minItems: GAME_AI_TASTE_LIST_LIMITS.pillarsMin,
      maxItems: GAME_AI_TASTE_LIST_LIMITS.pillarsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: GAME_AI_TASTE_TEXT_LIMITS.name },
          kind: { type: 'string', enum: ['content', 'behavior'] },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: GAME_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: GAME_AI_TASTE_LIST_LIMITS.pillarEvidenceMin,
            maxItems: GAME_AI_TASTE_LIST_LIMITS.evidenceMax,
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
      maxItems: GAME_AI_TASTE_LIST_LIMITS.negativeSignalsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: GAME_AI_TASTE_TEXT_LIMITS.name },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: GAME_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: GAME_AI_TASTE_LIST_LIMITS.negativeEvidenceMin,
            maxItems: GAME_AI_TASTE_LIST_LIMITS.evidenceMax,
            items: { type: 'string', minLength: 1 },
          },
        },
        required: ['name', 'description', 'evidenceTitles'],
        propertyOrdering: ['name', 'description', 'evidenceTitles'],
      },
    },
    summary: { type: 'string', minLength: 1, maxLength: GAME_AI_TASTE_TEXT_LIMITS.summary },
    openQuestions: {
      type: 'array',
      minItems: 0,
      maxItems: GAME_AI_TASTE_LIST_LIMITS.openQuestionsMax,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: GAME_AI_TASTE_TEXT_LIMITS.openQuestion,
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

/** Exposed so tests can assert parity with `AiGamingTasteProfileSchema`. */
export function getGeminiTasteResponseSchema(): typeof GEMINI_TASTE_RESPONSE_SCHEMA {
  return GEMINI_TASTE_RESPONSE_SCHEMA;
}

const INVALID_JSON_MESSAGE = 'Gemini taste profile response was not valid JSON';

export class GeminiGameTasteProvider implements GameTasteAiProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateProfile({ evidence, model, signal }: GameTasteProviderInput): Promise<unknown> {
    const modelId = normalizeGeminiModelId(model);
    const maxOutputTokens = getGeminiTasteMaxOutputTokens();
    const first = await this.generateStructuredJson({
      modelId,
      prompt: buildGamingTastePrompt(evidence),
      temperature: 0.2,
      maxOutputTokens,
      signal,
    });

    let firstParsed: unknown;
    try {
      firstParsed = parseTasteJson(first.text);
    } catch (error) {
      if (!isInvalidJsonError(error) || signal?.aborted) {
        throw error;
      }
      console.warn(
        `[${GAMES_TASTE_LOG_SCOPE}] Gemini returned invalid JSON; retrying once.`,
        first.metadata,
      );
    }

    if (firstParsed !== undefined) {
      // The response schema mirrors the Zod contract, so a structural miss here is unexpected.
      // Retry once deterministically rather than discarding the whole generation.
      if (AiGamingTasteProfileSchema.safeParse(firstParsed).success) {
        return firstParsed as AiGamingTasteProfile;
      }
      if (signal?.aborted) {
        return firstParsed;
      }
      console.warn(
        `[${GAMES_TASTE_LOG_SCOPE}] Gemini output missed the structural contract; retrying once.`,
        first.metadata,
      );
    }

    const retry = await this.generateStructuredJson({
      modelId,
      prompt: buildGamingTasteRetryPrompt(evidence),
      temperature: 0,
      maxOutputTokens,
      signal,
    });

    try {
      return parseTasteJson(retry.text) as AiGamingTasteProfile;
    } catch (error) {
      if (isInvalidJsonError(error)) {
        console.warn(`[${GAMES_TASTE_LOG_SCOPE}] Gemini retry returned invalid JSON.`, retry.metadata);
      }
      // Nothing usable from the retry either; surface the first attempt so the service can
      // report a precise validation category instead of a generic provider error.
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
  }): Promise<{ text: string; metadata: GeminiResponseMetadata }> {
    const payload = await requestGeminiGenerateContent({
      apiKey: this.apiKey,
      modelId,
      prompt,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_TASTE_RESPONSE_SCHEMA,
      },
      signal,
      onHttpError: (status, detail, retryAfterMs) =>
        new GeminiTasteProviderError(status, detail, retryAfterMs),
    });

    const candidate = readGeminiCandidate(payload);
    if (!candidate.text) {
      throw new Error('Gemini taste profile response was empty');
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

export function getGeminiTasteMaxOutputTokens(): number {
  return readClampedIntEnv('GEMINI_TASTE_MAX_OUTPUT_TOKENS', {
    fallback: DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS,
    min: 2_500,
    max: 12_000,
  });
}

type GeminiResponseMetadata = {
  finishReason: string | null;
  partCount: number;
  textLength: number;
  maxOutputTokens: number;
};

function parseTasteJson(text: string): unknown {
  return parseStructuredJson(text, () => new Error(INVALID_JSON_MESSAGE));
}

function isInvalidJsonError(error: unknown): boolean {
  return error instanceof Error && error.message === INVALID_JSON_MESSAGE;
}

export function getConfiguredGameTasteProvider(): {
  provider: GameTasteAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(process.env.GEMINI_TASTE_MODEL || DEFAULT_GEMINI_TASTE_MODEL);
  const enabled = process.env.GAMING_AI_TASTE_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiGameTasteProvider(apiKey), model, enabled };
}
