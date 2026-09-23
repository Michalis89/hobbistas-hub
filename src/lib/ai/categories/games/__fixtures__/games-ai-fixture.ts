import type {
  GameHistoryEntry,
  GamesDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/games/games-types';
import type { EnrichedAiGamingTasteProfile } from '../taste/types';

/**
 * The fixture behind the Games behaviour-invariance suite.
 *
 * Chosen to exercise the parts of the pipeline most likely to shift under a refactor rather than
 * to be realistic: a franchise with three entries (collapse), a remaster (edition normalisation),
 * favourites at and below the score-9 boundary, a rated drop and an unrated drop at different
 * progress levels, an in-progress title, and a planned title that must be excluded entirely.
 *
 * Frozen. Changing anything here changes every golden in `games-ai-goldens.json`, which is
 * exactly the alarm those goldens exist to raise — so edit the fixture only alongside a
 * deliberate, explained hash bump.
 */

export const GAMES_FIXTURE_MODEL = 'gemini-3.6-flash';

export const GAMES_FIXTURE_TASTE_INPUT_HASH = 'taste-hash-fixture';

function historyEntry(
  id: number,
  title: string,
  status: GameHistoryEntry['status'],
  score: number | null,
  favorite: boolean,
  progress: number | null,
  genres: string[],
  themes: string[],
  studios: string[],
): GameHistoryEntry {
  return {
    id,
    mediaId: id,
    status,
    score,
    progress,
    priority: null,
    isFavorite: favorite,
    pinnedRank: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    media: { id, title, genres, themes, studios, platforms: [] },
  };
}

export const GAMES_FIXTURE_HISTORY: GameHistoryEntry[] = [
  historyEntry(1, 'Elden Ring', 'completed', 10, true, 100, ['Role-playing (RPG)'], ['Fantasy'], ['FromSoftware']),
  historyEntry(2, 'Dark Souls III', 'completed', 9, false, 100, ['Role-playing (RPG)'], ['Fantasy'], ['FromSoftware']),
  historyEntry(3, 'Dark Souls Remastered', 'completed', 8, false, 100, ['Role-playing (RPG)'], ['Fantasy'], ['FromSoftware']),
  historyEntry(4, 'Hades', 'completed', 9, true, 100, ['Indie'], ['Mythology'], ['Supergiant Games']),
  historyEntry(5, 'Celeste', 'completed', null, false, 100, ['Platform'], ['Drama'], ['Maddy Makes Games']),
  historyEntry(6, 'Assassin’s Creed Valhalla', 'dropped', 4, false, 30, ['Adventure'], ['Historical'], ['Ubisoft']),
  historyEntry(7, 'Far Cry 6', 'dropped', null, false, 50, ['Shooter'], ['Action'], ['Ubisoft']),
  historyEntry(8, 'Disco Elysium', 'current', null, false, 60, ['Role-playing (RPG)'], ['Mystery'], ['ZA/UM']),
  historyEntry(9, 'The Witcher 3', 'completed', 10, true, 100, ['Role-playing (RPG)'], ['Fantasy'], ['CD Projekt RED']),
  historyEntry(10, 'Cyberpunk 2077', 'completed', 7, false, 100, ['Role-playing (RPG)'], ['Sci-fi'], ['CD Projekt RED']),
  // Planned: must never reach the evidence document. A backlog says what someone intends.
  historyEntry(11, 'Stardew Valley', 'planned', null, false, null, ['Simulator'], ['Comedy'], ['ConcernedApe']),
  historyEntry(12, 'Sekiro', 'completed', 9, false, 100, ['Adventure'], ['Historical'], ['FromSoftware']),
];

export const GAMES_FIXTURE_PROFILE: EnrichedAiGamingTasteProfile = {
  schemaVersion: 1,
  identity: { label: 'Deliberate Challenge Seeker', description: 'Wants earned mastery.' },
  pillars: [
    {
      name: 'Earned mastery',
      kind: 'behavior',
      description: 'Repeats hard combat loops.',
      evidenceTitles: ['Elden Ring', 'Sekiro'],
      strengthBand: 'Defining',
    },
    {
      name: 'Authored worlds',
      kind: 'content',
      description: 'Follows written narrative.',
      evidenceTitles: ['Disco Elysium', 'The Witcher 3'],
      strengthBand: 'Strong',
    },
  ],
  negativeSignals: [
    {
      name: 'Checklist open world',
      description: 'Abandons map-marker busywork.',
      evidenceTitles: ['Far Cry 6'],
    },
  ],
  summary: 'Prefers dense authored worlds with demanding combat.',
  openQuestions: ['Is difficulty or atmosphere the stronger pull?'],
  dataQuality: { titleCount: 10, ratedRatio: 0.7, favoriteCount: 3, sufficiency: 'rich' },
  source: 'ai',
  model: GAMES_FIXTURE_MODEL,
  inputHash: 'abc123',
};

function shortlistEntry(
  id: number,
  title: string,
  score: number,
  rank: number,
): GamesDiscoveryShortlistEntry {
  return {
    candidate: {
      id,
      title,
      slug: `slug-${id}`,
      genres: ['Role-playing (RPG)'],
      themes: ['Fantasy'],
      platforms: ['PC'],
      cover: 'cover.jpg',
      popularityScore: 50,
      developer: `Dev ${id}`,
      studios: [`Studio ${id}`],
      releaseDate: '2021-03-04',
      gameModes: ['Single player'],
      playerPerspectives: ['Third person'],
      // Long enough to exercise the word-boundary truncation in the candidate payload.
      summary: `Summary for ${title}. `.repeat(30),
    },
    score,
    confidence: score / 100,
    matchedSignals: ['Fantasy'],
    debug: {},
    familyKey: `family-${id}`,
    deterministicRank: rank,
  };
}

export const GAMES_FIXTURE_SHORTLIST: GamesDiscoveryShortlistEntry[] = [
  101, 102, 103, 104, 105, 106,
].map((id, index) => shortlistEntry(id, `Candidate ${id}`, 90 - index * 3, index + 1));

export const GAMES_FIXTURE_DETERMINISTIC_ORDER = [101, 102, 103, 104, 105, 106];

/** A deliberately disagreeing model ordering, so the blend has something to actually do. */
export const GAMES_FIXTURE_AI_ORDER = [104, 101, 106, 102, 105, 103];

export const GAMES_FIXTURE_AI_WEIGHT = 0.35;

/** Seed unrelated to any hash, so the shuffle is pinned independently of the hash goldens. */
export const GAMES_FIXTURE_SHUFFLE_SEED = 'fixed-seed-v1';
