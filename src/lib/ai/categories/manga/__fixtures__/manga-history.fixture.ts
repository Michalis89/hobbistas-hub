import type { MangaHistoryEntry } from '../taste/history';

/**
 * Builders for manga library rows.
 *
 * `progress` is meaningless without `progressUnit` — the single most important difference from
 * both the games and the anime models, and the one a fixture has to make impossible to forget.
 * The builder therefore has no default unit that silently applies to a supplied count: a case
 * that sets `progress` must say what it counts.
 */
type MangaEntryOverrides = Partial<Omit<MangaHistoryEntry, 'media'>> & {
  id: number;
  title: string;
  status: MangaHistoryEntry['status'];
  /** Only the media fields a case cares about; the rest keep their defaults. */
  media?: Partial<MangaHistoryEntry['media']>;
};

export function mangaEntry(overrides: MangaEntryOverrides): MangaHistoryEntry {
  const { id, title, status, media, ...rest } = overrides;
  const progress = rest.progress ?? null;

  return {
    id,
    mediaId: id,
    status,
    score: null,
    progress: null,
    // A count with no unit is unusable, so default to `unknown` unless a count was supplied and
    // the case did not say otherwise — in which case chapters is the importer's own unit.
    progressUnit: progress === null ? 'unknown' : 'chapters',
    isFavorite: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...rest,
    media: {
      id,
      title,
      genres: ['Action'],
      totalChapters: null,
      totalVolumes: null,
      format: 'manga',
      publicationStatus: 'finished',
      startYear: 2010,
      ...media,
    },
  };
}

/**
 * A library broad enough to clear the seven-family threshold with room to spare.
 *
 * Deliberately mixed, and every entry earns its place in at least one test: a multi-part family, a
 * deluxe edition of a title already present, a favourite, unrated completions, an early drop, a
 * deep drop, a long current run with no rating, a one-shot, a side story, and a planned title that
 * must never appear in evidence.
 */
export const MANGA_FIXTURE_HISTORY: MangaHistoryEntry[] = [
  mangaEntry({
    id: 1,
    title: 'Berserk',
    status: 'current',
    score: 10,
    isFavorite: true,
    progress: 370,
    progressUnit: 'chapters',
    media: {
      genres: ['Action', 'Adventure', 'Drama', 'Horror', 'Seinen'],
      publicationStatus: 'currently_publishing',
      startYear: 1989,
    },
  }),
  mangaEntry({
    id: 2,
    title: 'Berserk: Deluxe Edition',
    status: 'completed',
    score: 9,
    media: { genres: ['Action', 'Seinen'], totalVolumes: 14, totalChapters: 364 },
  }),
  mangaEntry({
    id: 3,
    title: 'Vinland Saga',
    status: 'completed',
    score: 9,
    isFavorite: true,
    media: {
      genres: ['Action', 'Adventure', 'Drama', 'Historical', 'Seinen'],
      totalVolumes: 27,
      totalChapters: 214,
      startYear: 2005,
    },
  }),
  mangaEntry({
    id: 4,
    title: 'Monster',
    status: 'completed',
    score: 9,
    media: {
      genres: ['Drama', 'Mystery', 'Psychological', 'Seinen', 'Thriller'],
      totalVolumes: 18,
      totalChapters: 162,
      startYear: 1994,
    },
  }),
  mangaEntry({
    id: 5,
    title: '20th Century Boys',
    status: 'completed',
    score: 8,
    media: {
      genres: ['Drama', 'Mystery', 'Sci-Fi', 'Seinen'],
      totalVolumes: 22,
      totalChapters: 249,
      startYear: 1999,
    },
  }),
  mangaEntry({
    id: 6,
    title: 'Vagabond',
    status: 'current',
    progress: 220,
    progressUnit: 'chapters',
    media: {
      genres: ['Action', 'Adventure', 'Historical', 'Seinen'],
      publicationStatus: 'on_hiatus',
      startYear: 1998,
    },
  }),
  mangaEntry({
    id: 7,
    title: 'Oyasumi Punpun',
    status: 'completed',
    media: {
      genres: ['Drama', 'Psychological', 'Seinen', 'Slice of Life'],
      totalVolumes: 13,
      totalChapters: 147,
      startYear: 2007,
    },
  }),
  mangaEntry({
    id: 8,
    title: 'Solo Leveling',
    status: 'dropped',
    progress: 4,
    progressUnit: 'chapters',
    media: {
      genres: ['Action', 'Adventure', 'Fantasy'],
      totalVolumes: 14,
      totalChapters: 179,
      format: 'manhwa',
    },
  }),
  mangaEntry({
    id: 9,
    title: 'Bleach',
    status: 'dropped',
    progress: 480,
    progressUnit: 'chapters',
    media: {
      genres: ['Action', 'Adventure', 'Shounen', 'Supernatural'],
      totalVolumes: 74,
      totalChapters: 686,
      startYear: 2001,
    },
  }),
  mangaEntry({
    id: 10,
    title: 'Vinland Saga: Extra Chapters',
    status: 'completed',
    media: { genres: ['Historical', 'Seinen'] },
  }),
  mangaEntry({
    id: 11,
    title: 'Goodnight Punpun One-Shot',
    status: 'completed',
    score: 7,
    media: { genres: ['Drama'], format: 'one_shot' },
  }),
  mangaEntry({
    id: 12,
    title: 'Chainsaw Man',
    status: 'planned',
    media: { genres: ['Action', 'Shounen'] },
  }),
];
