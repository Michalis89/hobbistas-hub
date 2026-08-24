import type { RerankTokenMap } from './tokens';

/**
 * Structural validation of a model ranking against the tokens actually issued.
 *
 * Whole-or-nothing by design. There is no partial repair and, in particular, no filling of missing
 * candidates from deterministic order: a rerank patched with the ordering it was meant to be
 * compared against would quietly manufacture agreement, which is worse than no data at all.
 *
 * Deliberately says nothing about rationales or any other per-category field — it checks that the
 * answer is a permutation of the question, which is true for every category.
 */

export type RankingFailureCategory =
  | 'unknown_token'
  | 'duplicate_token'
  | 'missing_token'
  | 'count_mismatch'
  | 'rank_not_permutation';

export type RankingEntry = {
  candidateId: string;
  rank: number;
};

export type RankingStructureFailure = {
  ok: false;
  category: RankingFailureCategory;
  /** Shape-only. Never contains generated text. */
  reason: string;
};

export type RankingStructureSuccess<TEntry extends RankingEntry> = {
  ok: true;
  /** The supplied entries sorted by rank, best first. */
  ordered: TEntry[];
  /** Media ids in ranked order, resolved through the token map. */
  order: number[];
};

export function validateRankingStructure<TEntry extends RankingEntry>(
  entries: readonly TEntry[],
  tokenMap: RerankTokenMap,
): RankingStructureSuccess<TEntry> | RankingStructureFailure {
  const issued = tokenMap.tokens;

  if (entries.length !== issued.length) {
    return {
      ok: false,
      category: 'count_mismatch',
      reason: `expected ${issued.length} entries, received ${entries.length}`,
    };
  }

  const issuedSet = new Set(issued);
  const seenTokens = new Set<string>();

  for (const entry of entries) {
    if (!issuedSet.has(entry.candidateId)) {
      return { ok: false, category: 'unknown_token', reason: 'candidateId was not issued' };
    }
    if (seenTokens.has(entry.candidateId)) {
      return { ok: false, category: 'duplicate_token', reason: 'candidateId appeared twice' };
    }
    seenTokens.add(entry.candidateId);
  }

  if (seenTokens.size !== issuedSet.size) {
    return { ok: false, category: 'missing_token', reason: 'not every candidateId returned' };
  }

  const ranks = entries.map(entry => entry.rank).sort((a, b) => a - b);
  const isPermutation = ranks.every((rank, index) => rank === index + 1);
  if (!isPermutation) {
    return {
      ok: false,
      category: 'rank_not_permutation',
      reason: `ranks are not 1..${entries.length}`,
    };
  }

  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const order: number[] = [];

  for (const entry of ordered) {
    const mediaId = tokenMap.toMediaId.get(entry.candidateId);
    if (mediaId === undefined) {
      // Unreachable given the issued-token check above; treated as a hard failure rather than
      // silently dropping a candidate.
      return { ok: false, category: 'unknown_token', reason: 'candidateId had no media id' };
    }
    order.push(mediaId);
  }

  return { ok: true, ordered, order };
}

/** Field paths and codes only — deliberately no received values, which would be generated text. */
export function summarizeIssues(issues: Array<{ path: PropertyKey[]; code: string }>): string {
  return issues
    .slice(0, 5)
    .map(issue => `${issue.path.map(String).join('.') || '<root>'}:${issue.code}`)
    .join(', ');
}
