import {
  bandMangaProgress,
  isDeepMangaRun,
  MANGA_CHAPTERS_PER_VOLUME,
  resolveMangaChapterEquivalents,
  type MangaProgressInput,
} from '../progress';

/**
 * The progress bander is where every manga-specific data hazard lands, so these tests are written
 * against the hazards rather than against the code path: an ambiguous unit, a missing total, a
 * total that is really somebody's bookmark, and the long-series case that has no anime analogue.
 */

function input(overrides: Partial<MangaProgressInput> = {}): MangaProgressInput {
  return {
    status: 'dropped',
    progress: null,
    progressUnit: 'unknown',
    totalChapters: null,
    totalVolumes: null,
    ...overrides,
  };
}

describe('unit resolution', () => {
  it('reads a chapter count as chapters', () => {
    expect(
      resolveMangaChapterEquivalents(input({ progress: 40, progressUnit: 'chapters' })),
    ).toEqual({ read: 40, total: null });
  });

  it('converts a volume count onto the chapter scale', () => {
    expect(
      resolveMangaChapterEquivalents(input({ progress: 3, progressUnit: 'volumes' })),
    ).toEqual({ read: 3 * MANGA_CHAPTERS_PER_VOLUME, total: null });
  });

  it('refuses to read a count whose unit is unknown', () => {
    expect(resolveMangaChapterEquivalents(input({ progress: 40 })).read).toBeNull();
  });

  it('derives a chapter-scale total from volumes when no chapter total exists', () => {
    expect(resolveMangaChapterEquivalents(input({ totalVolumes: 10 })).total).toBe(
      10 * MANGA_CHAPTERS_PER_VOLUME,
    );
  });

  it('prefers a real chapter total over a volume-derived one', () => {
    expect(
      resolveMangaChapterEquivalents(input({ totalChapters: 162, totalVolumes: 18 })).total,
    ).toBe(162);
  });
});

describe('drop depth with a known total', () => {
  const longSeries = { progressUnit: 'chapters' as const, totalChapters: 150 };

  it('treats chapter 2 of 150 as a clean rejection', () => {
    expect(bandMangaProgress(input({ ...longSeries, progress: 2 }))).toBe('bailed');
  });

  /**
   * The case the brief singles out, and the one a ratio alone gets wrong.
   *
   * Twenty chapters is 13% of the series — inside any reasonable "first sixth" — but it is also
   * twenty chapters, roughly two volumes and several hours. Nobody reads that far into something
   * whose premise they rejected, so it must not land in the same band as quitting at chapter 2.
   */
  it('does not treat chapter 20 of 150 as a bail, despite the low ratio', () => {
    const band = bandMangaProgress(input({ ...longSeries, progress: 20 }));
    expect(band).toBe('sampled');
    expect(band).not.toBe('bailed');
  });

  it('treats chapter 120 of 150 as a late stop', () => {
    expect(bandMangaProgress(input({ ...longSeries, progress: 120 }))).toBe('most');
  });

  it('gives the three drop points three different meanings', () => {
    const bands = [2, 20, 120].map(progress =>
      bandMangaProgress(input({ ...longSeries, progress })),
    );
    expect(new Set(bands).size).toBe(3);
  });

  it('bands the middle of a series as partial', () => {
    expect(bandMangaProgress(input({ ...longSeries, progress: 75 }))).toBe('partial');
  });

  it('keeps an early bail in a short series a bail', () => {
    // 2 of 20 is both a low ratio and a low absolute count, so both clauses agree.
    expect(
      bandMangaProgress(input({ progress: 2, progressUnit: 'chapters', totalChapters: 20 })),
    ).toBe('bailed');
  });
});

describe('missing totals', () => {
  it('falls back to the absolute count rather than fabricating a ratio', () => {
    expect(bandMangaProgress(input({ progress: 3, progressUnit: 'chapters' }))).toBe('bailed');
    expect(bandMangaProgress(input({ progress: 15, progressUnit: 'chapters' }))).toBe('sampled');
    expect(bandMangaProgress(input({ progress: 200, progressUnit: 'chapters' }))).toBe('partial');
  });

  /**
   * `most` asserts proximity to an end. Without a total there is no end to be near, so the band
   * is unreachable by construction — this is the "never fabricate percentages" rule as a test.
   */
  it('never reaches `most` without a known total', () => {
    for (const progress of [1, 10, 50, 200, 1000, 9999]) {
      expect(bandMangaProgress(input({ progress, progressUnit: 'chapters' }))).not.toBe('most');
    }
  });

  it('uses the volume total when only volumes are known', () => {
    // One volume of twenty is 5% and nine chapter-equivalents — early on both clauses.
    expect(
      bandMangaProgress(input({ progress: 1, progressUnit: 'volumes', totalVolumes: 20 })),
    ).toBe('bailed');
    // Three volumes is 27 chapter-equivalents: past the absolute clause, still early in the work.
    expect(
      bandMangaProgress(input({ progress: 3, progressUnit: 'volumes', totalVolumes: 20 })),
    ).toBe('sampled');
    expect(
      bandMangaProgress(input({ progress: 18, progressUnit: 'volumes', totalVolumes: 20 })),
    ).toBe('most');
  });

  it('bands as unknown when no progress was recorded at all', () => {
    expect(bandMangaProgress(input({ totalChapters: 150 }))).toBe('unknown');
  });

  it('bands as unknown when the unit could not be established', () => {
    expect(bandMangaProgress(input({ progress: 40, totalChapters: 150 }))).toBe('unknown');
  });
});

describe('incoherent progress', () => {
  /**
   * The signature of a MAL-imported row that was later hand-edited: the stored unit is no longer
   * the one `import_source` implies, so the count overruns its own total. Guessing which way it
   * went would be inventing data, and guessing "near the end" would be inventing the worst one.
   */
  it('refuses to band a count that exceeds its own total', () => {
    expect(
      bandMangaProgress(input({ progress: 200, progressUnit: 'chapters', totalChapters: 150 })),
    ).toBe('unknown');
    expect(
      bandMangaProgress(input({ progress: 30, progressUnit: 'volumes', totalVolumes: 12 })),
    ).toBe('unknown');
  });
});

describe('completion', () => {
  it('bands a completed entry as complete whatever its progress says', () => {
    expect(bandMangaProgress(input({ status: 'completed' }))).toBe('complete');
    expect(
      bandMangaProgress(
        input({ status: 'completed', progress: 1, progressUnit: 'chapters', totalChapters: 300 }),
      ),
    ).toBe('complete');
  });
});

describe('deep current runs', () => {
  it('counts a long run in an unfinished series as deep', () => {
    expect(
      isDeepMangaRun(input({ status: 'current', progress: 370, progressUnit: 'chapters' })),
    ).toBe(true);
  });

  /**
   * The other half of the long-series problem. A reader eighty chapters into a thousand-chapter
   * series is at 8% — `sampled` by ratio — but eighty chapters is unambiguous commitment, so it
   * has to read as deep for the *positive* side even while a drop at the same point reads as
   * early for the negative side. The two questions are genuinely different.
   */
  it('counts a large absolute run as deep even when the ratio is small', () => {
    expect(
      isDeepMangaRun(
        input({
          status: 'current',
          progress: 80,
          progressUnit: 'chapters',
          totalChapters: 1000,
        }),
      ),
    ).toBe(true);
  });

  it('does not count an early run as deep', () => {
    expect(
      isDeepMangaRun(
        input({ status: 'current', progress: 3, progressUnit: 'chapters', totalChapters: 150 }),
      ),
    ).toBe(false);
  });

  it('does not count an unknown run as deep', () => {
    expect(isDeepMangaRun(input({ status: 'current', progress: 500 }))).toBe(false);
  });
});
