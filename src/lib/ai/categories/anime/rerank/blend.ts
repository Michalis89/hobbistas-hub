import { readClampedFloatEnv } from '@/lib/ai/shared/env';

/**
 * How much the model is allowed to move an anime ordering, once it is allowed to move one at all.
 *
 * Starts at the same 0.35 games starts at. Deliberately not tuned ahead of evidence: the whole
 * point of the shadow phase is that the weight can be re-swept offline against rankings already
 * paid for, so guessing a different number here would only make the two categories' corpora harder
 * to compare.
 */
export const DEFAULT_ANIME_RERANK_AI_WEIGHT = 0.35;

/**
 * How far the deterministic top pick may fall before it counts as a guard trigger.
 *
 * Nothing is clamped in shadow mode. The point is to measure how often the blend *wants* to bury
 * the deterministic favourite — a clamp would hide exactly the number worth knowing before any of
 * this is allowed near a viewer.
 */
export const ANIME_RANK_ONE_GUARD_MAX_POSITION = 3;

export function getConfiguredAnimeAiWeight(): number {
  return readClampedFloatEnv('ANIME_RERANK_AI_WEIGHT', {
    fallback: DEFAULT_ANIME_RERANK_AI_WEIGHT,
    min: 0,
    max: 1,
  });
}
