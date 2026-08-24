import { blendRankOrders, rankFit, type BlendResult } from '@/lib/ai/shared/rank/blend';
import { readClampedFloatEnv } from '@/lib/ai/shared/env';
import { GAME_RERANK_BLEND_VERSION } from './types';

export { rankFit };
export type { BlendResult };

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
  return readClampedFloatEnv('GAMES_RERANK_AI_WEIGHT', {
    fallback: DEFAULT_GAME_RERANK_AI_WEIGHT,
    min: 0,
    max: 1,
  });
}

export type BlendInput = {
  /** Media ids in deterministic order, best first. */
  deterministicOrder: readonly number[];
  /** Media ids in AI-preferred order, best first. Must be a permutation of the above. */
  aiOrder: readonly number[];
  aiWeight: number;
};

/**
 * Games binding for the shared rank blend.
 *
 * The arithmetic is category-independent; the blend version and the guard position are not. Both
 * are recorded on every shadow observation, so a future category changing its own guard must not
 * silently reinterpret rows games already wrote.
 */
export function blendOrders({ deterministicOrder, aiOrder, aiWeight }: BlendInput): BlendResult {
  return blendRankOrders({
    deterministicOrder,
    aiOrder,
    aiWeight,
    blendVersion: GAME_RERANK_BLEND_VERSION,
    rankOneGuardMaxPosition: RANK_ONE_GUARD_MAX_POSITION,
  });
}
