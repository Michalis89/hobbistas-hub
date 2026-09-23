import 'server-only';

import { buildGeminiRankingResponseSchema } from '@/lib/ai/shared/rank/contract';
import {
  GeminiRerankProvider,
  normalizeGeminiModelId,
  readGeminiRerankMaxOutputTokens,
  readGeminiRerankThinkingBudget,
  type RerankAiProvider,
  type RerankProviderInput,
} from '@/lib/ai/shared/rank/rerank-provider';
import { resolveGeminiApiKey } from '@/lib/ai/shared/provider/gemini';
import { ANIME_RERANK_LOG_SCOPE } from '../constants';
import { buildAnimeRerankPrompt } from './prompt';
import {
  ANIME_RERANK_CONTRACT,
  DEFAULT_GEMINI_ANIME_RERANK_MODEL,
  type AnimeRerankCandidatePayload,
} from './types';

export { normalizeGeminiModelId };

export type AnimeRerankProviderInput = RerankProviderInput<AnimeRerankCandidatePayload>;
export type AnimeRerankAiProvider = RerankAiProvider<AnimeRerankCandidatePayload>;

/**
 * Its own env names rather than games'.
 *
 * The two calls are the same shape but not the same spend: anime may end up on a different model,
 * and sharing one budget variable would mean tuning one category by changing the other's latency.
 */
export const ANIME_RERANK_MAX_OUTPUT_TOKENS_ENV = 'GEMINI_ANIME_RERANK_MAX_OUTPUT_TOKENS';
export const ANIME_RERANK_THINKING_BUDGET_ENV = 'GEMINI_ANIME_RERANK_THINKING_BUDGET';

/** Mirrors `AiAnimeRerankResultSchema` field for field, pinned to the tokens issued this run. */
export function buildGeminiAnimeRerankResponseSchema(tokens: readonly string[]) {
  return buildGeminiRankingResponseSchema(tokens, ANIME_RERANK_CONTRACT);
}

export function getGeminiAnimeRerankMaxOutputTokens(): number {
  return readGeminiRerankMaxOutputTokens(ANIME_RERANK_MAX_OUTPUT_TOKENS_ENV);
}

export function getGeminiAnimeRerankThinkingBudget(): number | null {
  return readGeminiRerankThinkingBudget(ANIME_RERANK_THINKING_BUDGET_ENV);
}

export class GeminiAnimeRerankProvider extends GeminiRerankProvider<AnimeRerankCandidatePayload> {
  constructor(apiKey: string) {
    super(apiKey, {
      logScope: ANIME_RERANK_LOG_SCOPE,
      contract: ANIME_RERANK_CONTRACT,
      buildPrompt: buildAnimeRerankPrompt,
      maxOutputTokensEnv: ANIME_RERANK_MAX_OUTPUT_TOKENS_ENV,
      thinkingBudgetEnv: ANIME_RERANK_THINKING_BUDGET_ENV,
    });
  }
}

/**
 * Resolves the configured provider.
 *
 * Two independent switches, and both must be on. `ANIME_RERANK_SHADOW_ENABLED` is its own variable
 * rather than a shared AI flag: anime taste being live must never be what turns anime reranking on,
 * which is the same separation the capability registry enforces one layer up.
 *
 * No silent model fallback: the model id is whatever is configured, is recorded on every shadow run
 * and is folded into the cache key. A corpus whose rows cannot say which model produced them is not
 * evidence of anything.
 */
export function getConfiguredAnimeRerankProvider(): {
  provider: AnimeRerankAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_ANIME_RERANK_MODEL || DEFAULT_GEMINI_ANIME_RERANK_MODEL,
  );
  const enabled = process.env.ANIME_RERANK_SHADOW_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiAnimeRerankProvider(apiKey), model, enabled };
}
