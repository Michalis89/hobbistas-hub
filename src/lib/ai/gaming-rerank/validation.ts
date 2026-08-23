import { AiGameRerankResultSchema, GAME_RERANK_TEXT_LIMITS, type GameRerankRanking } from './types';
import type { GameRerankTokenMap } from './payload';

export type GameRerankFailureCategory =
  | 'malformed_json'
  | 'schema_validation'
  | 'unknown_token'
  | 'duplicate_token'
  | 'missing_token'
  | 'count_mismatch'
  | 'rank_not_permutation';

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

export type GameRerankValidationResult =
  | GameRerankValidationSuccess
  | GameRerankValidationFailure;

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

  const entries = parsed.data.ranking;
  const issued = tokenMap.tokens;

  if (entries.length !== issued.length) {
    return {
      success: false,
      category: 'count_mismatch',
      reason: `expected ${issued.length} entries, received ${entries.length}`,
    };
  }

  const issuedSet = new Set(issued);
  const seenTokens = new Set<string>();

  for (const entry of entries) {
    if (!issuedSet.has(entry.candidateId)) {
      return { success: false, category: 'unknown_token', reason: 'candidateId was not issued' };
    }
    if (seenTokens.has(entry.candidateId)) {
      return { success: false, category: 'duplicate_token', reason: 'candidateId appeared twice' };
    }
    seenTokens.add(entry.candidateId);
  }

  if (seenTokens.size !== issuedSet.size) {
    return { success: false, category: 'missing_token', reason: 'not every candidateId returned' };
  }

  const ranks = entries.map(entry => entry.rank).sort((a, b) => a - b);
  const isPermutation = ranks.every((rank, index) => rank === index + 1);
  if (!isPermutation) {
    return {
      success: false,
      category: 'rank_not_permutation',
      reason: `ranks are not 1..${entries.length}`,
    };
  }

  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const order: number[] = [];
  const rationales: Record<number, string> = {};
  let normalizedRationales = 0;

  for (const entry of ordered) {
    const mediaId = tokenMap.toMediaId.get(entry.candidateId);
    if (mediaId === undefined) {
      // Unreachable given the issued-token check above; treated as a hard failure rather than
      // silently dropping a candidate.
      return { success: false, category: 'unknown_token', reason: 'candidateId had no media id' };
    }
    const { text, changed } = normalizeRationale(entry.rationale);
    if (changed) {
      normalizedRationales += 1;
    }
    order.push(mediaId);
    rationales[mediaId] = text;
  }

  return { success: true, ranking: { order, rationales }, normalizedRationales };
}

/** Field paths and codes only — deliberately no received values, which would be generated text. */
export function summarizeIssues(
  issues: Array<{ path: PropertyKey[]; code: string }>,
): string {
  return issues
    .slice(0, 5)
    .map(issue => `${issue.path.map(String).join('.') || '<root>'}:${issue.code}`)
    .join(', ');
}
