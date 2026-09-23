import { MANGA_FIXTURE_HISTORY, mangaEntry } from '../../__fixtures__/manga-history.fixture';
import {
  buildMangaAiEvidenceDocument,
  computeMangaEvidenceWeight,
  hashMangaAiEvidence,
  resolveMangaCitedMass,
} from '../evidence';
import type { MangaHistoryEntry } from '../history';
import { MANGA_AI_EVIDENCE_WEIGHTS } from '../types';

/**
 * Unrelated titles, sharing no prefix and ending in no numeral.
 *
 * Named rather than generated, because generated names like `Series 1` are exactly the shape the
 * family normaliser is supposed to collapse — a trailing numeral is how `Gantz 2` announces
 * itself as part of the Gantz family. Using them here would test the normaliser's correct
 * behaviour as though it were a bug.
 */
const DISTINCT_TITLES = [
  'Berserk',
  'Monster',
  'Vagabond',
  'Blame!',
  'Pluto',
  'Dorohedoro',
  'Homunculus',
  'Ajin',
  'Gantz',
  'Uzumaki',
  'Nausicaa',
  'Akira',
  'Lone Wolf and Cub',
  'Sanctuary',
  'Kingdom',
];

function findEntry(history: MangaHistoryEntry[], titleFragment: string) {
  const document = buildMangaAiEvidenceDocument(history);
  return document.entries.find(entry =>
    entry.titles.some(title => title.includes(titleFragment)),
  );
}

describe('what counts as evidence at all', () => {
  it('excludes planned entries', () => {
    const document = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    const titles = document.entries.flatMap(entry => entry.titles);
    // A to-read pile is aspiration, and manga backlogs are aspirational at a scale anime's are
    // not: adding a two-hundred-chapter series costs one click.
    expect(titles).not.toContain('Chainsaw Man');
  });

  it('includes completed, current and dropped entries', () => {
    const document = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    const statuses = new Set(document.entries.map(entry => entry.status));
    expect(statuses).toEqual(new Set(['completed', 'current', 'dropped']));
  });

  it('counts collapsed families rather than raw rows', () => {
    const document = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    // Twelve rows in, one planned, and Berserk's edition plus Vinland Saga's extras collapse.
    expect(document.dataQuality.titleCount).toBeLessThan(MANGA_FIXTURE_HISTORY.length - 1);
    expect(document.dataQuality.titleCount).toBe(document.entries.length);
  });
});

describe('positive evidence', () => {
  it('weighs a favourited high-rated completion highest', () => {
    const entry = mangaEntry({
      id: 1,
      title: 'X',
      status: 'completed',
      score: 10,
      isFavorite: true,
    });
    expect(computeMangaEvidenceWeight(entry)).toBe(
      MANGA_AI_EVIDENCE_WEIGHTS.completedFavoriteScore9,
    );
  });

  it('weighs a favourite above an unrated completion', () => {
    const favourite = mangaEntry({ id: 1, title: 'X', status: 'completed', isFavorite: true });
    const unrated = mangaEntry({ id: 2, title: 'Y', status: 'completed' });
    expect(computeMangaEvidenceWeight(favourite)).toBeGreaterThan(
      computeMangaEvidenceWeight(unrated),
    );
  });

  it('treats an unrated completion as mildly positive', () => {
    const entry = mangaEntry({ id: 1, title: 'X', status: 'completed' });
    expect(computeMangaEvidenceWeight(entry)).toBe(MANGA_AI_EVIDENCE_WEIGHTS.completedUnrated);
    expect(computeMangaEvidenceWeight(entry)).toBeGreaterThan(0);
  });

  /**
   * The long-running-series case, from the positive side.
   *
   * Readers do not mark long serials complete — the serial never completes — so an unrated deep
   * current run is frequently the only evidence such a series ever produces. If it did not carry
   * real weight, the profile of someone whose favourite reading is three enormous ongoing series
   * would be built entirely out of the smaller things they finished.
   */
  it('treats a long current run as strong positive evidence with no rating at all', () => {
    const entry = mangaEntry({
      id: 1,
      title: 'X',
      status: 'current',
      progress: 300,
      progressUnit: 'chapters',
    });
    expect(computeMangaEvidenceWeight(entry)).toBe(MANGA_AI_EVIDENCE_WEIGHTS.currentDeepRun);
    expect(computeMangaEvidenceWeight(entry)).toBeGreaterThan(
      MANGA_AI_EVIDENCE_WEIGHTS.completedUnrated,
    );
  });

  it('does not scale a current run with raw chapter count', () => {
    const long = mangaEntry({
      id: 1,
      title: 'X',
      status: 'current',
      progress: 100,
      progressUnit: 'chapters',
    });
    const enormous = mangaEntry({
      id: 2,
      title: 'Y',
      status: 'current',
      progress: 1100,
      progressUnit: 'chapters',
    });
    // Depth changes how confident the evidence is; past a point more of it adds no confidence.
    // This is what stops one huge series out-massing an entire varied library.
    expect(computeMangaEvidenceWeight(enormous)).toBe(computeMangaEvidenceWeight(long));
  });

  it('weighs an early current run far below a deep one', () => {
    const early = mangaEntry({
      id: 1,
      title: 'X',
      status: 'current',
      progress: 2,
      progressUnit: 'chapters',
      media: { totalChapters: 150, totalVolumes: 17 },
    });
    expect(computeMangaEvidenceWeight(early)).toBe(MANGA_AI_EVIDENCE_WEIGHTS.currentEarly);
  });
});

describe('negative evidence and drop depth', () => {
  const dropped = (progress: number, totalChapters: number) =>
    mangaEntry({
      id: 1,
      title: 'X',
      status: 'dropped',
      progress,
      progressUnit: 'chapters',
      media: { totalChapters, totalVolumes: Math.ceil(totalChapters / 9) },
    });

  it('makes an early drop the strongest unrated negative', () => {
    expect(computeMangaEvidenceWeight(dropped(2, 150))).toBe(
      MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedBailed,
    );
  });

  /** The three drop points from the brief, each carrying a different meaning. */
  it('grades chapter 2, chapter 20 and chapter 120 of 150 differently', () => {
    const weights = [2, 20, 120].map(progress => computeMangaEvidenceWeight(dropped(progress, 150)));
    expect(new Set(weights).size).toBe(3);
    // Monotonic: the later the stop, the weaker the negative.
    expect(weights[0]).toBeLessThan(weights[1]);
    expect(weights[1]).toBeLessThan(weights[2]);
    expect(weights[2]).toBeLessThan(0);
  });

  it('makes a very late drop nearly neutral', () => {
    const late = computeMangaEvidenceWeight(dropped(140, 150));
    expect(late).toBe(MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedLate);
    expect(Math.abs(late)).toBeLessThan(
      Math.abs(MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedBailed) / 4,
    );
  });

  it('lets a stated score override where the reader stopped', () => {
    const lateButHated = mangaEntry({
      id: 1,
      title: 'X',
      status: 'dropped',
      score: 3,
      progress: 140,
      progressUnit: 'chapters',
      media: { totalChapters: 150, totalVolumes: 17 },
    });
    expect(computeMangaEvidenceWeight(lateButHated)).toBe(
      MANGA_AI_EVIDENCE_WEIGHTS.droppedScore4OrLower,
    );
  });

  it('falls back to a neutral-ish weight when the drop point is unknown', () => {
    const entry = mangaEntry({ id: 1, title: 'X', status: 'dropped' });
    expect(computeMangaEvidenceWeight(entry)).toBe(
      MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedUnknownProgress,
    );
  });
});

describe('missing and untrustworthy length data', () => {
  it('bands on the absolute count when no total exists', () => {
    const entry = findEntry(
      [
        mangaEntry({
          id: 1,
          title: 'No Totals',
          status: 'dropped',
          progress: 3,
          progressUnit: 'chapters',
        }),
      ],
      'No Totals',
    );
    expect(entry?.progressBand).toBe('bailed');
    expect(entry?.totalChapters).toBeNull();
    expect(entry?.totalVolumes).toBeNull();
  });

  it('reports how much of the library has any length data at all', () => {
    const document = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'A', status: 'completed', media: { totalVolumes: 10 } }),
      mangaEntry({ id: 2, title: 'B', status: 'completed' }),
    ]);
    expect(document.dataQuality.lengthDataRatio).toBe(0.5);
  });

  it('reports how much of the library has an establishable progress unit', () => {
    const document = buildMangaAiEvidenceDocument([
      // Completed: position is unambiguous from the status alone.
      mangaEntry({ id: 1, title: 'A', status: 'completed' }),
      mangaEntry({ id: 2, title: 'B', status: 'current', progress: 20, progressUnit: 'chapters' }),
      // A count with no unit is unusable, and is reported as such rather than assumed.
      mangaEntry({ id: 3, title: 'C', status: 'current', progress: 20, progressUnit: 'unknown' }),
      mangaEntry({ id: 4, title: 'D', status: 'dropped', progress: 5, progressUnit: 'unknown' }),
    ]);
    expect(document.dataQuality.progressUnitKnownRatio).toBe(0.5);
  });

  it('normalises volume progress onto the chapter scale before publishing it', () => {
    const entry = findEntry(
      [
        mangaEntry({
          id: 1,
          title: 'Volume Tracked',
          status: 'current',
          progress: 4,
          progressUnit: 'volumes',
        }),
      ],
      'Volume Tracked',
    );
    // The model is never asked whether "4" means volumes or chapters — a question the database
    // itself cannot answer for every row.
    expect(entry?.chaptersRead).toBe(36);
  });
});

describe('family collapse', () => {
  it('merges an edition into the work it reprints', () => {
    const document = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    const berserk = document.entries.filter(entry =>
      entry.titles.some(title => title.startsWith('Berserk')),
    );
    expect(berserk).toHaveLength(1);
    expect(berserk[0].titles).toEqual(
      expect.arrayContaining(['Berserk', 'Berserk: Deluxe Edition']),
    );
  });

  it('collapses a side story into its parent series', () => {
    const document = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    const vinland = document.entries.filter(entry =>
      entry.titles.some(title => title.startsWith('Vinland Saga')),
    );
    expect(vinland).toHaveLength(1);
    expect(vinland[0].representativeTitle).toBe('Vinland Saga');
  });

  it('never lets a derivative entry represent a family holding a real work', () => {
    const document = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'Series', status: 'completed', score: 6 }),
      mangaEntry({
        id: 2,
        title: 'Series: Gaiden',
        status: 'completed',
        score: 10,
        isFavorite: true,
      }),
    ]);
    // The gaiden is the heavier row, and still must not be what the profile cites.
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0].representativeTitle).toBe('Series');
    expect(document.entries[0].derivative).toBe(false);
  });

  it('damps a one-shot rather than counting it as a full series', () => {
    const oneShot = mangaEntry({
      id: 1,
      title: 'Short',
      status: 'completed',
      score: 9,
      media: { format: 'one_shot' },
    });
    const serial = mangaEntry({ id: 2, title: 'Long', status: 'completed', score: 9 });
    expect(computeMangaEvidenceWeight(oneShot)).toBeLessThan(computeMangaEvidenceWeight(serial));
    expect(computeMangaEvidenceWeight(oneShot)).toBeGreaterThan(0);
  });

  it('keeps a favourite uncitable as a dislike whichever instalment is named', () => {
    const document = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'Saga', status: 'dropped', progress: 2, progressUnit: 'chapters' }),
      mangaEntry({ id: 2, title: 'Saga Part 2', status: 'completed', isFavorite: true }),
    ]);
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0].aversionEvidence).toBe('none');
  });
});

describe('franchise dominance', () => {
  /**
   * The first of the three defences, measured directly.
   *
   * A reader who has followed one series through six instalments must not out-mass a reader with
   * six unrelated series, because the two libraries say very different things.
   */
  it('does not let one family contribute six independent endorsements', () => {
    const oneFamily = buildMangaAiEvidenceDocument(
      Array.from({ length: 6 }, (_, index) =>
        mangaEntry({
          id: index + 1,
          title: index === 0 ? 'Saga' : `Saga Part ${index + 1}`,
          status: 'completed',
          score: 9,
        }),
      ),
    );
    const sixSeries = buildMangaAiEvidenceDocument(
      DISTINCT_TITLES.slice(0, 6).map((title, index) =>
        mangaEntry({ id: index + 1, title, status: 'completed', score: 9 }),
      ),
    );

    expect(oneFamily.entries).toHaveLength(1);
    expect(sixSeries.entries).toHaveLength(6);
    expect(oneFamily.dataQuality.titleCount).toBe(1);
  });

  it('caps what a single family can contribute to the cited mass', () => {
    const document = buildMangaAiEvidenceDocument(
      Array.from({ length: 8 }, (_, index) =>
        mangaEntry({
          id: index + 1,
          title: index === 0 ? 'Saga' : `Saga Part ${index + 1}`,
          status: 'completed',
          score: 10,
          isFavorite: true,
        }),
      ),
    );
    const familyMass = new Map(
      document.families.map(family => [family.familyKey, family.positiveMass]),
    );
    const entry = document.entries[0];
    const cited = resolveMangaCitedMass(entry, familyMass);

    // Eight favourited instalments raise the family mass to eighty; the cap holds the cited mass
    // to 2.2x the representative entry rather than letting it grow with the family.
    expect(familyMass.get(entry.familyKey)).toBeGreaterThan(70);
    expect(cited).toBeCloseTo(entry.weight * 2.2, 5);
  });
});

describe('evidence hash', () => {
  it('is stable for unchanged history', () => {
    const first = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    const second = buildMangaAiEvidenceDocument([...MANGA_FIXTURE_HISTORY].reverse());
    // Row order is not a fact about taste, so it must not change the cache key.
    expect(hashMangaAiEvidence(first)).toBe(hashMangaAiEvidence(second));
  });

  it('changes when the library changes', () => {
    const base = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    const extended = buildMangaAiEvidenceDocument([
      ...MANGA_FIXTURE_HISTORY,
      mangaEntry({ id: 99, title: 'Blame!', status: 'completed', score: 8 }),
    ]);
    expect(hashMangaAiEvidence(base)).not.toBe(hashMangaAiEvidence(extended));
  });

  it('changes when the model changes', () => {
    const document = buildMangaAiEvidenceDocument(MANGA_FIXTURE_HISTORY);
    expect(hashMangaAiEvidence(document, 'model-a')).not.toBe(
      hashMangaAiEvidence(document, 'model-b'),
    );
  });

  it('changes when a status changes without the entry count changing', () => {
    const dropped = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'A', status: 'completed', score: 9 }),
      mangaEntry({ id: 2, title: 'B', status: 'dropped', progress: 2, progressUnit: 'chapters' }),
    ]);
    const completed = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'A', status: 'completed', score: 9 }),
      mangaEntry({ id: 2, title: 'B', status: 'completed', score: 9 }),
    ]);
    expect(hashMangaAiEvidence(dropped)).not.toBe(hashMangaAiEvidence(completed));
  });
});

describe('sufficiency', () => {
  const completions = (count: number) =>
    DISTINCT_TITLES.slice(0, count).map((title, index) =>
      mangaEntry({ id: index + 1, title, status: 'completed', score: 8 }),
    );

  it('calls a six-family library sparse', () => {
    expect(buildMangaAiEvidenceDocument(completions(6)).dataQuality.sufficiency).toBe('sparse');
  });

  it('calls a seven-family library adequate', () => {
    // Manga's own floor, not games' six and not anime's eight.
    expect(buildMangaAiEvidenceDocument(completions(7)).dataQuality.sufficiency).toBe('adequate');
  });

  it('calls a large well-rated library rich', () => {
    expect(buildMangaAiEvidenceDocument(completions(15)).dataQuality.sufficiency).toBe('rich');
  });

  it('counts families, so a long franchise cannot clear the threshold alone', () => {
    const oneFamily = Array.from({ length: 12 }, (_, index) =>
      mangaEntry({
        id: index + 1,
        title: index === 0 ? 'Saga' : `Saga Part ${index + 1}`,
        status: 'completed',
        score: 9,
      }),
    );
    expect(buildMangaAiEvidenceDocument(oneFamily).dataQuality.sufficiency).toBe('sparse');
  });
});

describe('aversion grading in the document', () => {
  it('reports zero clear aversion for a library with nothing but praise', () => {
    const document = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'A', status: 'completed', score: 9 }),
      mangaEntry({ id: 2, title: 'B', status: 'completed', score: 8, isFavorite: true }),
      mangaEntry({ id: 3, title: 'C', status: 'current', progress: 40, progressUnit: 'chapters' }),
    ]);
    expect(document.dataQuality.clearAversionCount).toBe(0);
  });

  it('reports clear aversion for an early unrated drop', () => {
    const document = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'A', status: 'dropped', progress: 2, progressUnit: 'chapters' }),
    ]);
    expect(document.dataQuality.clearAversionCount).toBe(1);
  });

  it('does not report clear aversion for a deep unrated drop', () => {
    const document = buildMangaAiEvidenceDocument([
      mangaEntry({
        id: 1,
        title: 'A',
        status: 'dropped',
        progress: 140,
        progressUnit: 'chapters',
        media: { totalChapters: 150, totalVolumes: 17 },
      }),
    ]);
    // Months of reading before stopping is a stall far more often than a verdict.
    expect(document.dataQuality.clearAversionCount).toBe(0);
    expect(document.entries[0].aversionEvidence).toBe('weak');
  });
});
