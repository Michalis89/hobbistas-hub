import {
  summarizeIssues,
  validateRankingStructure,
  type RankingFailureCategory,
} from '@/lib/ai/shared/rank/ranking-validation';
import { AiGameRerankResultSchema, GAME_RERANK_TEXT_LIMITS, type GameRerankRanking } from './types';
import type { GameRerankTokenMap } from './payload';

export { summarizeIssues };

/**
 * Why a ranking was rejected.
 *
 * `malformed_json` and `schema_validation` are the games contract's own; the permutation
 * categories come from the shared structural check, which is the part every category shares.
 */
export type GameRerankFailureCategory =
  | 'malformed_json'
  | 'schema_validation'
  | RankingFailureCategory;

export type GameRerankValidationFailure = {
  success: false;
  category: GameRerankFailureCategory;
  /** Shape-only. Never contains generated text. */
  reason: string;
};

export type GameRerankValidationSuccess = {
  success: true;
  ranking: GameRerankRanking;
  /** Rationales that were normalised rather than rejected. Names only, for log visibility. */
  normalizedRationales: number;
};

export type GameRerankValidationResult = GameRerankValidationSuccess | GameRerankValidationFailure;

/**
 * Strips presentation problems a rationale is allowed to have.
 *
 * A stray percentage or an over-long sentence is a formatting slip, not a broken ranking —
 * discarding a whole generation over one is a bad trade. The ranking itself gets no such
 * latitude: see below.
 */
export function normalizeRationale(rationale: string): { text: string; changed: boolean } {
  const original = rationale;
  let text = rationale.replace(/\s+/g, ' ').trim();

  // No model-generated numeric confidence, in any form, even in prose we only store.
  text = text.replace(/\b\d{1,3}\s?%/g, '').replace(/\bconfidence[:\s]*\d+(\.\d+)?\b/gi, '');
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();

  if (text.length > GAME_RERANK_TEXT_LIMITS.rationale) {
    text = `${text.slice(0, GAME_RERANK_TEXT_LIMITS.rationale - 1).trimEnd()}…`;
  }

  return { text, changed: text !== original };
}

/**
 * Validates a provider ranking against the tokens that were actually issued.
 *
 * Two layers, deliberately: the games Zod contract decides what a well-formed answer looks like,
 * and the shared structural check decides whether that answer is a permutation of the question.
 * Only the first is games-specific — rationale bounds mean nothing to a category that does not
 * ask for rationales.
 *
 * Whole-or-nothing by design. There is no partial repair and, in particular, no filling of
 * missing candidates from deterministic order: a rerank patched with the ordering it was meant to
 * be compared against would quietly manufacture agreement, which is worse than no data at all.
 */
export function validateGameRerankResult(
  raw: unknown,
  tokenMap: GameRerankTokenMap,
): GameRerankValidationResult {
  const parsed = AiGameRerankResultSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      category: 'schema_validation',
      reason: summarizeIssues(parsed.error.issues),
    };
  }

  const structure = validateRankingStructure(parsed.data.ranking, tokenMap);
  if (!structure.ok) {
    return { success: false, category: structure.category, reason: structure.reason };
  }

  const rationales: Record<number, string> = {};
  let normalizedRationales = 0;

  structure.ordered.forEach((entry, index) => {
    const mediaId = structure.order[index];
    const { text, changed } = normalizeRationale(entry.rationale);
    if (changed) {
      normalizedRationales += 1;
    }
    rationales[mediaId] = text;
  });

  return {
    success: true,
    ranking: { order: structure.order, rationales },
    normalizedRationales,
  };
}
