import type { MangaProgressUnit } from './history';

/**
 * How far into a series a reader got, as a band.
 *
 * Its own module because it is the single most manga-specific piece of reasoning in this category
 * and both the evidence builder and the negative-evidence grader depend on it. Anime could answer
 * "where did they stop?" with one ratio against one reliable total. Manga can do neither.
 *
 * Two problems, both structural:
 *
 * *The unit is not fixed.* Progress is chapters on MAL-imported rows and volumes on hand-edited
 * ones, and a volume is roughly nine chapters. Comparing the two numbers directly would read a
 * 12-volume completion as a twelfth of a 150-chapter series.
 *
 * *A ratio alone misdescribes long series.* This is the problem anime does not have at all. A
 * reader who stops at chapter 20 of a 150-chapter series has read 13% of it — but twenty chapters
 * is several hours and roughly two volumes. That is not a premise rejection; it is someone who
 * gave the series a real run and then lost interest, which is a different and much weaker
 * statement. Banding on ratio alone would file it beside a reader who quit on page four.
 */

/**
 * Chapters per volume, used only to bring a volume count onto the chapter scale.
 *
 * Nine is the conventional tankoubon figure and is close enough for banding, which is all it is
 * used for. It is never used to derive a total, and never to produce a percentage that is shown
 * to anyone — converting *up* from a coarse unit to a fine one cannot manufacture precision that
 * was not in the input, because the band boundaries it feeds are coarse in the same way.
 */
export const MANGA_CHAPTERS_PER_VOLUME = 9;

/**
 * Where a reader stopped, relative to the whole.
 *
 * Five bands rather than anime's four, and the extra one is the point. `sampled` sits between
 * "quit immediately" and "got halfway" and holds the case that has no anime equivalent: a reader
 * who put real hours into a very long series and still did not reach a third of it.
 */
export type MangaProgressBand =
  /** No usable progress: nothing recorded, or a count whose unit cannot be established. */
  | 'unknown'
  /** Stopped almost at once — the opening chapters. A rejection of premise, art or tone. */
  | 'bailed'
  /** Read a real stretch, but still early in the work. Interest faded rather than never caught. */
  | 'sampled'
  /** Somewhere in the middle of the series. */
  | 'partial'
  /** Nearly all of it. Only reachable when the total is actually known. */
  | 'most'
  /** Finished. */
  | 'complete';

/**
 * Band boundaries, in chapter-equivalents and in ratios.
 *
 * The ratio thresholds are wider than anime's because manga has no three-episode convention to
 * anchor them. Anime's first quarter is a deliberate try-out window that the medium itself
 * advertises; manga's is not, and a series of 200 chapters spends its first quarter — fifty
 * chapters — well past any trial period.
 */
export const MANGA_PROGRESS_BANDS = {
  /**
   * A drop is only a clean rejection when it is early **both** ways.
   *
   * Both conditions must hold: within the first sixth of the work *and* inside the first ten
   * chapters. The absolute clause is what stops "chapter 20 of 150" being filed as a bail — it
   * is 13% of the series, but it is also twenty chapters, and nobody reads twenty chapters of
   * something whose premise they rejected.
   */
  bailedMaxRatio: 1 / 6,
  bailedMaxChapters: 10,

  /** Read a meaningful stretch but still inside the first third. */
  sampledMaxRatio: 1 / 3,

  /** Past a third and up to this point counts as the middle of the work. */
  partialMaxRatio: 0.7,

  /**
   * Absolute fallbacks, used when no total is known — which is the common case for manga.
   *
   * No completion percentage is fabricated. Without a denominator the only honest reading of
   * "stopped after four chapters" is the raw count, and a four-chapter bail is recognisable
   * without knowing how long the series runs.
   */
  unknownTotalBailedMaxChapters: 5,
  unknownTotalSampledMaxChapters: 25,
} as const;

export type MangaProgressInput = {
  status: 'completed' | 'current' | 'dropped';
  progress: number | null;
  progressUnit: MangaProgressUnit;
  totalChapters: number | null;
  totalVolumes: number | null;
};

/**
 * Progress and total, both expressed in chapter-equivalents, or null where not knowable.
 *
 * Resolved together and in one place so a chapter count is never divided by a volume total. When
 * the reader's unit and the available total disagree, the coarser side is converted onto the
 * chapter scale rather than the finer side being rounded onto the coarse one.
 */
export function resolveMangaChapterEquivalents(input: MangaProgressInput): {
  read: number | null;
  total: number | null;
} {
  const read =
    input.progressUnit === 'unknown' || input.progress === null
      ? null
      : input.progressUnit === 'volumes'
        ? input.progress * MANGA_CHAPTERS_PER_VOLUME
        : input.progress;

  const total =
    input.totalChapters ??
    (input.totalVolumes !== null ? input.totalVolumes * MANGA_CHAPTERS_PER_VOLUME : null);

  return { read, total };
}

/**
 * Bands one entry's progress.
 *
 * Degrades in three steps rather than fabricating a denominator: a known total gives a ratio, a
 * known count with no total gives an absolute band, and neither gives `unknown`.
 *
 * Two guards deserve naming. A reader recorded as past their own total is incoherent — the
 * commonest cause is a MAL-imported row later hand-edited, so the stored unit is no longer the
 * one `import_source` implies — and incoherent input produces `unknown`, never `most`. And
 * `most` is unreachable without a total by construction: claiming someone is near the end of a
 * series requires knowing where the end is.
 */
export function bandMangaProgress(input: MangaProgressInput): MangaProgressBand {
  if (input.status === 'completed') {
    return 'complete';
  }

  const { read, total } = resolveMangaChapterEquivalents(input);
  if (read === null) {
    return 'unknown';
  }

  if (total !== null && total > 0) {
    // Past the recorded end: the stored unit cannot be what we think it is. Refuse to guess.
    if (read > total) {
      return 'unknown';
    }

    const ratio = read / total;
    if (ratio <= MANGA_PROGRESS_BANDS.bailedMaxRatio && read <= MANGA_PROGRESS_BANDS.bailedMaxChapters) {
      return 'bailed';
    }
    if (ratio <= MANGA_PROGRESS_BANDS.sampledMaxRatio) {
      return 'sampled';
    }
    if (ratio <= MANGA_PROGRESS_BANDS.partialMaxRatio) {
      return 'partial';
    }
    return 'most';
  }

  // No total. An absolute count still separates "gave up immediately" from "read for months",
  // but it can never establish proximity to an end nobody knows the position of — so the deepest
  // band available here is `partial`, and `most` is out of reach.
  if (read <= MANGA_PROGRESS_BANDS.unknownTotalBailedMaxChapters) {
    return 'bailed';
  }
  if (read <= MANGA_PROGRESS_BANDS.unknownTotalSampledMaxChapters) {
    return 'sampled';
  }
  return 'partial';
}

/**
 * Whether an in-progress entry represents a substantial ongoing commitment.
 *
 * Used for positive evidence, where the question is the opposite of the drop question: not "how
 * early did they quit?" but "how much have they stayed with?". A reader eighty chapters into an
 * unfinished series has said something strong about their taste without ever rating it, and this
 * is what lets that count.
 *
 * Note it is a band test and an absolute-depth test, not a scaled quantity. Two hundred chapters
 * does not count twice what one hundred does — the depth changes the *quality* of the evidence,
 * and once it is unambiguous, more of it adds nothing. That is what keeps a reader of one enormous
 * series from outweighing a reader of a varied library.
 */
export function isDeepMangaRun(input: MangaProgressInput): boolean {
  const band = bandMangaProgress(input);
  if (band === 'most' || band === 'partial') {
    return true;
  }
  if (band !== 'sampled') {
    return false;
  }
  // A `sampled` run in a very long series can still be a large absolute commitment.
  const { read } = resolveMangaChapterEquivalents(input);
  return read !== null && read > MANGA_PROGRESS_BANDS.unknownTotalSampledMaxChapters;
}
