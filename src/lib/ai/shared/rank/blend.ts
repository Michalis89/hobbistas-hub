/**
 * Combining a deterministic ordering with a model ordering.
 *
 * Pure rank arithmetic: it takes two permutations of the same id set and produces a third. It has
 * no opinion about what the ids are, what the deterministic scorer measured, or what weight is
 * appropriate — those are the category's to decide and are passed in.
 */

export type BlendInput = {
  /** Media ids in deterministic order, best first. */
  deterministicOrder: readonly number[];
  /** Media ids in AI-preferred order, best first. Must be a permutation of the above. */
  aiOrder: readonly number[];
  aiWeight: number;
  /** Recorded on the result so a stored observation says which formula produced it. */
  blendVersion: string;
  /** How far the deterministic top pick may fall before it counts as a guard trigger. */
  rankOneGuardMaxPosition: number;
};

export type BlendResult = {
  order: number[];
  scores: Map<number, number>;
  aiWeight: number;
  blendVersion: string;
  /** Whether the deterministic #1 landed below `rankOneGuardMaxPosition`. */
  rankOneGuardTriggered: boolean;
};

/**
 * Maps a 1-based rank onto [0, 1], best rank scoring 1.
 *
 * Linear rather than top-weighted. With many candidates competing for a couple of visible slots, a
 * decay curve would make the blend behave almost exactly like "take the AI's top two", which is
 * the thing shadow mode exists to avoid committing to.
 */
export function rankFit(rank: number, total: number): number {
  if (total <= 1) {
    return 1;
  }
  const clamped = Math.max(1, Math.min(rank, total));
  return 1 - (clamped - 1) / (total - 1);
}

/**
 * Combines the two orderings into one.
 *
 * Both sides are rank-normalised, not min-max normalised on raw score. A deterministic score that
 * saturates and clusters tightly at the top would, under min-max, compress the leading candidates
 * into a few thousandths and hand the AI effective control of the ordering. Rank-versus-rank keeps
 * the trade symmetric: one rank of AI movement costs exactly one rank of deterministic movement,
 * scaled by the weight.
 *
 * Ties break toward the deterministic order, which is what a shadow comparison should default to.
 */
export function blendRankOrders({
  deterministicOrder,
  aiOrder,
  aiWeight,
  blendVersion,
  rankOneGuardMaxPosition,
}: BlendInput): BlendResult {
  const total = deterministicOrder.length;
  const detRank = new Map<number, number>();
  deterministicOrder.forEach((mediaId, index) => detRank.set(mediaId, index + 1));

  const aiRank = new Map<number, number>();
  aiOrder.forEach((mediaId, index) => aiRank.set(mediaId, index + 1));

  const scores = new Map<number, number>();
  for (const mediaId of deterministicOrder) {
    const det = rankFit(detRank.get(mediaId) ?? total, total);
    // A candidate the AI never ranked scores as if it were last, rather than being dropped.
    const ai = rankFit(aiRank.get(mediaId) ?? total, total);
    scores.set(mediaId, (1 - aiWeight) * det + aiWeight * ai);
  }

  const order = [...deterministicOrder].sort((a, b) => {
    const delta = (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
    if (delta !== 0) {
      return delta;
    }
    return (detRank.get(a) ?? 0) - (detRank.get(b) ?? 0);
  });

  const deterministicTop = deterministicOrder[0];
  const blendedPosition = deterministicTop === undefined ? 0 : order.indexOf(deterministicTop) + 1;

  return {
    order,
    scores,
    aiWeight,
    blendVersion,
    rankOneGuardTriggered:
      deterministicTop !== undefined && blendedPosition > rankOneGuardMaxPosition,
  };
}
