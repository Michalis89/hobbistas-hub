/**
 * The film evidence layer, and the two decisions that define it.
 *
 * *Cuts collapse, instalments do not.* A theatrical and an extended cut are one viewing decision;
 * the second Godfather film is not. Every other assertion here follows from that split.
 *
 * *An abandoned film is a hard verdict.* The threshold for "stall rather than rejection" is 90%,
 * far stricter than the serialised categories, because nobody stalls on a single sitting.
 */

import {
  buildMoviesAiEvidenceDocument,
  buildMoviesFamilyPositiveMass,
  hashMoviesAiEvidence,
  isNearlyFinished,
  resolveMoviesCitedMass,
} from '../evidence';
import { normalizeMovieFamilyKey, normalizeMovieIdentityKey } from '../normalizers';
import { calculateMoviesStrengthBand } from '../validation';
import type { MoviesHistory, MoviesHistoryEntry } from '../history';

function entry(
  id: number,
  title: string,
  overrides: Partial<MoviesHistoryEntry> = {},
  media: Partial<MoviesHistoryEntry['media']> = {},
): MoviesHistoryEntry {
  return {
    id,
    mediaId: id,
    status: 'completed',
    score: 9,
    progress: null,
    isFavorite: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
    media: {
      id,
      title,
      genres: ['Drama'],
      runtime: 120,
      releaseYear: 2010,
      ...media,
    },
  };
}

function history(
  entries: MoviesHistoryEntry[],
  authorship: MoviesHistory['authorship'] = { directors: [], actors: [] },
): MoviesHistory {
  return { entries, authorship };
}

describe('normalizeMovieIdentityKey', () => {
  it.each([
    ['Blade Runner', 'Blade Runner (Final Cut)'],
    ['Blade Runner', "Blade Runner - Director's Cut"],
    ['Blade Runner', 'Blade Runner Extended Edition'],
    ['Blade Runner', 'Blade Runner (4K Remaster)'],
    ['Blade Runner', 'Blade Runner (1982)'],
  ])('collapses %s and %s onto one key', (plain, variant) => {
    expect(normalizeMovieIdentityKey(variant)).toBe(normalizeMovieIdentityKey(plain));
  });

  it('keeps a leading year, which is part of the title', () => {
    expect(normalizeMovieIdentityKey('2001: A Space Odyssey')).toContain('2001');
  });

  it('never reduces a title to nothing', () => {
    expect(normalizeMovieIdentityKey('Unrated')).toBeTruthy();
  });

  it('keeps different films apart', () => {
    expect(normalizeMovieIdentityKey('Dune')).not.toBe(normalizeMovieIdentityKey('Dune Part Two'));
  });
});

describe('normalizeMovieFamilyKey', () => {
  it('groups a subtitled trilogy into one family', () => {
    const fellowship = normalizeMovieFamilyKey('The Lord of the Rings: The Fellowship of the Ring');
    const towers = normalizeMovieFamilyKey('The Lord of the Rings: The Two Towers');
    expect(fellowship).toBe(towers);
  });

  it('groups a numbered sequel with its original', () => {
    expect(normalizeMovieFamilyKey('The Godfather Part II')).toBe(
      normalizeMovieFamilyKey('The Godfather'),
    );
  });

  it('keeps unrelated films in separate families', () => {
    expect(normalizeMovieFamilyKey('Heat')).not.toBe(normalizeMovieFamilyKey('Collateral'));
  });
});

describe('buildMoviesAiEvidenceDocument', () => {
  it('merges cuts of one film into a single entry', () => {
    const document = buildMoviesAiEvidenceDocument(
      history([
        entry(1, 'Blade Runner'),
        entry(2, 'Blade Runner (Final Cut)', { score: 10, isFavorite: true }),
      ]),
    );

    expect(document.entries).toHaveLength(1);
    expect(document.entries[0].titles).toContain('Blade Runner (Final Cut)');
    // The better verdict survives the merge, and the favourite flag is ORed.
    expect(document.entries[0].score).toBe(10);
    expect(document.entries[0].favorite).toBe(true);
  });

  it('keeps instalments of one series as separate entries that share a family', () => {
    const document = buildMoviesAiEvidenceDocument(
      history([
        entry(1, 'The Godfather'),
        entry(2, 'The Godfather Part II'),
      ]),
    );

    expect(document.entries).toHaveLength(2);
    expect(new Set(document.entries.map(item => item.familyKey)).size).toBe(1);
  });

  it('excludes planned entries, which say what someone intends rather than what they liked', () => {
    const document = buildMoviesAiEvidenceDocument(
      history([entry(1, 'Heat'), entry(2, 'Collateral', { status: 'planned' })]),
    );

    expect(document.entries.map(item => item.representativeTitle)).toEqual(['Heat']);
  });

  it('recomputes the aversion grade after a merge rather than inheriting it', () => {
    // Merging raises the score and ORs the favourite flag, either of which can turn a citable
    // entry into one that must never be cited as a dislike.
    const document = buildMoviesAiEvidenceDocument(
      history([
        entry(1, 'Blade Runner', { status: 'dropped', score: null }),
        entry(2, 'Blade Runner (Final Cut)', { isFavorite: true }),
      ]),
    );

    expect(document.entries[0].aversionEvidence).toBe('none');
  });

  it('orders entries by weight, so the same library always hashes the same', () => {
    const forward = buildMoviesAiEvidenceDocument(
      history([entry(1, 'Heat', { score: 6 }), entry(2, 'Collateral', { score: 10 })]),
    );
    const reversed = buildMoviesAiEvidenceDocument(
      history([entry(2, 'Collateral', { score: 10 }), entry(1, 'Heat', { score: 6 })]),
    );

    expect(forward.entries.map(item => item.representativeTitle)).toEqual(['Collateral', 'Heat']);
    expect(hashMoviesAiEvidence(forward, 'model-a')).toBe(hashMoviesAiEvidence(reversed, 'model-a'));
  });

  it('folds the model into the hash, so switching models invalidates stored profiles', () => {
    const document = buildMoviesAiEvidenceDocument(history([entry(1, 'Heat')]));
    expect(hashMoviesAiEvidence(document, 'model-a')).not.toBe(
      hashMoviesAiEvidence(document, 'model-b'),
    );
  });

  it('carries the derived authorship through and reports whether it had anything in it', () => {
    const withCredits = buildMoviesAiEvidenceDocument(
      history([entry(1, 'Heat')], { directors: ['Michael Mann'], actors: [] }),
    );
    const without = buildMoviesAiEvidenceDocument(history([entry(1, 'Heat')]));

    expect(withCredits.authorship.directors).toEqual(['Michael Mann']);
    expect(withCredits.dataQuality.hasAuthorship).toBe(true);
    expect(without.dataQuality.hasAuthorship).toBe(false);
  });

  it('reports how much of the library has a runtime at all', () => {
    const document = buildMoviesAiEvidenceDocument(
      history([
        entry(1, 'Heat'),
        entry(2, 'Collateral', {}, { runtime: null }),
      ]),
    );

    expect(document.dataQuality.runtimeDataRatio).toBe(0.5);
  });

  it('counts only clear aversion evidence toward the negative-signal gate', () => {
    const document = buildMoviesAiEvidenceDocument(
      history([
        entry(1, 'Heat', { status: 'dropped', score: null, progress: 10 }),
        entry(2, 'Collateral', { score: 6 }),
        entry(3, 'Ali', { isFavorite: true }),
      ]),
    );

    expect(document.dataQuality.clearAversionCount).toBe(1);
  });
});

describe('isNearlyFinished', () => {
  it('treats walking out with twenty minutes left as a rejection, not a stall', () => {
    expect(isNearlyFinished(0.8)).toBe(false);
  });

  it('treats an abandonment past ninety percent as a stall', () => {
    expect(isNearlyFinished(0.95)).toBe(true);
  });

  it('answers null when progress is unknown, which films usually are', () => {
    expect(isNearlyFinished(null)).toBeNull();
  });
});

describe('family repeat damping', () => {
  it('stops a long series from supplying full-weight citations for every instalment', () => {
    const document = buildMoviesAiEvidenceDocument(
      history([
        entry(1, 'The Fast and the Furious', { isFavorite: true }),
        entry(2, 'The Fast and the Furious 2', { isFavorite: true }),
        entry(3, 'The Fast and the Furious 3', { isFavorite: true }),
        entry(10, 'Heat', { isFavorite: true }),
      ]),
    );

    const familyMass = buildMoviesFamilyPositiveMass(document.entries);
    const seriesEntry = document.entries.find(item =>
      item.representativeTitle.startsWith('The Fast'),
    )!;
    const standalone = document.entries.find(item => item.representativeTitle === 'Heat')!;

    // Same raw weight, but the series member is damped by its siblings' mass and the standalone
    // is not — so citing three instalments cannot outweigh three unrelated films.
    expect(seriesEntry.weight).toBe(standalone.weight);
    expect(resolveMoviesCitedMass(seriesEntry, familyMass)).toBeGreaterThan(seriesEntry.weight);
    expect(resolveMoviesCitedMass(standalone, familyMass)).toBe(standalone.weight);
  });

  it('bands a pillar citing one series lower than one citing unrelated films', () => {
    const document = buildMoviesAiEvidenceDocument(
      history([
        entry(1, 'Alien', { isFavorite: true }),
        entry(2, 'Aliens', { isFavorite: true }),
        entry(3, 'Heat', { isFavorite: true }),
        entry(4, 'Collateral', { isFavorite: true }),
        entry(5, 'Zodiac', { score: 8 }),
        entry(6, 'Prisoners', { score: 8 }),
      ]),
    );

    const withinSeries = calculateMoviesStrengthBand(['Alien', 'Aliens'], document);
    const acrossFilms = calculateMoviesStrengthBand(['Heat', 'Collateral'], document);

    expect(['Present', 'Strong', 'Defining']).toContain(acrossFilms);
    expect(withinSeries).not.toBe('Defining');
  });
});
