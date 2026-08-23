import {
  buildGameAiEvidenceDocument,
  bucketGameProgress,
  computeGameEvidenceWeight,
  hashGameAiEvidence,
} from '../evidence';
import type { GameHistoryEntry } from '@/lib/recommendations/v3/games/games-types';

function entry(
  id: number,
  title: string,
  status: GameHistoryEntry['status'],
  overrides: Partial<GameHistoryEntry> = {},
): GameHistoryEntry {
  return {
    id,
    mediaId: id,
    status,
    score: overrides.score ?? null,
    progress: overrides.progress ?? null,
    priority: null,
    isFavorite: overrides.isFavorite ?? false,
    pinnedRank: null,
    updatedAt: overrides.updatedAt ?? '2026-08-22T00:00:00.000Z',
    selectedPlatform: 'PC',
    media: {
      id,
      title,
      genres: overrides.media?.genres ?? ['Role-playing (RPG)'],
      themes: overrides.media?.themes ?? ['Fantasy'],
      studios: overrides.media?.studios ?? ['Studio'],
      platforms: ['PC'],
      coverImageLarge: '',
      coverImageMedium: '',
    },
  };
}

describe('buildGameAiEvidenceDocument', () => {
  it('excludes planned games from evidence and hash input', () => {
    const base = [entry(1, 'Baldur’s Gate 3', 'completed', { score: 10 })];
    const withPlanned = [...base, entry(2, 'Backlog Game', 'planned', { score: 10 })];

    const baseDoc = buildGameAiEvidenceDocument(base);
    const plannedDoc = buildGameAiEvidenceDocument(withPlanned);

    expect(plannedDoc.entries).toHaveLength(1);
    expect(hashGameAiEvidence(plannedDoc)).toBe(hashGameAiEvidence(baseDoc));
  });

  it('merges editions while unioning favorite, score, genres, themes, and studios', () => {
    const doc = buildGameAiEvidenceDocument([
      entry(1, 'The Witcher 3: Wild Hunt', 'completed', {
        score: 8,
        media: {
          id: 1,
          title: 'The Witcher 3: Wild Hunt',
          genres: ['Adventure'],
          themes: ['Open world'],
          studios: ['CD Projekt Red'],
          platforms: [],
        },
      }),
      entry(2, 'The Witcher 3: Wild Hunt Complete Edition', 'completed', {
        score: 10,
        isFavorite: true,
        media: {
          id: 2,
          title: 'The Witcher 3: Wild Hunt Complete Edition',
          genres: ['Role-playing (RPG)'],
          themes: ['Fantasy'],
          studios: ['CD Projekt'],
          platforms: [],
        },
      }),
    ]);

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].favorite).toBe(true);
    expect(doc.entries[0].score).toBe(10);
    expect(doc.entries[0].genres).toEqual(['Adventure', 'Role-playing (RPG)']);
    expect(doc.entries[0].themes).toEqual(['Fantasy', 'Open world']);
    expect(doc.entries[0].studios).toEqual(['CD Projekt', 'CD Projekt Red']);
  });

  it('collapses repeated franchise evidence while retaining completion count', () => {
    const doc = buildGameAiEvidenceDocument([
      entry(1, 'Dark Souls', 'completed', { score: 9 }),
      entry(2, 'Dark Souls II', 'completed', { score: 8 }),
      entry(3, 'Dark Souls III', 'completed', { score: 10, isFavorite: true }),
    ]);

    expect(doc.entries).toHaveLength(1);
    expect(doc.franchises[0].completionCount).toBe(3);
    expect(doc.franchises[0].titles).toHaveLength(3);
  });

  it('retains collapsed franchise titles on the representative evidence entry', () => {
    const doc = buildGameAiEvidenceDocument([
      entry(1, 'Dark Souls', 'completed', { score: 9 }),
      entry(2, 'Dark Souls Remastered', 'completed', { score: 10 }),
    ]);

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].titles).toEqual(['Dark Souls', 'Dark Souls Remastered']);
  });

  it('uses deterministic canonical ordering independent of input order and updated_at', () => {
    const a = [
      entry(1, 'B Game', 'completed', { score: 8, updatedAt: '2024-01-01T00:00:00.000Z' }),
      entry(2, 'A Game', 'completed', { score: 9, updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const b = [a[1], a[0]];

    expect(hashGameAiEvidence(buildGameAiEvidenceDocument(a))).toBe(
      hashGameAiEvidence(buildGameAiEvidenceDocument(b)),
    );
  });

  it('changes hash when status, score, or favorite changes', () => {
    const base = buildGameAiEvidenceDocument([entry(1, 'A Game', 'completed', { score: 8 })]);
    const changed = buildGameAiEvidenceDocument([
      entry(1, 'A Game', 'completed', { score: 9, isFavorite: true }),
    ]);

    expect(hashGameAiEvidence(changed)).not.toBe(hashGameAiEvidence(base));
  });

  it('buckets progress so small movement stays stable and bucket crossing changes hash', () => {
    const low = buildGameAiEvidenceDocument([entry(1, 'A Game', 'current', { progress: 10 })]);
    const stillLow = buildGameAiEvidenceDocument([entry(1, 'A Game', 'current', { progress: 20 })]);
    const crossed = buildGameAiEvidenceDocument([entry(1, 'A Game', 'current', { progress: 30 })]);

    expect(bucketGameProgress(20)).toBe('0-25');
    expect(hashGameAiEvidence(stillLow)).toBe(hashGameAiEvidence(low));
    expect(hashGameAiEvidence(crossed)).not.toBe(hashGameAiEvidence(low));
  });

  it('applies deterministic evidence weights', () => {
    expect(
      computeGameEvidenceWeight(
        entry(1, 'Favorite 9', 'completed', { score: 9, isFavorite: true }),
      ),
    ).toBe(10);
    expect(computeGameEvidenceWeight(entry(2, 'Dropped', 'dropped', { score: 4 }))).toBe(-7);
    expect(computeGameEvidenceWeight(entry(3, 'Current', 'current', { progress: 30 }))).toBe(2.5);
  });
});
