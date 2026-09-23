import {
  normalizeRationaleText,
  summarizeIssues,
  validateRerankResult,
  type RerankFailureCategory,
  type RerankValidationResult,
} from '@/lib/ai/shared/rank/rerank-validation';
import { GAME_RERANK_CONTRACT, GAME_RERANK_TEXT_LIMITS } from './types';
import type { GameRerankTokenMap } from './payload';

export { summarizeIssues };

/** Why a ranking was rejected. Structural categories come from the shared permutation check. */
export type GameRerankFailureCategory = RerankFailureCategory;

export type GameRerankValidationResult = RerankValidationResult;

/** Games binding: the rationale cap is the only category-specific input. */
export function normalizeRationale(rationale: string): { text: string; changed: boolean } {
  return normalizeRationaleText(rationale, GAME_RERANK_TEXT_LIMITS.rationale);
}

export function validateGameRerankResult(
  raw: unknown,
  tokenMap: GameRerankTokenMap,
): GameRerankValidationResult {
  return validateRerankResult(raw, tokenMap, GAME_RERANK_CONTRACT);
}
