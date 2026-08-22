import { buildGamesTasteProfile, tasteWeight } from '../games/games-taste-engine';
import type { GameHistoryEntry } from '../games/games-types';

function entry(
  id: number,
  title: string,
  status: GameHistoryEntry['status'],
  genres: string[],
  score: number | null,
  isFavorite = false,
): GameHistoryEntry {
  return {
    id,
    mediaId: id,
    status,
    score,
    progress: null,
    priority: null,
    isFavorite,
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

describe('buildGamesTasteProfile', () => {
  it('keeps RPG/action narrative as core and suppresses puzzle/indie noise', () => {
    const history: GameHistoryEntry[] = [
      entry(1, "Baldur's Gate III", 'completed', ['Role-playing (RPG)', 'Strategy'], 10, true),
      entry(2, 'The Witcher 3: Wild Hunt', 'completed', ['Adventure', 'Role-playing (RPG)'], 10, true),
      entry(3, 'God of War', 'completed', ['Adventure', "Hack and slash/Beat 'em up"], 9, false),
      entry(4, 'Diablo IV', 'current', ["Hack and slash/Beat 'em up", 'Role-playing (RPG)'], null, false),
      entry(5, 'The Room', 'completed', ['Adventure', 'Indie', 'Puzzle'], 6, false),
      entry(6, 'Find Yourself', 'dropped', ['Indie', 'Simulator'], 4, false),
      entry(7, 'Puzzle Together', 'dropped', ['Indie', 'Puzzle'], 4, false),
    ];

    const taste = buildGamesTasteProfile(history);

    const core = taste.profile.coreGenres.map(item => item.name);
    expect(core).toContain('role-playing-rpg');
    expect(core).toContain('adventure');

    const summary = taste.profile.summary.toLowerCase();
    expect(summary).toContain('narrative');

    const negatives = taste.profile.negativeSignals.map(item => item.name).join(' ').toLowerCase();
    expect(negatives).toContain('puzzle');
  });

  it('treats unknown statuses as neutral taste evidence', () => {
    const unknownStatusEntry = entry(
      1,
      'Imported Status Game',
      'on_hold' as GameHistoryEntry['status'],
      ['Role-playing (RPG)'],
      4,
      false,
    );

    expect(tasteWeight(unknownStatusEntry)).toBe(0);
  });
});
