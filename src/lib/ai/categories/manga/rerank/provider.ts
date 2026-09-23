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
import { MANGA_RERANK_LOG_SCOPE } from '../constants';
import { buildMangaRerankPrompt } from './prompt';
import {
  DEFAULT_GEMINI_MANGA_RERANK_MODEL,
  MANGA_RERANK_CONTRACT,
  type MangaRerankCandidatePayload,
} from './types';

export { normalizeGeminiModelId };

export type MangaRerankProviderInput = RerankProviderInput<MangaRerankCandidatePayload>;
export type MangaRerankAiProvider = RerankAiProvider<MangaRerankCandidatePayload>;

export const MANGA_RERANK_MAX_OUTPUT_TOKENS_ENV = 'GEMINI_MANGA_RERANK_MAX_OUTPUT_TOKENS';
export const MANGA_RERANK_THINKING_BUDGET_ENV = 'GEMINI_MANGA_RERANK_THINKING_BUDGET';

/** Mirrors `AiMangaRerankResultSchema` field for field, pinned to the tokens issued this run. */
export function buildGeminiMangaRerankResponseSchema(tokens: readonly string[]) {
  return buildGeminiRankingResponseSchema(tokens, MANGA_RERANK_CONTRACT);
}

export function getGeminiMangaRerankMaxOutputTokens(): number {
  return readGeminiRerankMaxOutputTokens(MANGA_RERANK_MAX_OUTPUT_TOKENS_ENV);
}

export function getGeminiMangaRerankThinkingBudget(): number | null {
  return readGeminiRerankThinkingBudget(MANGA_RERANK_THINKING_BUDGET_ENV);
}

export class GeminiMangaRerankProvider extends GeminiRerankProvider<MangaRerankCandidatePayload> {
  constructor(apiKey: string) {
    super(apiKey, {
      logScope: MANGA_RERANK_LOG_SCOPE,
      contract: MANGA_RERANK_CONTRACT,
      buildPrompt: buildMangaRerankPrompt,
      maxOutputTokensEnv: MANGA_RERANK_MAX_OUTPUT_TOKENS_ENV,
      thinkingBudgetEnv: MANGA_RERANK_THINKING_BUDGET_ENV,
    });
  }
}

/**
 * Resolves the configured provider.
 *
 * `MANGA_RERANK_SHADOW_ENABLED` is its own variable rather than a shared AI flag: manga taste being
 * live must never be what turns manga reranking on, which is the same separation the capability
 * registry enforces one layer up.
 */
export function getConfiguredMangaRerankProvider(): {
  provider: MangaRerankAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_MANGA_RERANK_MODEL || DEFAULT_GEMINI_MANGA_RERANK_MODEL,
  );
  const enabled = process.env.MANGA_RERANK_SHADOW_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiMangaRerankProvider(apiKey), model, enabled };
}
