import { Film, BookOpen, Sparkles, Tv, Gamepad2 } from 'lucide-react';

export type MediaCategory = 'anime' | 'manga' | 'books' | 'movies' | 'tv' | 'games';

export type MediaStatus = 'planned' | 'current' | 'completed' | 'dropped';

export type MediaEntry = {
  id: string;
  updatedAt?: string;
  title: string;
  subtitle: string;
  year?: string;
  status: MediaStatus;
  isFavorite?: boolean;
  score?: string;
  tags: string[];
  cover: string;
  importSource?: string;
  catalogSource?: string;
  progress?: number;
  notes?: string;
  selectedPlatform?: string;
  format?: string;
  description?: string;
  totalEpisodes?: number;
  totalChapters?: number;
  totalVolumes?: number;
  totalRuntime?: number;
  totalPages?: number;
  mediaId?: number;
  externalId?: number;
  entryId?: number;
  igdbId?: number;
  // Game-specific fields
  platforms?: string[];
  developer?: string;
  publisher?: string;
  metacritic?: number;
  runtime?: number; // Hours for games
  igdbCategory?: number;
  authors?: string[];
  studios?: string[];
};

export type SearchResult = MediaEntry & {
  source: 'local' | 'external' | 'mock';
  mediaId?: number;
  externalId?: number;
  payload?: Record<string, unknown>;
  /** Present only on personal-suggestion results, which are a recorded recommendation serve. */
  serveId?: string;
  slotIndex?: number;
};

export type CategoryConfig = {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  currentLabel: string;
  plannedLabel: string;
  completedLabel: string;
  droppedLabel: string;
  icon: typeof Film;
};

export const isMediaCategory = (value: string | null): value is MediaCategory => {
  return (
    value === 'anime' ||
    value === 'manga' ||
    value === 'books' ||
    value === 'movies' ||
    value === 'tv' ||
    value === 'games'
  );
};

export const CATEGORY_CONFIG: Record<MediaCategory, CategoryConfig> = {
  anime: {
    title: 'Anime Library',
    subtitle: 'Season tracking, favorites, and a clean MAL-inspired grid.',
    searchPlaceholder: 'Search anime...',
    currentLabel: 'Watching',
    plannedLabel: 'Backlog',
    completedLabel: 'Completed',
    droppedLabel: 'Dropped',
    icon: Sparkles,
  },
  manga: {
    title: 'Manga Library',
    subtitle: 'Chapters, volumes, and a clean bookshelf layout.',
    searchPlaceholder: 'Search manga...',
    currentLabel: 'Reading',
    plannedLabel: 'Backlog',
    completedLabel: 'Completed',
    droppedLabel: 'Dropped',
    icon: BookOpen,
  },
  books: {
    title: 'Book Library',
    subtitle: 'Reading log, notes, and progress in a minimal shelf.',
    searchPlaceholder: 'Search books...',
    currentLabel: 'Reading',
    plannedLabel: 'Backlog',
    completedLabel: 'Completed',
    droppedLabel: 'Dropped',
    icon: BookOpen,
  },
  movies: {
    title: 'Movie Library',
    subtitle: 'Watchlist, ratings, and cinematic highlights.',
    searchPlaceholder: 'Search movies...',
    currentLabel: 'Watching',
    plannedLabel: 'Backlog',
    completedLabel: 'Completed',
    droppedLabel: 'Dropped',
    icon: Film,
  },
  tv: {
    title: 'TV Library',
    subtitle: 'Series tracking, ratings, and season progress.',
    searchPlaceholder: 'Search series...',
    currentLabel: 'Watching',
    plannedLabel: 'Backlog',
    completedLabel: 'Completed',
    droppedLabel: 'Dropped',
    icon: Tv,
  },
  games: {
    title: 'Games Library',
    subtitle: 'Track your gaming backlog.',
    searchPlaceholder: 'Search games...',
    currentLabel: 'Playing',
    plannedLabel: 'Backlog',
    completedLabel: 'Completed',
    droppedLabel: 'Dropped',
    icon: Gamepad2,
  },
};

export const getApiBase = (category: MediaCategory): string | null => {
  if (category === 'anime' || category === 'manga') {
    return '/api/anime';
  }
  if (category === 'movies' || category === 'tv') {
    return '/api/movies';
  }
  if (category === 'books') {
    return '/api/books';
  }
  if (category === 'games') {
    return '/api/games';
  }
  return null;
};

export const getProgressLabel = (category: MediaCategory): string => {
  if (category === 'manga') {
    return 'Volumes';
  }
  if (category === 'movies') {
    return 'Minutes';
  }
  if (category === 'books') {
    return 'Pages';
  }
  if (category === 'games') {
    return 'Hours';
  }
  return 'Episodes';
};

export const supportsExternalApi = (category: MediaCategory): boolean => {
  return (
    category === 'anime' ||
    category === 'manga' ||
    category === 'movies' ||
    category === 'tv' ||
    category === 'books' ||
    category === 'games'
  );
};

export const getTotalCount = (
  entry: MediaEntry & Partial<SearchResult>,
  category: MediaCategory,
): number | undefined => {
  const normalizeCount = (value?: number | null) =>
    typeof value === 'number' && value > 0 ? value : undefined;

  const payload = entry.payload as
    | {
        episodes?: number | null;
        chapters?: number | null;
        volumes?: number | null;
        runtime?: number | null;
        number_of_episodes?: number | null;
        page_count?: number | null;
      }
    | undefined;

  if (category === 'anime') {
    return normalizeCount(entry.totalEpisodes) ?? normalizeCount(payload?.episodes) ?? undefined;
  }
  if (category === 'manga') {
    return (
      normalizeCount(entry.totalVolumes) ??
      normalizeCount(entry.totalChapters) ??
      normalizeCount(payload?.volumes) ??
      normalizeCount(payload?.chapters) ??
      undefined
    );
  }
  if (category === 'movies') {
    return normalizeCount(entry.totalRuntime) ?? normalizeCount(payload?.runtime) ?? undefined;
  }
  if (category === 'tv') {
    return (
      normalizeCount(entry.totalEpisodes) ??
      normalizeCount(payload?.number_of_episodes) ??
      undefined
    );
  }
  if (category === 'books') {
    return normalizeCount(entry.totalPages) ?? normalizeCount(payload?.page_count) ?? undefined;
  }
  if (category === 'games') {
    return normalizeCount(entry.runtime) ?? normalizeCount(payload?.runtime) ?? undefined;
  }
  return undefined;
};
