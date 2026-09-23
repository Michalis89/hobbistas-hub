import 'server-only';

import { readClampedIntEnv } from '@/lib/ai/shared/env';
import { AiProviderHttpError } from '@/lib/ai/shared/provider/errors';
import {
  normalizeGeminiModelId,
  readGeminiCandidate,
  requestGeminiGenerateContent,
} from '@/lib/ai/shared/provider/gemini';
import { parseStructuredJson } from '@/lib/ai/shared/structured-output';
import { buildGeminiRankingResponseSchema, type RankingContractConfig } from './contract';
import type { RerankRequestPayload } from './rerank-payload';

export { normalizeGeminiModelId };

/**
 * The Gemini transport for a ranking call.
 *
 * Category-independent on purpose: the request differs only in the prose of its prompt and the two
 * numbers in its contract, both of which arrive as configuration. What is *not* configurable is
 * the part that makes the answer trustworthy — temperature zero, constrained decoding against an
 * enum of exactly the tokens issued this run, and truncation reported as its own failure rather
 * than as malformed output.
 */

export type RerankProviderInput<TCandidate> = {
  payload: RerankRequestPayload<TCandidate>;
  /** Exactly the tokens issued this run; pins the `candidateId` enum. */
  tokens: readonly string[];
  model: string;
  signal?: AbortSignal;
};

export interface RerankAiProvider<TCandidate> {
  rerank(input: RerankProviderInput<TCandidate>): Promise<unknown>;
}

/**
 * Must cover reasoning tokens as well as the JSON.
 *
 * Lowering this to 2,500 on the theory that ~700 tokens of ranking needed little headroom produced
 * a truncated body and a `malformed_json` failure at 9.8s: on a thinking model the reasoning is
 * charged to the same budget, so a cap sized for the visible answer cuts the answer off.
 */
export const DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS = 6_000;

/**
 * Reasoning budget for the ranking call.
 *
 * Three live runs put the cost squarely here: cutting the candidate set from twenty to twelve
 * moved latency by seven milliseconds, while the one run that completed did so only because it hit
 * a token cap and stopped. Ranking a short list against a taste profile does not need extended
 * reasoning, so this asks for none. `off` omits the field entirely — the escape hatch if the
 * configured model rejects it, which shows up as an immediate, free 400 rather than a slow failure.
 */
export const DEFAULT_GEMINI_RERANK_THINKING_BUDGET = 0;

export class GeminiRerankProviderError extends AiProviderHttpError {
  constructor(status: number, detail: string | null, retryAfterMs: number | null) {
    super(`Gemini rerank failed with ${status}${detail ? `: ${detail}` : ''}`, status, retryAfterMs);
    this.name = 'GeminiRerankProviderError';
  }
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
 * Names the provider failure precisely enough to act on.
 *
 * `output_truncated` and `malformed_json` are deliberately separate: one says raise the token
 * budget, the other says the contract is wrong. Collapsing them sent the first live truncation to
 * the wrong diagnosis.
 */
export function classifyRerankProviderError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'provider';
  }
  if (error.name === 'GeminiRerankTruncatedError') {
    return 'output_truncated';
  }
  if (error.name === 'GeminiRerankJsonError') {
    return 'malformed_json';
  }
  return 'provider';
}

export type RerankProviderConfig<TCandidate> = {
  logScope: string;
  contract: RankingContractConfig;
  buildPrompt: (payload: RerankRequestPayload<TCandidate>) => string;
  /** Env var names, so a category can size its own call without a second transport. */
  maxOutputTokensEnv: string;
  thinkingBudgetEnv: string;
};

export function readGeminiRerankMaxOutputTokens(envName: string): number {
  return readClampedIntEnv(envName, {
    fallback: DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS,
    min: 1_500,
    max: 12_000,
  });
}

export function readGeminiRerankThinkingBudget(envName: string): number | null {
  const raw = process.env[envName];
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

export class GeminiRerankProvider<TCandidate> implements RerankAiProvider<TCandidate> {
  private readonly apiKey: string;
  private readonly config: RerankProviderConfig<TCandidate>;

  constructor(apiKey: string, config: RerankProviderConfig<TCandidate>) {
    this.apiKey = apiKey;
    this.config = config;
  }

  async rerank({ payload, tokens, model, signal }: RerankProviderInput<TCandidate>): Promise<unknown> {
    const { logScope, contract, buildPrompt, maxOutputTokensEnv, thinkingBudgetEnv } = this.config;
    const maxOutputTokens = readGeminiRerankMaxOutputTokens(maxOutputTokensEnv);
    const thinkingBudget = readGeminiRerankThinkingBudget(thinkingBudgetEnv);

    const body = await requestGeminiGenerateContent({
      apiKey: this.apiKey,
      modelId: normalizeGeminiModelId(model),
      prompt: buildPrompt(payload),
      generationConfig: {
        // Ranking is not a creative task, and a reproducible answer makes the cache honest.
        temperature: 0,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: buildGeminiRankingResponseSchema(tokens, contract),
        ...(thinkingBudget === null ? {} : { thinkingConfig: { thinkingBudget } }),
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
        `[${logScope}] unparseable body: finishReason=${finishReason ?? 'none'}, chars=${text.length}`,
      );
      throw error;
    }
  }
}
