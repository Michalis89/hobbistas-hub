import 'server-only';

import {
  buildGeminiRankingResponseSchema,
} from '@/lib/ai/shared/rank/contract';
import {
  GeminiRerankJsonError,
  GeminiRerankProvider,
  GeminiRerankProviderError,
  GeminiRerankTruncatedError,
  DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS,
  DEFAULT_GEMINI_RERANK_THINKING_BUDGET,
  normalizeGeminiModelId,
  readGeminiRerankMaxOutputTokens,
  readGeminiRerankThinkingBudget,
  type RerankAiProvider,
  type RerankProviderInput,
} from '@/lib/ai/shared/rank/rerank-provider';
import { resolveGeminiApiKey } from '@/lib/ai/shared/provider/gemini';
import { GAMES_RERANK_LOG_SCOPE } from '../constants';
import { buildRerankPrompt } from './prompt';
import {
  DEFAULT_GEMINI_RERANK_MODEL,
  GAME_RERANK_CONTRACT,
  type GameRerankCandidatePayload,
} from './types';

export { normalizeGeminiModelId };
export { buildRerankPrompt };
export {
  GeminiRerankJsonError,
  GeminiRerankProviderError,
  GeminiRerankTruncatedError,
  DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS,
  DEFAULT_GEMINI_RERANK_THINKING_BUDGET,
};

export type GameRerankProviderInput = RerankProviderInput<GameRerankCandidatePayload>;
export type GameRerankAiProvider = RerankAiProvider<GameRerankCandidatePayload>;

/** Env names for the two knobs that decide latency on this call. */
export const GAMES_RERANK_MAX_OUTPUT_TOKENS_ENV = 'GEMINI_RERANK_MAX_OUTPUT_TOKENS';
export const GAMES_RERANK_THINKING_BUDGET_ENV = 'GEMINI_RERANK_THINKING_BUDGET';

/** Mirrors `AiGameRerankResultSchema` field for field, pinned to the tokens issued this run. */
export function buildGeminiRerankResponseSchema(tokens: readonly string[]) {
  return buildGeminiRankingResponseSchema(tokens, GAME_RERANK_CONTRACT);
}

export function getGeminiRerankMaxOutputTokens(): number {
  return readGeminiRerankMaxOutputTokens(GAMES_RERANK_MAX_OUTPUT_TOKENS_ENV);
}

export function getGeminiRerankThinkingBudget(): number | null {
  return readGeminiRerankThinkingBudget(GAMES_RERANK_THINKING_BUDGET_ENV);
}

export class GeminiGameRerankProvider extends GeminiRerankProvider<GameRerankCandidatePayload> {
  constructor(apiKey: string) {
    super(apiKey, {
      logScope: GAMES_RERANK_LOG_SCOPE,
      contract: GAME_RERANK_CONTRACT,
      buildPrompt: buildRerankPrompt,
      maxOutputTokensEnv: GAMES_RERANK_MAX_OUTPUT_TOKENS_ENV,
      thinkingBudgetEnv: GAMES_RERANK_THINKING_BUDGET_ENV,
    });
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
