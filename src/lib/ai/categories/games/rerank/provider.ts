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
import { GAMES_RERANK_LOG_SCOPE } from '../constants';
import { buildRerankPrompt } from './prompt';
import {
  DEFAULT_GEMINI_RERANK_MODEL,
  GAME_RERANK_SCHEMA_VERSION,
  GAME_RERANK_TEXT_LIMITS,
  type GameRerankRequestPayload,
} from './types';

export { normalizeGeminiModelId };
export { buildRerankPrompt };

export type GameRerankProviderInput = {
  payload: GameRerankRequestPayload;
  /** Exactly the tokens issued this run; pins the `candidateId` enum. */
  tokens: readonly string[];
  model: string;
  signal?: AbortSignal;
};

export interface GameRerankAiProvider {
  rerank(input: GameRerankProviderInput): Promise<unknown>;
}

/**
 * Must cover reasoning tokens as well as the JSON.
 *
 * Lowering this to 2,500 on the theory that ~700 tokens of ranking needed little headroom produced
 * a truncated body and a `malformed_json` failure at 9.8s: on a thinking model the reasoning is
 * charged to the same budget, so a cap sized for the visible answer cuts the answer off. Sized
 * back to match the taste provider, which has run against this family without truncating.
 */
export const DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS = 6_000;

export class GeminiRerankProviderError extends AiProviderHttpError {
  constructor(status: number, detail: string | null, retryAfterMs: number | null) {
    super(`Gemini rerank failed with ${status}${detail ? `: ${detail}` : ''}`, status, retryAfterMs);
    this.name = 'GeminiRerankProviderError';
  }
}

/**
 * Mirrors `AiGameRerankResultSchema` field for field.
 *
 * The `candidateId` enum is the load-bearing part: pinning it to exactly the tokens issued this
 * run makes a hallucinated candidate structurally impossible rather than merely detectable, which
 * is the whole reason candidates travel as opaque tokens instead of media ids.
 */
export function buildGeminiRerankResponseSchema(tokens: readonly string[]) {
  const count = tokens.length;
  return {
    type: 'object',
    properties: {
      // Zod: z.literal(1). Gemini's `enum` is string-only, so pin the integer by range.
      schemaVersion: {
        type: 'integer',
        minimum: GAME_RERANK_SCHEMA_VERSION,
        maximum: GAME_RERANK_SCHEMA_VERSION,
      },
      ranking: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          properties: {
            candidateId: { type: 'string', enum: [...tokens] },
            rank: { type: 'integer', minimum: 1, maximum: count },
            rationale: {
              type: 'string',
              minLength: 1,
              maxLength: GAME_RERANK_TEXT_LIMITS.rationale,
            },
          },
          required: ['candidateId', 'rank', 'rationale'],
          propertyOrdering: ['candidateId', 'rank', 'rationale'],
        },
      },
    },
    required: ['schemaVersion', 'ranking'],
    propertyOrdering: ['schemaVersion', 'ranking'],
  } as const;
}

export class GeminiGameRerankProvider implements GameRerankAiProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async rerank({ payload, tokens, model, signal }: GameRerankProviderInput): Promise<unknown> {
    const maxOutputTokens = getGeminiRerankMaxOutputTokens();
    const body = await requestGeminiGenerateContent({
      apiKey: this.apiKey,
      modelId: normalizeGeminiModelId(model),
      prompt: buildRerankPrompt(payload),
      generationConfig: {
        // Ranking is not a creative task, and a reproducible answer makes the cache honest.
        temperature: 0,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: buildGeminiRerankResponseSchema(tokens),
        ...buildThinkingConfig(),
      },
      signal,
      onHttpError: (status, detail, retryAfterMs) =>
        new GeminiRerankProviderError(status, detail, retryAfterMs),
    });

    const { text, finishReason } = readGeminiCandidate(body);

    // Distinguish "we cut the model off" from "the model wrote something unparseable". These
    // demand opposite responses — raise the budget versus fix the contract — and both previously
    // surfaced as the same malformed_json category.
    if (finishReason === 'MAX_TOKENS') {
      throw new GeminiRerankTruncatedError(maxOutputTokens, text.length);
    }

    if (!text) {
      throw new Error(`Gemini rerank response was empty (finishReason: ${finishReason ?? 'none'})`);
    }

    try {
      return parseStructuredJson(text, () => new GeminiRerankJsonError());
    } catch (error) {
      // Shape only — never the response body itself.
      console.warn(
        `[${GAMES_RERANK_LOG_SCOPE}] unparseable body: finishReason=${finishReason ?? 'none'}, chars=${text.length}`,
      );
      throw error;
    }
  }
}

/**
 * Reasoning budget for the ranking call.
 *
 * Three live runs put the cost squarely here: cutting the candidate set from twenty to twelve
 * moved latency by seven milliseconds, while the one run that completed did so only because it
 * hit a token cap and stopped. The model spends thousands of tokens reasoning before it emits any
 * JSON, and neither a shorter list nor a shorter rationale touches that.
 *
 * Ranking twelve games against a taste profile does not need extended reasoning, so this asks for
 * none. `GEMINI_RERANK_THINKING_BUDGET=off` omits the field entirely — the escape hatch if the
 * configured model rejects it, which shows up as an immediate, free 400 rather than a slow
 * failure.
 */
export const DEFAULT_GEMINI_RERANK_THINKING_BUDGET = 0;

export function getGeminiRerankThinkingBudget(): number | null {
  const raw = process.env.GEMINI_RERANK_THINKING_BUDGET;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_GEMINI_RERANK_THINKING_BUDGET;
  }
  if (raw.trim().toLowerCase() === 'off') {
    return null;
  }
  const configured = Number(raw);
  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_GEMINI_RERANK_THINKING_BUDGET;
  }
  return Math.min(Math.floor(configured), 8_192);
}

function buildThinkingConfig(): { thinkingConfig?: { thinkingBudget: number } } {
  const thinkingBudget = getGeminiRerankThinkingBudget();
  return thinkingBudget === null ? {} : { thinkingConfig: { thinkingBudget } };
}

export function getGeminiRerankMaxOutputTokens(): number {
  return readClampedIntEnv('GEMINI_RERANK_MAX_OUTPUT_TOKENS', {
    fallback: DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS,
    min: 1_500,
    max: 12_000,
  });
}

export class GeminiRerankJsonError extends Error {
  constructor() {
    super('Gemini rerank response was not valid JSON');
    this.name = 'GeminiRerankJsonError';
  }
}

/** The generation hit `maxOutputTokens`; the body is a fragment, not a malformed answer. */
export class GeminiRerankTruncatedError extends Error {
  readonly maxOutputTokens: number;
  readonly textLength: number;

  constructor(maxOutputTokens: number, textLength: number) {
    super(`Gemini rerank output truncated at ${maxOutputTokens} tokens (${textLength} chars)`);
    this.name = 'GeminiRerankTruncatedError';
    this.maxOutputTokens = maxOutputTokens;
    this.textLength = textLength;
  }
}

/**
 * Resolves the configured provider.
 *
 * No silent model fallback: the model id is whatever is configured, and it is recorded on every
 * shadow run and folded into the cache key. A shadow corpus whose rows cannot say which model
 * produced them is not evidence of anything.
 */
export function getConfiguredGameRerankProvider(): {
  provider: GameRerankAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_RERANK_MODEL || DEFAULT_GEMINI_RERANK_MODEL,
  );
  const enabled = process.env.GAMES_RERANK_SHADOW_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiGameRerankProvider(apiKey), model, enabled };
}
