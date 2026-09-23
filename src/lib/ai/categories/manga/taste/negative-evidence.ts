import type { MangaProgressBand } from './progress';

/**
 * Grading a library entry as evidence of aversion.
 *
 * Lives in its own module because both ends need it: the evidence builder marks each entry with
 * whether it may be cited at all, and the validator checks what the model actually cited. One
 * definition, so the rule the model is shown and the rule it is judged by cannot drift apart.
 *
 * The important distinction is between an entry that **contradicts** the library and one that
 * merely **fails to support** a claim. Citing a favourite as a dislike is the model telling us the
 * opposite of what the reader said; citing a series they are eighty chapters into is the model
 * reaching for something that has no verdict yet. Only the first is a contract violation, and only
 * the first should cost a whole generation.
 *
 * The manga-specific part is where drop depth enters. Anime grades an unrated drop on one
 * boundary — was it near the end? Manga needs three, because the distance between "quit in the
 * opening chapters" and "quit after a year of reading" is the distance between a verdict and a
 * lapse, and both are recorded as `dropped`.
 */
export type MangaAiNegativeEvidenceStrength =
  /** Rated at or below {@link MANGA_STRONG_NEGATIVE_SCORE}; a clear dislike. */
  | 'strong'
  /** Abandoned without a rating, early enough that stopping was itself the verdict. */
  | 'usable'
  /**
   * Real but weak: a lukewarm completion, or an abandonment deep enough that a stall is the more
   * likely explanation. May corroborate a signal but must never carry one on its own.
   */
  | 'ambiguous'
  /**
   * Says nothing about aversion either way — still being read, or finished without comment.
   * The signal citing it is dropped; the rest of the profile stands.
   */
  | 'unusable'
  /**
   * Directly contradicts a stated preference: a favourite, or something rated highly.
   * The generation is discarded, because the model asserted the opposite of the evidence.
   */
  | 'contradictory';

/** At or above this score a title can never be cited as aversion evidence. */
export const MANGA_HIGH_RATED_SCORE = 8;
/** At or below this score a title is a clear dislike, whether finished or abandoned. */
export const MANGA_STRONG_NEGATIVE_SCORE = 5;
/** At or above this score, abandoning a title says little about taste. */
export const MANGA_AMBIGUOUS_DROP_SCORE = 6;

/**
 * The fields that decide aversion eligibility.
 *
 * Deliberately narrower than a full evidence entry so the evidence builder can call this while it
 * is still constructing one.
 */
export type MangaNegativeEvidenceInput = {
  status: 'completed' | 'current' | 'dropped';
  score: number | null;
  favorite: boolean;
  progressBand: MangaProgressBand;
};

export function classifyMangaNegativeEvidence(
  entry: MangaNegativeEvidenceInput,
): MangaAiNegativeEvidenceStrength {
  // Contradictions first: the reader stated a preference and the model asserted its opposite.
  if (entry.favorite) {
    return 'contradictory';
  }
  if (entry.score !== null && entry.score >= MANGA_HIGH_RATED_SCORE) {
    return 'contradictory';
  }

  // Something still being read has no verdict yet. Not a contradiction — just nothing to cite.
  if (entry.status === 'current') {
    return 'unusable';
  }

  if (entry.score !== null && entry.score <= MANGA_STRONG_NEGATIVE_SCORE) {
    return 'strong';
  }

  if (entry.status === 'completed') {
    // Finished and rated between the thresholds: a lukewarm verdict. Weak, but not nothing — a 6
    // often does mean something specific put the reader off. Finished with no rating at all says
    // nothing, since finishing a manga is itself a substantial commitment and mildly positive.
    return entry.score === null ? 'unusable' : 'ambiguous';
  }

  // Dropped, rated above the strong threshold but below the high-rated one.
  if (entry.score !== null) {
    return entry.score >= MANGA_AMBIGUOUS_DROP_SCORE ? 'ambiguous' : 'usable';
  }

  // Dropped, unrated: the depth decides, on manga's own scale rather than anime's.
  //
  // `bailed` and `sampled` are usable. Both describe a reader who stopped while the work was
  // still introducing itself, and in a long series `sampled` can be twenty chapters — enough to
  // have formed a real opinion, and still early enough that the opinion is about the work rather
  // than about one bad arc.
  //
  // `partial` and `most` are ambiguous at best. Someone who read past the midpoint and stopped
  // has demonstrated months of engagement; the overwhelmingly likely explanations are a hiatus,
  // a scanlation stopping, or life, none of which is a statement about taste.
  //
  // `unknown` is ambiguous too. Without knowing where they stopped there is no way to tell these
  // two cases apart, and guessing in the direction of "dislike" is how a profile ends up telling
  // a reader they avoid something they were simply interrupted in.
  if (entry.progressBand === 'bailed' || entry.progressBand === 'sampled') {
    return 'usable';
  }
  return 'ambiguous';
}

/**
 * How much aversion evidence an entry carries, as it appears in the evidence document.
 *
 * Three levels rather than a boolean, because a boolean is misleading in exactly the way that
 * matters. A lukewarm 7 is *citable* but can never carry a signal on its own, so a flag saying
 * only "eligible" invites the model to build signals out of nothing but 7s — which the validator
 * then drops, every time, after the prose has already been written around them.
 *
 * - `clear` — can carry a signal by itself (a real dislike, or an early abandonment).
 * - `weak`  — may corroborate one, never carry it.
 * - `none`  — must not be cited at all.
 */
export type MangaAiAversionEvidence = 'none' | 'weak' | 'clear';

export function gradeMangaAversionEvidence(
  entry: MangaNegativeEvidenceInput,
): MangaAiAversionEvidence {
  const strength = classifyMangaNegativeEvidence(entry);
  if (strength === 'strong' || strength === 'usable') {
    return 'clear';
  }
  return strength === 'ambiguous' ? 'weak' : 'none';
}

/**
 * Whether a signal's evidence as a whole supports an aversion claim.
 *
 * Ambiguous entries may take part but must not carry the group: a signal built mostly from
 * lukewarm ratings or deep abandonments asserts a dislike the library does not show.
 */
export function isSupportedMangaNegativeSignal(
  strengths: MangaAiNegativeEvidenceStrength[],
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
