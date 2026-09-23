import type { RerankTokenMap } from './tokens';
import {
  summarizeIssues,
  validateRankingStructure,
  type RankingFailureCategory,
} from './ranking-validation';
import { buildRankingResultSchema, type RankingContractConfig } from './contract';

/**
 * Validating one provider ranking, end to end.
 *
 * Three layers, in order, and the order is the point: the contract decides what a well-formed
 * answer looks like, the structural check decides whether that answer is a permutation of the
 * question, and only then is rationale text touched. A ranking is never partially repaired — see
 * `validateRankingStructure` — while a rationale is normalised rather than rejected, because a
 * stray percentage is a formatting slip and not a broken ordering.
 */

export type RerankFailureCategory =
  | 'malformed_json'
  | 'schema_validation'
  | RankingFailureCategory;

export type RerankRanking = {
  /** Media ids in AI-preferred order, best first. */
  order: number[];
  /** mediaId → one-line reason. Model text about the user's taste: never logged. */
  rationales: Record<number, string>;
};

export type RerankValidationFailure = {
  success: false;
  category: RerankFailureCategory;
  /** Shape-only. Never contains generated text. */
  reason: string;
};

export type RerankValidationSuccess = {
  success: true;
  ranking: RerankRanking;
  /** Rationales that were normalised rather than rejected. Counts only, for log visibility. */
  normalizedRationales: number;
};

export type RerankValidationResult = RerankValidationSuccess | RerankValidationFailure;

/**
 * Strips presentation problems a rationale is allowed to have.
 *
 * A stray percentage or an over-long sentence is a formatting slip, not a broken ranking —
 * discarding a whole generation over one is a bad trade. The ranking itself gets no such latitude.
 */
export function normalizeRationaleText(
  rationale: string,
  maxChars: number,
): { text: string; changed: boolean } {
  const original = rationale;
  let text = rationale.replace(/\s+/g, ' ').trim();

  // No model-generated numeric confidence, in any form, even in prose we only store.
  text = text.replace(/\b\d{1,3}\s?%/g, '').replace(/\bconfidence[:\s]*\d+(\.\d+)?\b/gi, '');
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();

  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 1).trimEnd()}…`;
  }

  return { text, changed: text !== original };
}

export function validateRerankResult(
  raw: unknown,
  tokenMap: RerankTokenMap,
  config: RankingContractConfig,
): RerankValidationResult {
  const parsed = buildRankingResultSchema(config).safeParse(raw);
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
    const { text, changed } = normalizeRationaleText(entry.rationale, config.rationaleMaxChars);
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

export { summarizeIssues };
