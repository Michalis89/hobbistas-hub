/**
 * Grading a library entry as evidence of aversion.
 *
 * Both ends need it: the evidence builder marks each entry with whether it may be cited at all,
 * and the validator checks what the model actually cited. One definition, so the rule the model is
 * shown and the rule it is judged by cannot drift apart.
 *
 * The important distinction is between an entry that **contradicts** the library and one that
 * merely **fails to support** a claim. Citing a favourite as a dislike is the model telling us the
 * opposite of what the user said; citing something they are halfway through is the model reaching
 * for something that has no verdict yet. Only the first is a contract violation, and only the
 * first should cost a whole generation.
 *
 * Shared across categories because the reasoning is about *ratings and abandonment*, which every
 * category records identically. What each category supplies is its own score thresholds and its
 * own answer to "did they get far enough in that stopping was a verdict" — the `nearlyFinished`
 * flag below, which anime derives from episode counts, manga from chapter equivalents, films from
 * runtime watched, and books from pages read.
 */

export type NegativeEvidenceStrength =
  /** Rated at or below the strong-negative threshold; a clear dislike. */
  | 'strong'
  /** Abandoned without a rating, early enough that stopping was itself the verdict. */
  | 'usable'
  /**
   * Real but weak: a lukewarm completion, or an abandonment so late it is more likely a stall.
   * May corroborate a signal but must never carry one on its own.
   */
  | 'ambiguous'
  /**
   * Says nothing about aversion either way — still in progress, or finished without comment.
   * The signal citing it is dropped; the rest of the profile stands.
   */
  | 'unusable'
  /**
   * Directly contradicts a stated preference: a favourite, or something rated highly.
   * The generation is discarded, because the model asserted the opposite of the evidence.
   */
  | 'contradictory';

/**
 * How much aversion evidence an entry carries, as it appears in the evidence document.
 *
 * Three levels rather than a boolean, because a boolean was misleading in exactly the way that
 * matters. A lukewarm 7 is *citable* but can never carry a signal on its own, so a flag saying
 * only "eligible" invited the model to build signals out of nothing but 7s — which the validator
 * then dropped, every time, after the prose had already been written around them.
 */
export type AversionEvidence = 'none' | 'weak' | 'clear';

export type NegativeEvidenceThresholds = {
  /** At or above this score a title can never be cited as aversion evidence. */
  highRated: number;
  /** At or below this score a title is a clear dislike, whether finished or abandoned. */
  strongNegative: number;
  /** At or above this score, abandoning a title says little about taste. */
  ambiguousDrop: number;
};

/** The thresholds every category has started from. Scores are the app's 0–10 scale throughout. */
export const DEFAULT_NEGATIVE_EVIDENCE_THRESHOLDS: NegativeEvidenceThresholds = {
  highRated: 8,
  strongNegative: 5,
  ambiguousDrop: 6,
};

/**
 * The fields that decide aversion eligibility.
 *
 * Deliberately narrower than a full evidence entry so the evidence builder can call this while it
 * is still constructing one.
 */
export type NegativeEvidenceInput = {
  status: 'completed' | 'current' | 'dropped';
  score: number | null;
  favorite: boolean;
  /**
   * Whether an abandonment happened late enough to read as a stall rather than a verdict.
   *
   * Each category answers this from its own progress model; the rule it feeds is the same
   * everywhere. Null when progress is unknown, which is treated as "not nearly finished" —
   * an unknown drop point is more often an early one.
   */
  nearlyFinished: boolean | null;
};

export function classifyNegativeEvidence(
  entry: NegativeEvidenceInput,
  thresholds: NegativeEvidenceThresholds = DEFAULT_NEGATIVE_EVIDENCE_THRESHOLDS,
): NegativeEvidenceStrength {
  // Contradictions first: the user stated a preference and the model asserted its opposite.
  if (entry.favorite) {
    return 'contradictory';
  }
  if (entry.score !== null && entry.score >= thresholds.highRated) {
    return 'contradictory';
  }

  // Something still in progress has no verdict yet. Not a contradiction — just nothing to cite.
  if (entry.status === 'current') {
    return 'unusable';
  }

  if (entry.score !== null && entry.score <= thresholds.strongNegative) {
    return 'strong';
  }

  if (entry.status === 'completed') {
    // Finished and rated between the thresholds: a lukewarm verdict. Weak, but not nothing — a 6
    // often does mean something specific put them off. Finished with no rating at all says
    // nothing, since finishing is itself mildly positive.
    return entry.score === null ? 'unusable' : 'ambiguous';
  }

  // Dropped, rated above the strong threshold but below the high-rated one.
  if (entry.score !== null) {
    return entry.score >= thresholds.ambiguousDrop ? 'ambiguous' : 'usable';
  }

  // Dropped, unrated: the drop point decides. Stopping just short of the end is a stall far more
  // often than a verdict, so it corroborates at most.
  return entry.nearlyFinished === true ? 'ambiguous' : 'usable';
}

export function gradeAversionEvidence(
  entry: NegativeEvidenceInput,
  thresholds: NegativeEvidenceThresholds = DEFAULT_NEGATIVE_EVIDENCE_THRESHOLDS,
): AversionEvidence {
  const strength = classifyNegativeEvidence(entry, thresholds);
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
export function isSupportedNegativeSignal(strengths: NegativeEvidenceStrength[]): boolean {
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
