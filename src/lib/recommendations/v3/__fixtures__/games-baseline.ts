import { buildGamesTasteProfile } from '../games/games-taste-engine';
import type { GameCandidate, GameHistoryEntry } from '../games/games-types';

/**
 * A library shaped like the real one the Phase 1 work was validated against: an authored-drama /
 * methodical-combat player with completed Sony first-party action games, a Souls thread, a couple
 * of dropped cozy/sim titles, and a planned queue containing both direct sequels and unrelated
 * picks.
 *
 * The point of the fixture is not realism for its own sake — it is that every branch the
 * possible-next path can take (external continuation, franchise dedup, discovery floor, platform
 * tiering) is exercised by a single call, so a snapshot of the output is a meaningful regression
 * guard for changes that are supposed to be behaviour-neutral.
 */

let nextId = 1;

function entry(
  title: string,
  status: GameHistoryEntry['status'],
  genres: string[],
  score: number | null,
  options: { favorite?: boolean; progress?: number | null; themes?: string[] } = {},
): GameHistoryEntry {
  const id = nextId++;
  return {
    id,
    mediaId: id,
    status,
    score,
    progress: options.progress ?? null,
    priority: null,
    isFavorite: options.favorite ?? false,
    pinnedRank: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    selectedPlatform: 'PlayStation 5',
    media: {
      id,
      title,
      genres,
      themes: options.themes ?? [],
      studios: [],
      platforms: ['PlayStation 5'],
      coverImageLarge: `cover-${id}`,
      coverImageMedium: `thumb-${id}`,
    },
  };
}

const RPG = 'Role-playing (RPG)';
const ADVENTURE = 'Adventure';
const HACK = 'Hack and slash/Beat em up';
const SHOOTER = 'Shooter';
const SIM = 'Simulator';
const PUZZLE = 'Puzzle';
const INDIE = 'Indie';
const STRATEGY = 'Real Time Strategy (RTS)';

export function buildBaselineHistory(): GameHistoryEntry[] {
  nextId = 1;
  return [
    entry('God of War', 'completed', [ADVENTURE, HACK], 10, { favorite: true }),
    entry('Horizon Zero Dawn', 'completed', [RPG, ADVENTURE, SHOOTER], 9, { favorite: true }),
    entry('Dark Souls Remastered', 'completed', [RPG, ADVENTURE], 9),
    entry('The Witcher 3: Wild Hunt', 'completed', [RPG, ADVENTURE], 10, { favorite: true }),
    entry('Cyberpunk 2077', 'completed', [RPG, ADVENTURE, SHOOTER], 9),
    entry('Bloodborne', 'completed', [RPG, ADVENTURE, HACK], 9, { favorite: true }),
    entry('Red Dead Redemption 2', 'completed', [ADVENTURE, SHOOTER], 8),
    entry('Ghost of Tsushima', 'completed', [ADVENTURE, HACK], 8),
    entry('Elden Ring', 'current', [RPG, ADVENTURE], null, { progress: 45 }),
    entry('Stardew Valley', 'dropped', [SIM, INDIE], 4),
    entry('Cities: Skylines', 'dropped', [SIM, STRATEGY], 3),
    entry('Baba Is You', 'dropped', [PUZZLE, INDIE], 5),
    entry('Final Fantasy VII Remake', 'planned', [RPG, ADVENTURE], null),
    entry('Sekiro: Shadows Die Twice', 'planned', [RPG, ADVENTURE, HACK], null),
    entry('Returnal', 'planned', [SHOOTER, ADVENTURE], null),
    entry('Hades', 'planned', [RPG, INDIE], null),
    entry('Death Stranding', 'planned', [ADVENTURE], null),
  ];
}

function candidate(
  id: number,
  title: string,
  genres: string[],
  popularityScore: number,
): GameCandidate {
  return {
    id,
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    genres,
    themes: [],
    platforms: ['PlayStation 5'],
    cover: `cover-c${id}`,
    popularityScore,
  };
}

export function buildBaselineCandidates(): GameCandidate[] {
  return [
    candidate(1001, 'God of War Ragnarök', [ADVENTURE, HACK], 90),
    candidate(1002, 'Horizon Forbidden West', [RPG, ADVENTURE, SHOOTER], 85),
    candidate(1003, 'Dark Souls II: Scholar of the First Sin', [RPG, ADVENTURE], 70),
    candidate(1004, 'Cyberpunk 2077: Phantom Liberty', [RPG, ADVENTURE, SHOOTER], 75),
    candidate(1005, 'Mass Effect Legendary Edition', [RPG, ADVENTURE, SHOOTER], 80),
    candidate(1006, 'Kingdom Come: Deliverance II', [RPG, ADVENTURE], 65),
    candidate(1007, 'Pathfinder: Wrath of the Righteous', [RPG], 55),
    candidate(1008, 'Ghost of Yotei', [ADVENTURE, HACK], 60),
    candidate(1009, 'Mass Effect 2', [RPG, ADVENTURE, SHOOTER], 72),
    candidate(1010, 'Mass Effect 3', [RPG, ADVENTURE, SHOOTER], 71),
    candidate(1011, 'Disco Elysium', [RPG, INDIE], 50),
    candidate(1012, 'Divinity: Original Sin II', [RPG, ADVENTURE], 58),
    candidate(1013, 'Nioh 2', [RPG, HACK], 45),
    candidate(1014, 'Lies of P', [RPG, ADVENTURE, HACK], 48),
    candidate(1015, 'Farming Simulator 22', [SIM, INDIE], 40),
    candidate(1016, 'Portal 2', [PUZZLE, INDIE], 66),
    candidate(1017, 'Company of Heroes 3', [STRATEGY], 35),
    candidate(1018, 'Star Wars Jedi: Survivor', [ADVENTURE, HACK], 62),
    candidate(1019, 'Control', [ADVENTURE, SHOOTER], 52),
    candidate(1020, 'Alan Wake II', [ADVENTURE, SHOOTER], 54),
    candidate(1021, 'Dragon Age: Inquisition', [RPG, ADVENTURE], 49),
    candidate(1022, 'Assassins Creed Origins', [RPG, ADVENTURE], 47),
    candidate(1023, 'Assassins Creed Odyssey', [RPG, ADVENTURE], 46),
    candidate(1024, 'Metro Exodus', [SHOOTER, ADVENTURE], 44),
    candidate(1025, 'Outer Wilds', [ADVENTURE, INDIE], 43),
  ];
}

export function buildBaselineInput() {
  const history = buildBaselineHistory();
  return {
    history,
    backlog: history.filter(item => item.status === 'planned'),
    databaseCandidates: buildBaselineCandidates(),
    taste: buildGamesTasteProfile(history),
  };
}
