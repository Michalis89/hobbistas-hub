import type { AnimeAiProgressBand } from './types';

/**
 * Grading a library entry as evidence of aversion.
 *
 * Lives in its own module because both ends need it: the evidence builder marks each entry with
 * whether it may be cited at all, and the validator checks what the model actually cited. One
 * definition, so the rule the model is shown and the rule it is judged by cannot drift apart.
 *
 * The important distinction is between an entry that **contradicts** the library and one that
 * merely **fails to support** a claim. Citing a favourite as a dislike is the model telling us the
 * opposite of what the user said; citing a show they are halfway through is the model reaching for
 * something that has no verdict yet. Only the first is a contract violation, and only the first
 * should cost a whole generation.
 */
export type AnimeAiNegativeEvidenceStrength =
  /** Rated at or below {@link ANIME_STRONG_NEGATIVE_SCORE}; a clear dislike. */
  | 'strong'
  /** Abandoned without a rating, early enough that stopping was itself the verdict. */
  | 'usable'
  /**
   * Real but weak: a lukewarm completion, or an abandonment so late it is more likely a stall.
   * May corroborate a signal but must never carry one on its own.
   */
  | 'ambiguous'
  /**
   * Says nothing about aversion either way — still being watched, or finished without comment.
   * The signal citing it is dropped; the rest of the profile stands.
   */
  | 'unusable'
  /**
   * Directly contradicts a stated preference: a favourite, or something rated highly.
   * The generation is discarded, because the model asserted the opposite of the evidence.
   */
  | 'contradictory';

/** At or above this score a title can never be cited as aversion evidence. */
export const ANIME_HIGH_RATED_SCORE = 8;
/** At or below this score a title is a clear dislike, whether finished or abandoned. */
export const ANIME_STRONG_NEGATIVE_SCORE = 5;
/** At or above this score, abandoning a title says little about taste. */
export const ANIME_AMBIGUOUS_DROP_SCORE = 6;

/**
 * The fields that decide aversion eligibility.
 *
 * Deliberately narrower than a full evidence entry so the evidence builder can call this while it
 * is still constructing one.
 */
export type AnimeNegativeEvidenceInput = {
  status: 'completed' | 'current' | 'dropped';
  score: number | null;
  favorite: boolean;
  progressBand: AnimeAiProgressBand;
};

export function classifyAnimeNegativeEvidence(
  entry: AnimeNegativeEvidenceInput,
): AnimeAiNegativeEvidenceStrength {
  // Contradictions first: the user stated a preference and the model asserted its opposite.
  if (entry.favorite) {
    return 'contradictory';
  }
  if (entry.score !== null && entry.score >= ANIME_HIGH_RATED_SCORE) {
    return 'contradictory';
  }

  // Something still being watched has no verdict yet. Not a contradiction — just nothing to cite.
  if (entry.status === 'current') {
    return 'unusable';
  }

  if (entry.score !== null && entry.score <= ANIME_STRONG_NEGATIVE_SCORE) {
    return 'strong';
  }

  if (entry.status === 'completed') {
    // Finished and rated between the thresholds: a lukewarm verdict. Weak, but not nothing — a 6
    // often does mean something specific put the viewer off. Finished with no rating at all says
    // nothing, since finishing is itself mildly positive.
    return entry.score === null ? 'unusable' : 'ambiguous';
  }

  // Dropped, rated above the strong threshold but below the high-rated one.
  if (entry.score !== null) {
    return entry.score >= ANIME_AMBIGUOUS_DROP_SCORE ? 'ambiguous' : 'usable';
  }

  // Dropped, unrated: the drop point decides. Stopping at 40 of 50 episodes is a stall far more
  // often than a verdict, so it corroborates at most.
  return entry.progressBand === 'most' ? 'ambiguous' : 'usable';
}

/**
 * How much aversion evidence an entry carries, as it appears in the evidence document.
 *
 * Three levels rather than a boolean, because a boolean was misleading in exactly the way that
 * matters. A lukewarm 7 is *citable* but can never carry a signal on its own, so a flag saying
 * only "eligible" invited the model to build signals out of nothing but 7s — which the validator
 * then dropped, every time, after the prose had already been written around them.
 *
 * - `clear` — can carry a signal by itself (a real dislike, or an early abandonment).
 * - `weak`  — may corroborate one, never carry it.
 * - `none`  — must not be cited at all.
 */
export type AnimeAiAversionEvidence = 'none' | 'weak' | 'clear';

export function gradeAversionEvidence(
  entry: AnimeNegativeEvidenceInput,
): AnimeAiAversionEvidence {
  const strength = classifyAnimeNegativeEvidence(entry);
  if (strength === 'strong' || strength === 'usable') {
    return 'clear';
  }
  return strength === 'ambiguous' ? 'weak' : 'none';
}

/**
 * Whether a signal's evidence as a whole supports an aversion claim.
 *
 * Ambiguous entries may take part but must not carry the group: a signal built mostly from
 * lukewarm or nearly-finished titles asserts a dislike the library does not show.
 */
export function isSupportedAnimeNegativeSignal(
  strengths: AnimeAiNegativeEvidenceStrength[],
): boolean {
  if (strengths.length === 0) {
    return false;
  }
  if (strengths.includes('contradictory') || strengths.includes('unusable')) {
    return false;
  }
  const ambiguous = strengths.filter(strength => strength === 'ambiguous').length;
  const corroborating = strengths.length - ambiguous;
  return ambiguous === 0 || corroborating >= ambiguous;
}
