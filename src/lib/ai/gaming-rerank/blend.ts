import { GAME_RERANK_BLEND_VERSION } from './types';

export const DEFAULT_GAME_RERANK_AI_WEIGHT = 0.35;

/**
 * How far the deterministic top pick may fall before it counts as a guard trigger.
 *
 * Nothing is clamped in shadow mode. The point is to measure how often the blend *wants* to bury
 * the deterministic favourite — a clamp would hide exactly the number worth knowing before any of
 * this is allowed near a user.
 */
export const RANK_ONE_GUARD_MAX_POSITION = 3;

export function getConfiguredAiWeight(): number {
  const configured = Number(process.env.GAMES_RERANK_AI_WEIGHT);
  if (!Number.isFinite(configured)) {
    return DEFAULT_GAME_RERANK_AI_WEIGHT;
  }
  return Math.max(0, Math.min(configured, 1));
}

/**
 * Maps a 1-based rank onto [0, 1], best rank scoring 1.
 *
 * Linear rather than top-weighted. With ~20 candidates competing for about two visible slots, a
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

export type BlendInput = {
  /** Media ids in deterministic order, best first. */
  deterministicOrder: readonly number[];
  /** Media ids in AI-preferred order, best first. Must be a permutation of the above. */
  aiOrder: readonly number[];
  aiWeight: number;
};

export type BlendResult = {
  order: number[];
  scores: Map<number, number>;
  aiWeight: number;
  blendVersion: string;
  /** Whether the deterministic #1 landed below {@link RANK_ONE_GUARD_MAX_POSITION}. */
  rankOneGuardTriggered: boolean;
};

/**
 * Combines the two orderings into one.
 *
 * Both sides are rank-normalised, not min-max normalised on raw score. The deterministic discovery
 * score is a bounded sum of hand-tuned bonuses that saturates at 100 and clusters tightly at the
 * top, so min-max would compress the leading candidates into a few thousandths and hand the AI
 * effective control of the ordering. Rank-versus-rank keeps the trade symmetric: one rank of AI
 * movement costs exactly one rank of deterministic movement, scaled by the weight.
 *
 * Ties break toward the deterministic order, which is what a shadow comparison should default to.
 */
export function blendOrders({ deterministicOrder, aiOrder, aiWeight }: BlendInput): BlendResult {
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
    blendVersion: GAME_RERANK_BLEND_VERSION,
    rankOneGuardTriggered:
      deterministicTop !== undefined && blendedPosition > RANK_ONE_GUARD_MAX_POSITION,
  };
}
