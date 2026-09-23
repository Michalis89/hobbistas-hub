import { readClampedFloatEnv } from '@/lib/ai/shared/env';

/**
 * How much the model is allowed to move a manga ordering, once it is allowed to move one at all.
 *
 * The same 0.35 games and anime start at, and deliberately not tuned ahead of evidence: the weight
 * can be re-swept offline against rankings already paid for, so guessing a different number here
 * would only make the three categories' corpora harder to compare.
 */
export const DEFAULT_MANGA_RERANK_AI_WEIGHT = 0.35;

/** Nothing is clamped in shadow mode; this only marks how often the blend wants to bury the top pick. */
export const MANGA_RANK_ONE_GUARD_MAX_POSITION = 3;

export function getConfiguredMangaAiWeight(): number {
  return readClampedFloatEnv('MANGA_RERANK_AI_WEIGHT', {
    fallback: DEFAULT_MANGA_RERANK_AI_WEIGHT,
    min: 0,
    max: 1,
  });
}
