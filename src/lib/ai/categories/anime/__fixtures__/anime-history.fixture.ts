import type { AnimeHistoryEntry } from '../taste/history';

/**
 * Builders for anime library rows.
 *
 * `progress` is an episode count, not a percentage — the single most important difference from
 * the games model, and the one a fixture has to make impossible to forget.
 */
type AnimeEntryOverrides = Partial<Omit<AnimeHistoryEntry, 'media'>> & {
  id: number;
  title: string;
  status: AnimeHistoryEntry['status'];
  /** Only the media fields a case cares about; the rest keep their defaults. */
  media?: Partial<AnimeHistoryEntry['media']>;
};

export function animeEntry(overrides: AnimeEntryOverrides): AnimeHistoryEntry {
  const { id, title, status, media, ...rest } = overrides;
  return {
    id,
    mediaId: id,
    status,
    score: null,
    progress: null,
    isFavorite: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...rest,
    media: {
      id,
      title,
      genres: ['Action'],
      episodes: 12,
      format: 'tv',
      seasonYear: 2020,
      ...media,
    },
  };
}

/**
 * A library broad enough to clear the eight-family threshold with room to spare.
 *
 * Deliberately mixed: a three-season franchise, a favourite, unrated completions, an early drop,
 * a late drop, an in-progress title and a planned title that must never appear in evidence.
 */
export const ANIME_FIXTURE_HISTORY: AnimeHistoryEntry[] = [
  animeEntry({
    id: 1,
    title: 'Attack on Titan',
    status: 'completed',
    score: 10,
    isFavorite: true,
    progress: 25,
    media: { genres: ['Action', 'Drama'], episodes: 25, seasonYear: 2013 },
  }),
  animeEntry({
    id: 2,
    title: 'Attack on Titan Season 2',
    status: 'completed',
    score: 9,
    progress: 12,
    media: { genres: ['Action', 'Drama'], episodes: 12, seasonYear: 2017 },
  }),
  animeEntry({
    id: 3,
    title: 'Attack on Titan: The Final Season',
    status: 'completed',
    score: 9,
    progress: 16,
    media: { genres: ['Action', 'Drama'], episodes: 16, seasonYear: 2020 },
  }),
  animeEntry({
    id: 4,
    title: 'Vinland Saga',
    status: 'completed',
    score: 9,
    isFavorite: true,
    progress: 24,
    media: { genres: ['Action', 'Drama', 'Historical'], episodes: 24, seasonYear: 2019 },
  }),
  animeEntry({
    id: 5,
    title: 'Monster',
    status: 'completed',
    score: 9,
    progress: 74,
    media: { genres: ['Mystery', 'Psychological'], episodes: 74, seasonYear: 2004 },
  }),
  animeEntry({
    id: 6,
    title: 'Steins;Gate',
    status: 'completed',
    score: 8,
    progress: 24,
    media: { genres: ['Sci-Fi', 'Thriller'], episodes: 24, seasonYear: 2011 },
  }),
  animeEntry({
    id: 7,
    title: 'Mushishi',
    status: 'completed',
    progress: 26,
    media: { genres: ['Fantasy', 'Slice of Life'], episodes: 26, seasonYear: 2005 },
  }),
  animeEntry({
    id: 8,
    title: 'Made in Abyss',
    status: 'completed',
    score: 9,
    progress: 13,
    media: { genres: ['Adventure', 'Drama'], episodes: 13, seasonYear: 2017 },
  }),
  animeEntry({
    id: 9,
    title: 'March Comes in Like a Lion',
    status: 'completed',
    score: 8,
    progress: 22,
    media: { genres: ['Drama', 'Slice of Life'], episodes: 22, seasonYear: 2016 },
  }),
  // Early bail: the clean premise-level rejection.
  animeEntry({
    id: 10,
    title: 'Sword Art Online',
    status: 'dropped',
    progress: 2,
    media: { genres: ['Action', 'Fantasy', 'Romance'], episodes: 25, seasonYear: 2012 },
  }),
  // Late drop: mostly watched, so far weaker aversion evidence.
  animeEntry({
    id: 11,
    title: 'Bleach',
    status: 'dropped',
    progress: 300,
    media: { genres: ['Action', 'Adventure'], episodes: 366, seasonYear: 2004 },
  }),
  animeEntry({
    id: 12,
    title: 'Frieren',
    status: 'current',
    progress: 20,
    media: { genres: ['Adventure', 'Fantasy'], episodes: 28, seasonYear: 2023 },
  }),
  // Planned: intent, never evidence.
  animeEntry({
    id: 13,
    title: 'Ping Pong the Animation',
    status: 'planned',
    media: { genres: ['Sports'], episodes: 11, seasonYear: 2014 },
  }),
];
