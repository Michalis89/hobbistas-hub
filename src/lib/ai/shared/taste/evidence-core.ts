import type { AversionEvidence } from './negative-evidence';

/**
 * The parts of an evidence document that are the same in every category.
 *
 * Deliberately a *core*, not a complete shape. Each category intersects its own fields onto these:
 * anime adds episode counts and a progress band, manga adds chapter equivalents and a publication
 * status, movies add a runtime. What is shared is the skeleton every prompt and every validator
 * relies on — an identity, a family, the titles it collapsed, a status, a score, a favourite flag,
 * an aversion grade and a weight.
 */

export type TasteEvidenceStatus = 'completed' | 'current' | 'dropped';

export type TasteDataSufficiency = 'sparse' | 'adequate' | 'rich';

export type TasteStrengthBand = 'Defining' | 'Strong' | 'Present' | 'Emerging';

export type TasteEvidenceEntryCore = {
  /** Collapses editions and reprints: one work in different packaging. */
  identityKey: string;
  /** Collapses sequels, seasons and instalments: one creative family. */
  familyKey: string;
  representativeTitle: string;
  /** Every library title this entry absorbed, sorted. */
  titles: string[];
  status: TasteEvidenceStatus;
  score: number | null;
  favorite: boolean;
  /** Whatever the category calls its labels — genres, MAL's flat list, TMDB genres. */
  labels: string[];
  aversionEvidence: AversionEvidence;
  weight: number;
};

export type TasteDataQualityCore = {
  /** Collapsed families, not raw library rows. */
  titleCount: number;
  ratedRatio: number;
  favoriteCount: number;
  /**
   * Entries graded `clear` — those able to carry a negative signal on their own.
   *
   * Surfaced because a library can be rich and still contain no aversion evidence whatsoever: a
   * user who drops nothing and rates nothing below 7 has told us plenty about what they like and
   * nothing about what they avoid. When this is zero the model is instructed to claim no aversion
   * anywhere, prose included.
   */
  clearAversionCount: number;
  sufficiency: TasteDataSufficiency;
};

/**
 * The evidence ladder, as a table.
 *
 * Every category grades the same way — finished and loved beats finished and rated beats finished
 * and silent beats in-progress beats abandoned — and differs only in the numbers. Keeping the
 * ladder here and the numbers in the category stops six copies of the same `if` chain.
 */
export type EvidenceWeightTable = {
  completedFavoriteTopScore: number;
  completedFavorite: number;
  completedScore9: number;
  completedScore8: number;
  completedScore7: number;
  completedScore5: number;
  completedScore4OrLower: number;
  completedUnrated: number;
  /** In progress, past most of the way through. */
  currentDeep: number;
  /** In progress, past a quarter. */
  currentPartial: number;
  currentEarly: number;
  droppedLate: number;
  droppedEarly: number;
};

export type LadderInput = {
  status: TasteEvidenceStatus;
  score: number | null;
  favorite: boolean;
  /** 0–1 where known, null where the category cannot tell. Decides the in-progress rungs. */
  progressRatio: number | null;
};

/**
 * Places one entry on the ladder.
 *
 * Note what a *dropped* entry scores: a small positive, never a negative. A rejection is carried by
 * `aversionEvidence`, which is a separate, graded channel; folding it into the weight as a negative
 * number would let two abandonments cancel out a favourite, which is not what abandoning something
 * means.
 */
export function computeLadderWeight(input: LadderInput, table: EvidenceWeightTable): number {
  const { status, score, favorite, progressRatio } = input;

  if (status === 'completed') {
    if (favorite && score !== null && score >= 9) {
      return table.completedFavoriteTopScore;
    }
    if (favorite) {
      return table.completedFavorite;
    }
    if (score === null) {
      return table.completedUnrated;
    }
    if (score >= 9) {
      return table.completedScore9;
    }
    if (score >= 8) {
      return table.completedScore8;
    }
    if (score >= 7) {
      return table.completedScore7;
    }
    if (score >= 5) {
      return table.completedScore5;
    }
    return table.completedScore4OrLower;
  }

  if (status === 'current') {
    if (progressRatio !== null && progressRatio >= 0.5) {
      return table.currentDeep;
    }
    if (progressRatio !== null && progressRatio >= 0.25) {
      return table.currentPartial;
    }
    return table.currentEarly;
  }

  // Dropped. Getting a long way in before stopping still says something was working.
  return progressRatio !== null && progressRatio >= 0.5 ? table.droppedLate : table.droppedEarly;
}

export type SufficiencyInput = {
  titleCount: number;
  ratedRatio: number;
  /** The category's evidence floor, from the capability registry. */
  minTitleCount: number;
  richTitleCount: number;
  richRatedRatio: number;
};

export function computeSufficiency({
  titleCount,
  ratedRatio,
  minTitleCount,
  richTitleCount,
  richRatedRatio,
}: SufficiencyInput): TasteDataSufficiency {
  if (titleCount >= richTitleCount && ratedRatio >= richRatedRatio) {
    return 'rich';
  }
  return titleCount >= minTitleCount ? 'adequate' : 'sparse';
}

/** Masses are compared and summed, never displayed; three decimals keeps hashes stable. */
export function roundMass(value: number): number {
  return Number(value.toFixed(3));
}

export function unionSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

/** The higher of two scores wins a merge: the user's better verdict on the same work. */
export function mergeScore(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.max(left, right);
}

export function mergeCount(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.max(left, right);
}

/** Ranks statuses by how much they settle: a verdict beats a stall beats an abandonment. */
const STATUS_RANK: Record<TasteEvidenceStatus, number> = {
  completed: 0,
  current: 1,
  dropped: 2,
};

export function compareEvidenceStatus(
  left: TasteEvidenceStatus,
  right: TasteEvidenceStatus,
): number {
  return STATUS_RANK[left] - STATUS_RANK[right];
}
