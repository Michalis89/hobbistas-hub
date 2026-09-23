/**
 * The books evidence layer, and the two things only books have.
 *
 * *Authors on the row.* `media_items.tags` holds author names for books — the column name is wrong
 * and the data is right, and `recomputeCategoryProfiles` already reads it that way. It makes books
 * the only category with a true per-entry authorship signal.
 *
 * *The most forgiving abandonment rule in the app.* Putting a novel down at page 200 is more hours
 * than a whole film; it is far more often a life event than a judgement. The threshold is 60%, and
 * the weight for a late abandonment is deliberately not near-zero.
 */

import {
  buildBooksAiEvidenceDocument,
  buildBooksFamilyPositiveMass,
  hashBooksAiEvidence,
  isNearlyFinished,
  resolveBooksCitedMass,
} from '../evidence';
import { normalizeBookFamilyKey, normalizeBookIdentityKey } from '../normalizers';
import { calculateBooksStrengthBand } from '../validation';
import type { BooksHistoryEntry } from '../history';

function entry(
  id: number,
  title: string,
  overrides: Partial<BooksHistoryEntry> = {},
  media: Partial<BooksHistoryEntry['media']> = {},
): BooksHistoryEntry {
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
      genres: ['Fiction'],
      authors: ['Ursula K. Le Guin'],
      pageCount: 300,
      publicationYear: 1974,
      ...media,
    },
  };
}

describe('normalizeBookIdentityKey', () => {
  it.each([
    'Dune (Illustrated Edition)',
    'Dune (Paperback)',
    'Dune: Deluxe Edition',
    'Dune (40th Anniversary Edition)',
    'Dune (1965)',
  ])('collapses %s onto the bare book key', variant => {
    expect(normalizeBookIdentityKey(variant)).toBe(normalizeBookIdentityKey('Dune'));
  });

  it('keeps instalments of a series apart, because reading the next one is a real decision', () => {
    expect(normalizeBookIdentityKey('Dune')).not.toBe(normalizeBookIdentityKey('Dune Messiah'));
  });

  it('never reduces a title to nothing', () => {
    expect(normalizeBookIdentityKey('Omnibus')).toBeTruthy();
  });
});

describe('normalizeBookFamilyKey', () => {
  it('groups books sharing an explicit series parenthetical', () => {
    expect(normalizeBookFamilyKey('Leviathan Wakes (The Expanse, #1)')).toBe(
      normalizeBookFamilyKey("Caliban's War (The Expanse, #2)"),
    );
  });

  it('groups a numbered instalment with its opener', () => {
    expect(normalizeBookFamilyKey('Mistborn: The Well of Ascension')).toBe(
      normalizeBookFamilyKey('Mistborn'),
    );
  });

  it('keeps unrelated books in separate families', () => {
    expect(normalizeBookFamilyKey('The Dispossessed')).not.toBe(
      normalizeBookFamilyKey('Piranesi'),
    );
  });
});

describe('buildBooksAiEvidenceDocument', () => {
  it('merges editions of one book into a single entry', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'Dune'),
      entry(2, 'Dune (Illustrated Edition)', { score: 10, isFavorite: true }),
    ]);

    expect(document.entries).toHaveLength(1);
    expect(document.entries[0].score).toBe(10);
    expect(document.entries[0].favorite).toBe(true);
  });

  it('keeps series instalments separate while grouping their family', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'Leviathan Wakes (The Expanse, #1)'),
      entry(2, "Caliban's War (The Expanse, #2)"),
    ]);

    expect(document.entries).toHaveLength(2);
    expect(new Set(document.entries.map(item => item.familyKey)).size).toBe(1);
  });

  it('reads authors off the row, which no other category can do', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'The Dispossessed', {}, { authors: ['Ursula K. Le Guin'] }),
    ]);

    expect(document.entries[0].authors).toEqual(['Ursula K. Le Guin']);
    expect(document.dataQuality.authorDataRatio).toBe(1);
    expect(document.dataQuality.distinctAuthorCount).toBe(1);
  });

  it('reports thin author coverage rather than letting it look like a pattern', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'A', {}, { authors: ['One Author'] }),
      entry(2, 'B', {}, { authors: [] }),
      entry(3, 'C', {}, { authors: [] }),
      entry(4, 'D', {}, { authors: [] }),
    ]);

    expect(document.dataQuality.authorDataRatio).toBe(0.25);
  });

  it('unions authors across a merged edition', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'Good Omens', {}, { authors: ['Terry Pratchett'] }),
      entry(2, 'Good Omens (Paperback)', {}, { authors: ['Neil Gaiman'] }),
    ]);

    expect(document.entries[0].authors).toEqual(['Neil Gaiman', 'Terry Pratchett']);
  });

  it('treats a late abandonment far more gently than an early one', () => {
    const late = buildBooksAiEvidenceDocument([
      entry(1, 'A', { status: 'dropped', score: null, progress: 250 }),
    ]);
    const early = buildBooksAiEvidenceDocument([
      entry(1, 'A', { status: 'dropped', score: null, progress: 10 }),
    ]);

    expect(late.entries[0].weight).toBeGreaterThan(early.entries[0].weight);
    // And only the early one may carry a negative signal on its own.
    expect(late.entries[0].aversionEvidence).toBe('weak');
    expect(early.entries[0].aversionEvidence).toBe('clear');
  });

  it('reports how much of the library has a page count at all', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'A'),
      entry(2, 'B', {}, { pageCount: null }),
    ]);

    expect(document.dataQuality.pageDataRatio).toBe(0.5);
  });

  it('excludes planned entries', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'A'),
      entry(2, 'B', { status: 'planned' }),
    ]);

    expect(document.entries).toHaveLength(1);
  });

  it('hashes the same library the same way regardless of row order', () => {
    const forward = buildBooksAiEvidenceDocument([
      entry(1, 'A', { score: 6 }),
      entry(2, 'B', { score: 10 }),
    ]);
    const reversed = buildBooksAiEvidenceDocument([
      entry(2, 'B', { score: 10 }),
      entry(1, 'A', { score: 6 }),
    ]);

    expect(hashBooksAiEvidence(forward, 'model-a')).toBe(hashBooksAiEvidence(reversed, 'model-a'));
    expect(hashBooksAiEvidence(forward, 'model-a')).not.toBe(
      hashBooksAiEvidence(forward, 'model-b'),
    );
  });
});

describe('series repeat damping', () => {
  it('stops a long series from banding every pillar it touches as Defining', () => {
    const document = buildBooksAiEvidenceDocument([
      entry(1, 'The Eye of the World (The Wheel of Time, #1)', { isFavorite: true }),
      entry(2, 'The Great Hunt (The Wheel of Time, #2)', { isFavorite: true }),
      entry(3, 'The Dragon Reborn (The Wheel of Time, #3)', { isFavorite: true }),
      entry(10, 'Piranesi', { isFavorite: true }),
      entry(11, 'The Dispossessed', { isFavorite: true }),
      entry(12, 'Blindsight', { score: 8 }),
    ]);

    const familyMass = buildBooksFamilyPositiveMass(document.entries);
    const seriesEntry = document.entries.find(item =>
      item.representativeTitle.includes('Wheel of Time'),
    )!;
    const standalone = document.entries.find(item => item.representativeTitle === 'Piranesi')!;

    expect(seriesEntry.weight).toBe(standalone.weight);
    expect(resolveBooksCitedMass(seriesEntry, familyMass)).toBeGreaterThan(seriesEntry.weight);
    expect(resolveBooksCitedMass(standalone, familyMass)).toBe(standalone.weight);

    const withinSeries = calculateBooksStrengthBand(
      ['The Eye of the World (The Wheel of Time, #1)', 'The Great Hunt (The Wheel of Time, #2)'],
      document,
    );
    expect(withinSeries).not.toBe('Defining');
  });
});

describe('isNearlyFinished', () => {
  it('treats stopping past sixty percent as a stall', () => {
    expect(isNearlyFinished(0.65)).toBe(true);
  });

  it('treats stopping in the first half as a real verdict', () => {
    expect(isNearlyFinished(0.4)).toBe(false);
  });

  it('answers null when no page count is known', () => {
    expect(isNearlyFinished(null)).toBeNull();
  });
});
