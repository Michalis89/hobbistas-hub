import {
  buildGamesRecommendations,
  calculateDiscoveryHistoryStrength,
} from '../games/games-recommendation-engine';
import type { GameCandidate, GameHistoryEntry, TasteComputation } from '../games/games-types';

function historyEntry(
  id: number,
  title: string,
  status: GameHistoryEntry['status'],
  genres: string[],
  score: number | null,
  favorite = false,
): GameHistoryEntry {
  return {
    id,
    mediaId: id,
    status,
    score,
    progress: null,
    priority: null,
    isFavorite: favorite,
    pinnedRank: null,
    updatedAt: '2026-04-08T00:00:00.000Z',
    selectedPlatform: 'PlayStation 5',
    media: {
      id,
      title,
      genres,
      themes: [],
      studios: [],
      platforms: ['PlayStation 5'],
      coverImageLarge: '',
      coverImageMedium: '',
    },
  };
}

function candidate(id: number, title: string, genres: string[]): GameCandidate {
  return {
    id,
    title,
    slug: `game-${id}`,
    genres,
    themes: [],
    platforms: ['PlayStation 5'],
    cover: '',
    popularityScore: 70,
  };
}

function mockTaste(): TasteComputation {
  return {
    profile: {
      summary: 'AAA narrative RPG identity',
      coreGenres: [
        { name: 'role-playing-rpg', weight: 8 },
        { name: 'adventure', weight: 7 },
        { name: 'hack-and-slash', weight: 6 },
      ],
      secondaryGenres: [{ name: 'shooter', weight: 4 }],
      themes: [
        { name: 'narrative-driven worlds', weight: 7 },
        { name: 'dark fantasy action', weight: 6 },
      ],
      playerStyles: [{ name: 'single-player narrative immersion', weight: 8 }],
      negativeSignals: [{ name: 'puzzle-first indie aversion', weight: 3 }],
    },
    signals: {
      coreGenreKeys: new Set(['role-playing-rpg', 'adventure', 'hack-and-slash']),
      secondaryGenreKeys: new Set(['shooter']),
      negativeGenreKeys: new Set(['puzzle', 'indie']),
      favoriteFranchiseKeys: new Set(['god-of-war']),
      topCompletedTitles: ['God of War'],
      preferredPlatforms: ['ps5'],
    },
  };
}

describe('buildGamesRecommendations', () => {
  it('puts continuation picks first and avoids weak puzzle-first discovery', () => {
    const history: GameHistoryEntry[] = [
      historyEntry(1, 'God of War', 'completed', ['Adventure', "Hack and slash/Beat 'em up"], 9, true),
      historyEntry(2, 'The Witcher 3: Wild Hunt', 'completed', ['Adventure', 'Role-playing (RPG)'], 10, true),
    ];

    const backlog: GameHistoryEntry[] = [
      historyEntry(10, 'God of War Ragnarök', 'planned', ['Adventure', "Hack and slash/Beat 'em up", 'Role-playing (RPG)'], null),
      historyEntry(11, 'Cyberpunk 2077', 'planned', ['Adventure', 'Role-playing (RPG)', 'Shooter'], null),
      historyEntry(12, 'The Room 4: Old Sins', 'planned', ['Adventure', 'Indie', 'Puzzle'], null),
      historyEntry(13, 'Lies of P', 'planned', ['Adventure', 'Role-playing (RPG)'], null),
    ];

    const candidates: GameCandidate[] = [
      candidate(100, 'The Witcher 4', ['Adventure', 'Role-playing (RPG)']),
      candidate(101, 'Tiny Puzzle Adventure', ['Indie', 'Puzzle']),
      candidate(102, 'Dragon\'s Dogma 2', ['Adventure', 'Role-playing (RPG)', "Hack and slash/Beat 'em up"]),
    ];

    const result = buildGamesRecommendations({
      history,
      backlog,
      databaseCandidates: candidates,
      taste: mockTaste(),
    });

    expect(result.backlogPicks).toHaveLength(4);
    expect(result.backlogPicks[0].subtype).toBe('continuation');
    expect(result.backlogPicks[0].title).toBe('God of War Ragnarök');

    expect(result.possibleNext.some(item => item.title === 'Tiny Puzzle Adventure')).toBe(false);
    expect(result.possibleNext.some(item => item.title === 'The Witcher 4')).toBe(true);
  });
});

describe('calculateDiscoveryHistoryStrength', () => {
  it('does not let planned similar games increase discovery affinity', () => {
    const history = [
      historyEntry(1, 'Backlog RPG', 'planned', ['Adventure', 'Role-playing (RPG)'], null),
    ];

    expect(calculateDiscoveryHistoryStrength(history, ['Adventure'])).toBe(0);
  });

  it('does not let dropped similar games increase discovery affinity', () => {
    const history = [
      historyEntry(1, 'Dropped RPG', 'dropped', ['Adventure', 'Role-playing (RPG)'], 4),
    ];

    expect(calculateDiscoveryHistoryStrength(history, ['Adventure'])).toBe(0);
  });

  it('uses completed high-rated similar games as positive evidence', () => {
    const history = [
      historyEntry(1, 'Completed RPG', 'completed', ['Adventure', 'Role-playing (RPG)'], 9),
    ];

    expect(calculateDiscoveryHistoryStrength(history, ['Adventure'])).toBeGreaterThan(0);
  });

  it('weights favorite completed games above ordinary completions', () => {
    const ordinary = [
      historyEntry(1, 'Completed RPG', 'completed', ['Adventure', 'Role-playing (RPG)'], 9),
    ];
    const favorite = [
      historyEntry(1, 'Favorite RPG', 'completed', ['Adventure', 'Role-playing (RPG)'], 9, true),
    ];

    expect(calculateDiscoveryHistoryStrength(favorite, ['Adventure'])).toBeGreaterThan(
      calculateDiscoveryHistoryStrength(ordinary, ['Adventure']),
    );
  });

  it('allows current similar games to contribute mildly', () => {
    const history = [
      historyEntry(1, 'Current RPG', 'current', ['Adventure', 'Role-playing (RPG)'], null),
    ];

    expect(calculateDiscoveryHistoryStrength(history, ['Adventure'])).toBe(0.5);
  });
});

