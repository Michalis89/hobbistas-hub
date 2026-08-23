import { subDays } from 'date-fns/subDays';
import { format } from 'date-fns/format';
import type { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { DEFAULT_COVER } from '@/lib/constants/messages';

export const DASHBOARD_TAB_CATEGORIES = [
  'games',
  'anime',
  'manga',
  'movies',
  'tv',
  'books',
] as const;
export type DashboardCategoryKey = (typeof DASHBOARD_TAB_CATEGORIES)[number];

export type DashboardTopFiveItem = {
  entryId: number;
  mediaId: number;
  title: string;
  cover: string;
  subtitle: string;
  progressPercent?: number;
  rating?: string;
  status: string;
  lastActivityAt?: string;
  isFavorite: boolean;
};

export type CategorySpotlightEntry = {
  title: string;
  cover: string;
  detail?: string;
  progressPercent?: number;
};

export type CategorySpotlightCard = {
  id: string;
  title: string;
  explanation: string;
  dataSubtitle: string;
  entry?: CategorySpotlightEntry;
  ctaLabel?: string;
};

export type CategoryChartPoint = {
  label: string;
  completed: number;
  dropped: number;
};

export type CategoryChartPayload = {
  data: CategoryChartPoint[];
  insight: string;
};

export type CategoryInsightsPayload = {
  statusCounts: Record<TasteProfileStatus, number>;
  completionRate: number;
  completionNumerator: number;
  completionDenominator: number;
  updatedLast7Days: number;
  updatedLast30Days: number;
};

export type CategoryRhythmEntry = {
  updatedAt: string | null;
  createdAt: string | null;
  status: TasteProfileStatus;
  score: number | null;
  progress: number | null;
  isFavorite: boolean;
  selectedPlatform: string | null;
  genres: string[];
  themes: string[];
  runtime: number | null;
};

export type PlatformInsightRow = {
  platform: string;
  total: number;
  completed: number;
  dropped: number;
  completionRate: number;
};

export type PlatformInsightPayload = {
  rows: PlatformInsightRow[];
  best: PlatformInsightRow | null;
  worst: PlatformInsightRow | null;
  summary: string;
};

export type PersonalSuggestionCard = {
  id: string;
  icon: string;
  title: string;
  explanation: string;
  stat: string;
  supportingText?: string;
  ctaLabel?: string;
};

export type TasteProfileStatus = 'planned' | 'current' | 'completed' | 'dropped';

export type CategoryTasteProfileItem = {
  title?: string | null;
  status: TasteProfileStatus;
  score: number | null;
  progress?: number | null;
  isFavorite?: boolean;
  genres: string[];
  tags: string[];
  bucketTags?: Partial<Record<InsightTagBucket, string[]>>;
};

export const INSIGHT_TAG_BUCKETS = ['subgenre', 'mechanic', 'mood', 'theme', 'structure'] as const;
export type InsightTagBucket = (typeof INSIGHT_TAG_BUCKETS)[number];

export type TasteProfileGenre = {
  name: string;
  count: number;
  weightSum: number;
  percent: number;
};

export type TasteProfileResult = {
  totalItems: number;
  totalWeight: number;
  ratedCount: number;
  unratedCount: number;
  ratedRatio: number;
  favoriteCount: number;
  completedItems: number;
  completedRatedCount: number;
  completedRatedRatio: number;
  topGenres: TasteProfileGenre[];
  topBuckets: Partial<Record<InsightTagBucket, TasteProfileGenre[]>>;
};

export type MediaSuggestion = {
  mediaId: number;
  category: DashboardCategoryKey;
  title: string;
  cover: string;
  slug: string;
  reason: string;
  confidence: number;
  source: 'backlog' | 'database' | 'database-fallback';
  genres?: string[];
  tags?: string[];
  bucketTags?: Partial<Record<InsightTagBucket, string[]>>;
  /**
   * Set only when the viewer is the owner of these recommendations. Public and shared dashboards
   * leave it undefined, which is what stops them recording interactions against the owner.
   */
  serveId?: string;
  slotIndex?: number;
};

export type CategoryDashboardSection = {
  topFive: DashboardTopFiveItem[];
  spotlights: CategorySpotlightCard[];
  chart: CategoryChartPayload;
  insights: CategoryInsightsPayload;
  rhythmEntries: CategoryRhythmEntry[];
  platformInsight: PlatformInsightPayload | null;
  tasteProfileItems: CategoryTasteProfileItem[];
  favorites: DashboardTopFiveItem[];
  favoritesCount: number;
  mediaSuggestions: MediaSuggestion[];
  recommenderTasteProfile?: Record<string, unknown> | null;
};

const CATEGORY_LABELS: Record<DashboardCategoryKey, string> = {
  games: 'Games',
  books: 'Books',
  anime: 'Anime',
  manga: 'Manga',
  movies: 'Movies',
  tv: 'TV',
};

const TASTE_PROFILE_INCLUDED_STATUSES = new Set<TasteProfileStatus>(['completed', 'current']);
const DEFAULT_TASTE_PROFILE_TOP_GENRES = 5;
const DEFAULT_TASTE_PROFILE_TOP_BUCKET_TRAITS = 5;
const TASTE_PROFILE_UNKNOWN_GENRE_KEY = '__unknown__';
const TASTE_PROFILE_UNKNOWN_BUCKET_KEY = '__unknown_bucket__';
export const DEFAULT_TASTE_PROFILE_MIN_ITEMS_THRESHOLD = 8;
export const TASTE_PROFILE_SCORE_MIN = 0;
export const TASTE_PROFILE_SCORE_MAX = 10;
export const TASTE_PROFILE_BASE_WEIGHT = 0.25;
export const TASTE_PROFILE_RATING_BOOST = 1.0;
export const TASTE_PROFILE_UNRATED_WEIGHT = 0.35;
export const TASTE_PROFILE_FAVORITE_MULT = 1.35;
export const TASTE_PROFILE_MAX_WEIGHT =
  (TASTE_PROFILE_BASE_WEIGHT + TASTE_PROFILE_RATING_BOOST) * TASTE_PROFILE_FAVORITE_MULT;
const TASTE_PROFILE_ANIME_CURRENT_UNRATED_CAP = 0.75;
const TASTE_PROFILE_ANIME_CURRENT_RATED_CAP = 1.05;
const TASTE_PROFILE_ANIME_STATUS_MULTIPLIER: Record<TasteProfileStatus, number> = {
  completed: 1.15,
  current: 0.78,
  planned: 0.35,
  dropped: 0.25,
};
const TASTE_PROFILE_ANIME_WEAK_METADATA_GENRES = new Set([
  'adult cast',
  'award winning',
  'children',
  'josei',
  'kids',
  'school',
  'seinen',
  'shoujo',
  'shounen',
  'workplace',
]);
const TASTE_PROFILE_ANIME_SECONDARY_GENRES = new Set([
  'isekai',
  'martial arts',
  'military',
  'parody',
  'reincarnation',
  'strategy game',
  'super power',
  'survival',
  'time travel',
  'urban fantasy',
]);

const CATEGORY_ENTRY_SELECT = `
  id,
  status,
  score,
  progress,
  priority,
  pinned_rank,
  selected_platform,
  created_at,
  updated_at,
  notes,
  is_favorite,
  media_items!inner(
    id,
    category,
    title,
    title_english,
    title_romaji,
    title_native,
    original_title,
    description,
    format,
    season_year,
    episodes,
    number_of_episodes,
    chapters,
    volumes,
    page_count,
    runtime,
    duration,
    genres,
    tags,
    igdb_themes,
    igdb_game_modes,
    igdb_player_perspectives,
    platforms,
    release_date,
    cover_image_large,
  cover_image_medium,
  studios
)
`;

const CATEGORY_ENTRY_SELECT_LEGACY = `
  id,
  status,
  score,
  progress,
  priority,
  selected_platform,
  created_at,
  updated_at,
  notes,
  is_favorite,
  media_items!inner(
    id,
    category,
    title,
    title_english,
    title_romaji,
    title_native,
    original_title,
    description,
    format,
    season_year,
    episodes,
    number_of_episodes,
    chapters,
    volumes,
    page_count,
    runtime,
    duration,
    genres,
    tags,
    igdb_themes,
    igdb_game_modes,
    igdb_player_perspectives,
    platforms,
    release_date,
    cover_image_large,
  cover_image_medium,
  studios
)
`;

const DEFAULT_CHART_DAYS = 16;
const CATEGORY_ENTRY_PAGE_SIZE = 200;

type CategoryEntryRow = {
  id: number;
  status: 'planned' | 'current' | 'completed' | 'dropped';
  score: number | null;
  progress: number | null;
  priority: number | null;
  pinned_rank?: number | null;
  selected_platform?: string | null;
  created_at: string | null;
  updated_at: string | null;
  notes?: string | null;
  is_favorite?: boolean | null;
  media_items: {
    id: number;
    category: string | null;
    title?: string | null;
    title_english?: string | null;
    title_romaji?: string | null;
    title_native?: string | null;
    original_title?: string | null;
    format?: string | null;
    season_year?: number | null;
    episodes?: number | null;
    number_of_episodes?: number | null;
    chapters?: number | null;
    volumes?: number | null;
    page_count?: number | null;
    runtime?: number | null;
    duration?: number | null;
    genres?: string[] | null;
    tags?: string[] | null;
    igdb_themes?: string[] | null;
    igdb_game_modes?: string[] | null;
    igdb_player_perspectives?: string[] | null;
    platforms?: string[] | null;
    release_date?: string | null;
    cover_image_large?: string | null;
    cover_image_medium?: string | null;
    studios?: string[] | null;
  } | null;
};

type CategoryChartRow = {
  day: string | null;
  completed: number | null;
  dropped: number | null;
};

const createEmptySection = (category: DashboardCategoryKey): CategoryDashboardSection => ({
  topFive: [],
  spotlights: [],
  chart: {
    data: [],
    insight: `Add ${CATEGORY_LABELS[category]} entries to unlock completion trends.`,
  },
  insights: {
    statusCounts: {
      planned: 0,
      current: 0,
      completed: 0,
      dropped: 0,
    },
    completionRate: 0,
    completionNumerator: 0,
    completionDenominator: 0,
    updatedLast7Days: 0,
    updatedLast30Days: 0,
  },
  rhythmEntries: [],
  platformInsight: null,
  tasteProfileItems: [],
  favorites: [],
  favoritesCount: 0,
  mediaSuggestions: [],
  recommenderTasteProfile: null,
});

function normalizeTasteProfileLabels(
  item: CategoryTasteProfileItem,
  category?: DashboardCategoryKey,
): string[] {
  if (item.genres.length > 0) {
    if (category === 'anime' || category === 'manga') {
      return Array.from(new Set(item.genres.map(normalizeGenreLabel).filter(Boolean)));
    }
    return pickTopGenresForItem(item.genres);
  }

  return pickTopBucketLabels('theme', item.tags.map(normalizePreferenceLabel).filter(Boolean), 2);
}

function normalizeBucketLabels(item: CategoryTasteProfileItem, bucket: InsightTagBucket): string[] {
  const labels = pickTopBucketLabels(bucket, item.bucketTags?.[bucket] ?? []);
  if (bucket !== 'subgenre') {
    return labels;
  }
  return labels.filter(label => !GENERIC_GAME_SUBGENRE_SET.has(label));
}

function canonicalizeBucketLabel(bucket: InsightTagBucket, label: string): string {
  if (!label) {
    return '';
  }
  if (bucket === 'subgenre') {
    const normalizedKey = label
      .replace(/[()]/g, ' ')
      .replace(/[_/\s]+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    if (
      normalizedKey === 'role-playing-game' ||
      normalizedKey === 'role-playing-rpg' ||
      normalizedKey === 'rpg'
    ) {
      return 'rpg';
    }
    if (
      normalizedKey === 'turn-based-strategy' ||
      normalizedKey === 'turn-based-strategy-tbs' ||
      normalizedKey === 'tbs'
    ) {
      return 'turn-based';
    }
    return label;
  }
  if (bucket !== 'structure') {
    return label;
  }

  const compact = label.replace(/[_\s]+/g, '-');
  if (/^(third|3rd)-person(?:-[a-z0-9]+)*$/.test(compact)) {
    return 'third-person';
  }

  return label;
}

function extractTasteTagLabelsFromMediaTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of tags) {
    if (typeof entry === 'string') {
      const label = entry.trim();
      if (label) {
        result.push(label);
      }
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const tag = entry as Record<string, unknown>;
    const bucket = tag.bucket;
    const type = tag.type;
    if (bucket === 'playstyle' || bucket === 'noise' || bucket === 'unknown') {
      continue;
    }
    if (type === 'noise' || type === 'playstyle') {
      continue;
    }

    const name =
      typeof tag.name === 'string' && tag.name.trim()
        ? tag.name.trim()
        : typeof tag.slug === 'string' && tag.slug.trim()
          ? tag.slug.trim()
          : '';
    if (name) {
      result.push(name);
    }
  }

  return Array.from(new Set(result));
}

function formatTasteProfileLabel(label: string): string {
  if (label === TASTE_PROFILE_UNKNOWN_GENRE_KEY || label === TASTE_PROFILE_UNKNOWN_BUCKET_KEY) {
    return 'Unknown';
  }
  if (label === 'rpg') {
    return 'RPG';
  }

  return label.replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeTitleForFranchise(title: string): string {
  let normalized = title.toLowerCase().trim();
  normalized = normalized
    .replace(/:\s+.+$/u, '')
    .replace(/\bseason\s+\d+\b/giu, '')
    .replace(/\bpart\s+\d+\b/giu, '')
    .replace(/\bcour\s+\d+\b/giu, '')
    .replace(/\b(ova|ona|special|movie|arc|the final chapters?)\b/giu, '')
    .replace(/\(\s*\d{4}\s*\)/gu, '')
    .replace(/\s+-\s+.+$/u, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  normalized = normalized.replace(/\b\d+\b$/u, '').trim();
  return normalized || title.toLowerCase().trim();
}

function getAnimeFranchiseMultiplier(seenCount: number): number {
  if (seenCount <= 0) {
    return 1;
  }
  if (seenCount === 1) {
    return 0.55;
  }
  if (seenCount === 2) {
    return 0.35;
  }
  return 0.2;
}

function getTasteGenreSignalMultiplier(
  category: DashboardCategoryKey | undefined,
  label: string,
): number {
  if (category !== 'anime' && category !== 'manga') {
    return 1;
  }
  if (TASTE_PROFILE_ANIME_WEAK_METADATA_GENRES.has(label)) {
    return 0.28;
  }
  if (TASTE_PROFILE_ANIME_SECONDARY_GENRES.has(label)) {
    return 0.7;
  }
  return 1;
}

function isValidTasteProfileScore(score: number | null | undefined): score is number {
  return (
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= TASTE_PROFILE_SCORE_MIN &&
    score <= TASTE_PROFILE_SCORE_MAX
  );
}

function getTasteProfileWeight(score: number | null | undefined): {
  weight: number;
  rated: boolean;
} {
  if (!isValidTasteProfileScore(score)) {
    return { weight: TASTE_PROFILE_UNRATED_WEIGHT, rated: false };
  }

  const scoreRange = TASTE_PROFILE_SCORE_MAX - TASTE_PROFILE_SCORE_MIN;
  if (scoreRange <= 0) {
    return { weight: TASTE_PROFILE_BASE_WEIGHT, rated: true };
  }

  const normalized = (score - TASTE_PROFILE_SCORE_MIN) / scoreRange;
  return {
    weight: TASTE_PROFILE_BASE_WEIGHT + normalized * TASTE_PROFILE_RATING_BOOST,
    rated: true,
  };
}

function applyFavoriteTasteProfileBoost(baseWeight: number, isFavorite?: boolean): number {
  const boostedWeight = isFavorite ? baseWeight * TASTE_PROFILE_FAVORITE_MULT : baseWeight;
  return Math.min(boostedWeight, TASTE_PROFILE_MAX_WEIGHT);
}

export function buildTasteProfile(
  items: CategoryTasteProfileItem[],
  category?: DashboardCategoryKey,
): TasteProfileResult {
  const trackedItems = items.filter(item => TASTE_PROFILE_INCLUDED_STATUSES.has(item.status));
  const totalItems = trackedItems.length;
  const completedItems = trackedItems.filter(item => item.status === 'completed');
  const completedItemsCount = completedItems.length;

  if (!totalItems) {
    return {
      totalItems: 0,
      totalWeight: 0,
      ratedCount: 0,
      unratedCount: 0,
      ratedRatio: 0,
      favoriteCount: 0,
      completedItems: 0,
      completedRatedCount: 0,
      completedRatedRatio: 0,
      topGenres: [],
      topBuckets: {},
    };
  }

  const genreCounts = new Map<string, number>();
  const genreWeightSums = new Map<string, number>();
  const bucketCounts: Record<InsightTagBucket, Map<string, number>> = {
    subgenre: new Map(),
    mechanic: new Map(),
    mood: new Map(),
    theme: new Map(),
    structure: new Map(),
  };
  const bucketWeightSums: Record<InsightTagBucket, Map<string, number>> = {
    subgenre: new Map(),
    mechanic: new Map(),
    mood: new Map(),
    theme: new Map(),
    structure: new Map(),
  };
  const bucketTotals: Record<InsightTagBucket, number> = {
    subgenre: 0,
    mechanic: 0,
    mood: 0,
    theme: 0,
    structure: 0,
  };

  let totalWeight = 0;
  let ratedCount = 0;
  let favoriteCount = 0;
  const useBucketMode = category === 'games';
  const franchiseSeenCount = new Map<string, number>();

  for (const item of trackedItems) {
    const { weight: baseWeight, rated } = getTasteProfileWeight(item.score);
    const favoriteBoostedWeight = applyFavoriteTasteProfileBoost(baseWeight, item.isFavorite);
    let weight = favoriteBoostedWeight;

    if (category === 'anime' || category === 'manga') {
      const statusMultiplier = TASTE_PROFILE_ANIME_STATUS_MULTIPLIER[item.status] ?? 1;
      weight *= statusMultiplier;

      if (item.title?.trim()) {
        const franchiseKey = normalizeTitleForFranchise(item.title);
        const seenCount = franchiseSeenCount.get(franchiseKey) ?? 0;
        weight *= getAnimeFranchiseMultiplier(seenCount);
        franchiseSeenCount.set(franchiseKey, seenCount + 1);
      }

      if (item.status === 'current') {
        const hasProgressSignal = typeof item.progress === 'number' && item.progress > 0;
        if (!rated && !hasProgressSignal) {
          weight = Math.min(weight, TASTE_PROFILE_ANIME_CURRENT_UNRATED_CAP);
        } else {
          weight = Math.min(weight, TASTE_PROFILE_ANIME_CURRENT_RATED_CAP);
        }
      }
    }

    totalWeight += weight;
    if (rated) {
      ratedCount += 1;
    }
    if (item.isFavorite) {
      favoriteCount += 1;
    }

    if (useBucketMode) {
      for (const bucket of INSIGHT_TAG_BUCKETS) {
        const labels = normalizeBucketLabels(item, bucket);
        const distributionLabels = labels.length > 0 ? labels : [TASTE_PROFILE_UNKNOWN_BUCKET_KEY];
        const distributedWeight =
          distributionLabels.length > 0 ? weight / distributionLabels.length : 0;
        bucketTotals[bucket] += weight;
        for (const label of distributionLabels) {
          bucketCounts[bucket].set(label, (bucketCounts[bucket].get(label) ?? 0) + 1);
          bucketWeightSums[bucket].set(
            label,
            (bucketWeightSums[bucket].get(label) ?? 0) + distributedWeight,
          );
        }
      }
      continue;
    }

    const labels = normalizeTasteProfileLabels(item, category);
    const distributionLabels = labels.length > 0 ? labels : [TASTE_PROFILE_UNKNOWN_GENRE_KEY];
    const signalWeightedEntries = distributionLabels.map(label => ({
      label,
      signalMultiplier: getTasteGenreSignalMultiplier(category, label),
    }));
    const signalWeightSum = signalWeightedEntries.reduce(
      (sum, entry) => sum + entry.signalMultiplier,
      0,
    );
    const distributedWeight =
      signalWeightSum > 0
        ? weight / signalWeightSum
        : distributionLabels.length > 0
          ? weight / distributionLabels.length
          : 0;
    for (const { label, signalMultiplier } of signalWeightedEntries) {
      genreCounts.set(label, (genreCounts.get(label) ?? 0) + 1);
      genreWeightSums.set(
        label,
        (genreWeightSums.get(label) ?? 0) + distributedWeight * signalMultiplier,
      );
    }
  }

  const unratedCount = totalItems - ratedCount;
  const ratedRatio = totalItems > 0 ? ratedCount / totalItems : 0;
  const completedRatedCount = completedItems.reduce(
    (count, item) => count + (isValidTasteProfileScore(item.score) ? 1 : 0),
    0,
  );
  const completedRatedRatio =
    completedItemsCount > 0 ? completedRatedCount / completedItemsCount : 0;

  const topGenres = useBucketMode
    ? []
    : Array.from(genreWeightSums.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) {
            return b[1] - a[1];
          }
          return a[0].localeCompare(b[0]);
        })
        .slice(0, DEFAULT_TASTE_PROFILE_TOP_GENRES)
        .map(([name, weightSum]) => ({
          name: formatTasteProfileLabel(name),
          count: genreCounts.get(name) ?? 0,
          weightSum,
          percent: totalWeight > 0 ? Number(((weightSum / totalWeight) * 100).toFixed(1)) : 0,
        }));

  const topBuckets = useBucketMode
    ? INSIGHT_TAG_BUCKETS.reduce(
        (acc, bucket) => {
          acc[bucket] = Array.from(bucketWeightSums[bucket].entries())
            .filter(([name]) => name !== TASTE_PROFILE_UNKNOWN_BUCKET_KEY)
            .sort((a, b) => {
              if (b[1] !== a[1]) {
                return b[1] - a[1];
              }
              return a[0].localeCompare(b[0]);
            })
            .slice(0, DEFAULT_TASTE_PROFILE_TOP_BUCKET_TRAITS)
            .map(([name, weightSum]) => ({
              name: formatTasteProfileLabel(name),
              count: bucketCounts[bucket].get(name) ?? 0,
              weightSum,
              percent:
                bucketTotals[bucket] > 0
                  ? Number(((weightSum / bucketTotals[bucket]) * 100).toFixed(1))
                  : 0,
            }));
          return acc;
        },
        {} as Partial<Record<InsightTagBucket, TasteProfileGenre[]>>,
      )
    : {};

  return {
    totalItems,
    totalWeight,
    ratedCount,
    unratedCount,
    ratedRatio,
    favoriteCount,
    completedItems: completedItemsCount,
    completedRatedCount,
    completedRatedRatio,
    topGenres,
    topBuckets,
  };
}

type DashboardSupabaseClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;

export async function fetchCategoryDashboardData(
  supabase: DashboardSupabaseClient,
  userId: string,
  enabledCategories: string[],
): Promise<Record<DashboardCategoryKey, CategoryDashboardSection>> {
  const requestedCategories = enabledCategories
    .map(cat => cat as DashboardCategoryKey)
    .filter(category => DASHBOARD_TAB_CATEGORIES.includes(category));

  const sections: Record<DashboardCategoryKey, CategoryDashboardSection> = {
    games: createEmptySection('games'),
    books: createEmptySection('books'),
    anime: createEmptySection('anime'),
    manga: createEmptySection('manga'),
    movies: createEmptySection('movies'),
    tv: createEmptySection('tv'),
  };

  if (requestedCategories.length === 0) {
    return sections;
  }

  // Start entries immediately and chain gameTagMap to fire as soon as entries resolve
  const entryResultsPromise = Promise.all(
    requestedCategories.map(category => fetchCategoryEntries(supabase, userId, category)),
  );

  // gameTagMap starts as soon as entries resolve — runs in parallel with charts & suggestions
  const gameTagMapPromise = entryResultsPromise.then(async results => {
    const gameTagMap = new Map<
      DashboardCategoryKey,
      Map<number, Partial<Record<InsightTagBucket, string[]>>>
    >();
    const gameIndex = requestedCategories.indexOf('games');
    if (gameIndex !== -1) {
      const entries = results[gameIndex] ?? [];
      const mediaIds = entries
        .map(entry => entry.media_items?.id)
        .filter((mediaId): mediaId is number => typeof mediaId === 'number');
      const tagMap = await fetchGameInsightTagMap(supabase, mediaIds);
      gameTagMap.set('games', tagMap);
    }
    return gameTagMap;
  });

  const mediaSuggestionsPromises = requestedCategories.map(async category => {
    const { generateRecommendationsV3 } = await import('@/lib/recommendations/v3/recommender');
    const response = await generateRecommendationsV3(
      userId,
      category as 'games' | 'anime' | 'manga' | 'movies' | 'tv' | 'books',
    );

    return {
      suggestions: [
        ...response.fromBacklog.slice(0, 4).map(item => ({
          mediaId: item.mediaDbId,
          category: item.category as DashboardCategoryKey,
          title: item.title,
          cover: item.cover,
          slug: item.slug,
          reason: item.reason,
          confidence: item.confidence,
          // Hard source separation: anything in fromBacklog is backlog.
          source: 'backlog' as MediaSuggestion['source'],
          genres: [],
          tags: item.matchedSignals,
        })),
        ...response.possibleNext.slice(0, 4).map(item => ({
          mediaId: item.mediaDbId,
          category: item.category as DashboardCategoryKey,
          title: item.title,
          cover: item.cover,
          slug: item.slug,
          reason: item.reason,
          confidence: item.confidence,
          // Hard source separation: anything in possibleNext is database.
          source: 'database' as MediaSuggestion['source'],
          genres: [],
          tags: item.matchedSignals,
        })),
      ],
      tasteProfile: response.tasteProfile as Record<string, unknown>,
    };
  });

  // All 4 operations run as concurrently as possible:
  // entries, charts, suggestions start simultaneously;
  // gameTagMap starts as soon as entries resolve (chained above)
  const [entryResults, chartResults, mediaSuggestionsResults, gameTagMapByCategory] =
    await Promise.all([
      entryResultsPromise,
      Promise.all(
        requestedCategories.map(category => fetchCategoryChartPoints(supabase, userId, category)),
      ),
      Promise.all(mediaSuggestionsPromises),
      gameTagMapPromise,
    ]);

  requestedCategories.forEach((category, index) => {
    const entries = entryResults[index] ?? [];
    const chartRows = chartResults[index] ?? [];
    const topFive = buildTopFive(entries, category);
    const excludedIds = new Set(topFive.map(item => item.entryId));
    const favoritesCount = entries.filter(entry => Boolean(entry.is_favorite)).length;

    sections[category] = {
      topFive,
      spotlights: [],
      chart: buildCategoryChart(category, chartRows),
      insights: buildCategoryInsights(entries),
      rhythmEntries: buildRhythmEntries(entries),
      platformInsight: buildGamePlatformInsight(entries),
      tasteProfileItems: buildCategoryTasteProfileItems(
        entries,
        category,
        gameTagMapByCategory.get(category),
      ),
      favorites: buildFavoriteEntryCards(entries, excludedIds, category),
      favoritesCount,
      mediaSuggestions: mediaSuggestionsResults[index]?.suggestions ?? [],
      recommenderTasteProfile: mediaSuggestionsResults[index]?.tasteProfile ?? null,
    };
  });

  return sections;
}

async function fetchGameInsightTagMap(
  supabase: DashboardSupabaseClient,
  mediaIds: number[],
): Promise<Map<number, Partial<Record<InsightTagBucket, string[]>>>> {
  if (mediaIds.length === 0) {
    return new Map();
  }
  const uniqueMediaIds = Array.from(new Set(mediaIds));
  const { data, error } = await supabase
    .from('media_items')
    .select('id,genres,igdb_themes,igdb_game_modes,igdb_player_perspectives')
    .in('id', uniqueMediaIds);

  if (error || !Array.isArray(data)) {
    return new Map();
  }

  const normalizeArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }
    return Array.from(
      new Set(input.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)),
    );
  };

  const result = new Map<number, Partial<Record<InsightTagBucket, string[]>>>();
  for (const row of data as unknown as Array<Record<string, unknown>>) {
    const id = typeof row.id === 'number' ? row.id : null;
    if (!id) {
      continue;
    }

    const genres = normalizeArray(row.genres);
    const themes = normalizeArray(row.igdb_themes);
    const modes = normalizeArray(row.igdb_game_modes);
    const perspectives = normalizeArray(row.igdb_player_perspectives);

    result.set(id, {
      subgenre: genres,
      mechanic: modes,
      theme: themes,
      structure: perspectives,
    });
  }

  return result;
}

function buildCategoryTasteProfileItems(
  entries: CategoryEntryRow[],
  category: DashboardCategoryKey,
  gameTagMap?: Map<number, Partial<Record<InsightTagBucket, string[]>>>,
): CategoryTasteProfileItem[] {
  return entries.map(entry => ({
    title:
      entry.media_items?.title ??
      entry.media_items?.title_english ??
      entry.media_items?.title_romaji ??
      entry.media_items?.title_native ??
      entry.media_items?.original_title ??
      null,
    status: entry.status,
    score: typeof entry.score === 'number' && Number.isFinite(entry.score) ? entry.score : null,
    progress: typeof entry.progress === 'number' && Number.isFinite(entry.progress) ? entry.progress : null,
    isFavorite: Boolean(entry.is_favorite),
    genres: Array.isArray(entry.media_items?.genres)
      ? entry.media_items?.genres.filter((genre): genre is string => Boolean(genre?.trim()))
      : [],
    tags: category === 'games' ? [] : extractTasteTagLabelsFromMediaTags(entry.media_items?.tags),
    bucketTags:
      category === 'games' && entry.media_items?.id
        ? (gameTagMap?.get(entry.media_items.id) ?? {})
        : undefined,
  }));
}

async function fetchCategoryEntries(
  supabase: DashboardSupabaseClient,
  userId: string,
  category: DashboardCategoryKey,
): Promise<CategoryEntryRow[]> {
  const runQuery = async (selectStatement: string) => {
    const rows: CategoryEntryRow[] = [];
    let page = 0;

    while (true) {
      const from = page * CATEGORY_ENTRY_PAGE_SIZE;
      const to = from + CATEGORY_ENTRY_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('user_media_entries')
        .select(selectStatement)
        .eq('user_id', userId)
        .eq('media_items.category', category)
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      const pageRows = Array.isArray(data) ? (data as unknown as CategoryEntryRow[]) : [];
      rows.push(...pageRows.filter(row => row.media_items?.category === category));

      if (pageRows.length < CATEGORY_ENTRY_PAGE_SIZE) {
        break;
      }

      page += 1;
    }

    return rows;
  };

  try {
    return await runQuery(CATEGORY_ENTRY_SELECT);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '42703' &&
      /pinned_rank/i.test(JSON.stringify(error))
    ) {
      return runQuery(CATEGORY_ENTRY_SELECT_LEGACY);
    }
    throw error;
  }
}

async function fetchCategoryChartPoints(
  supabase: DashboardSupabaseClient,
  userId: string,
  category: DashboardCategoryKey,
): Promise<CategoryChartRow[]> {
  const since = subDays(new Date(), DEFAULT_CHART_DAYS).toISOString();
  const { data, error } = await supabase.rpc('category_dashboard_history', {
    p_user_id: userId,
    p_category: category,
    p_since: since,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? (data as CategoryChartRow[]) : [];
}

function resolveTitle(media: NonNullable<CategoryEntryRow['media_items']>): string | null {
  return (
    media.title ??
    media.title_english ??
    media.title_romaji ??
    media.title_native ??
    media.original_title ??
    null
  );
}

function getCover(media: NonNullable<CategoryEntryRow['media_items']>): string {
  return media.cover_image_large ?? media.cover_image_medium ?? DEFAULT_COVER;
}

function deriveSubtitle(entry: CategoryEntryRow, category: DashboardCategoryKey): string {
  const media = entry.media_items;
  if (!media) {
    return CATEGORY_LABELS[category];
  }
  const genre = (media.genres ?? []).find(Boolean);
  const tag = (media.tags ?? []).find(Boolean);
  const format = media.format;
  const entryPlatform = entry.selected_platform?.trim();
  const mediaPlatform = (media.platforms ?? []).find(Boolean);
  const platform = entryPlatform ?? mediaPlatform;

  switch (category) {
    case 'games':
      return platform ?? genre ?? format ?? `${CATEGORY_LABELS[category]} favorite`;
    case 'books':
      return tag ?? genre ?? `${CATEGORY_LABELS[category]} favorite`;
    case 'anime':
      return genre ?? format ?? `${CATEGORY_LABELS[category]} favorite`;
    case 'manga':
      return genre ?? tag ?? `${CATEGORY_LABELS[category]} favorite`;
    case 'movies':
      return format ?? genre ?? `${CATEGORY_LABELS[category]} favorite`;
    default:
      return CATEGORY_LABELS[category];
  }
}

function computeProgressPercent(
  entry: CategoryEntryRow,
  media: NonNullable<CategoryEntryRow['media_items']>,
  category: DashboardCategoryKey,
): number | undefined {
  if (entry.progress === null || entry.progress === undefined) {
    return undefined;
  }

  const total = getCategoryTotal(media, category);
  if (!total || total === 0) {
    return undefined;
  }

  return Math.min(100, Math.round((entry.progress / total) * 100));
}

function getCategoryTotal(
  media: NonNullable<CategoryEntryRow['media_items']>,
  category: DashboardCategoryKey,
): number | null {
  switch (category) {
    case 'games':
    case 'movies':
      return media.runtime ?? media.duration ?? null;
    case 'anime':
      return media.number_of_episodes ?? media.episodes ?? null;
    case 'tv':
      return media.number_of_episodes ?? media.episodes ?? null;
    case 'manga':
      return media.volumes ?? media.chapters ?? null;
    case 'books':
      return media.page_count ?? null;
    default:
      return null;
  }
}

function enrichEntry(
  entry: CategoryEntryRow,
  category: DashboardCategoryKey,
): DashboardTopFiveItem {
  const media = entry.media_items!;
  const title = resolveTitle(media) ?? CATEGORY_LABELS[category];
  const cover = getCover(media);
  const subtitle = deriveSubtitle(entry, category);
  const progressPercent = computeProgressPercent(entry, media, category);
  const rating =
    entry.score !== null && entry.score !== undefined ? entry.score.toFixed(1) : undefined;
  const lastActivity = entry.updated_at ?? entry.created_at ?? undefined;

  return {
    entryId: entry.id,
    mediaId: media.id,
    title,
    cover,
    subtitle,
    progressPercent,
    rating,
    status: entry.status,
    lastActivityAt: lastActivity,
    isFavorite: Boolean(entry.is_favorite),
  };
}

function buildTopFive(
  entries: CategoryEntryRow[],
  category: DashboardCategoryKey,
): DashboardTopFiveItem[] {
  const pinnedEntries = entries
    .filter(entry => entry.pinned_rank !== null && entry.pinned_rank !== undefined)
    .sort((a, b) => (a.pinned_rank ?? Infinity) - (b.pinned_rank ?? Infinity));

  let topCandidates = pinnedEntries.slice(0, 5);

  if (!topCandidates.length) {
    const favoriteEntries = entries.filter(
      entry => entry.is_favorite && entry.status === 'completed',
    );
    if (!favoriteEntries.length) {
      return [];
    }
    topCandidates = sortEntries(favoriteEntries, category).slice(0, 5);
  }

  return topCandidates.map(entry => enrichEntry(entry, category));
}

function sortEntries(entries: CategoryEntryRow[], category: DashboardCategoryKey) {
  return [...entries].sort((a, b) => {
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    if (priorityB !== priorityA) {
      return priorityB - priorityA;
    }
    const ratingA = a.score ?? 0;
    const ratingB = b.score ?? 0;
    if (ratingB !== ratingA) {
      return ratingB - ratingA;
    }
    const progressA = computeProgressPercent(a, a.media_items!, category) ?? 0;
    const progressB = computeProgressPercent(b, b.media_items!, category) ?? 0;
    if (progressB !== progressA) {
      return progressB - progressA;
    }
    const updatedA = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const updatedB = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return updatedB - updatedA;
  });
}

function buildFavoriteEntryCards(
  entries: CategoryEntryRow[],
  excludedIds: Set<number>,
  category: DashboardCategoryKey,
): DashboardTopFiveItem[] {
  return sortEntries(
    entries.filter(
      entry => entry.is_favorite && entry.status === 'completed' && !excludedIds.has(entry.id),
    ),
    category,
  ).map(entry => enrichEntry(entry, category));
}

const GAMES_PLATFORM_INSUFFICIENT_DATA = 'Not enough data to compare platforms yet.';
const MIN_PLATFORM_ENTRIES_FOR_COMPARISON = 3;

function normalizePlatformLabel(platform: string | null | undefined): string {
  const value = platform?.trim();
  if (!value) {
    return 'Unspecified';
  }

  const normalized = value.toLowerCase();
  if (
    normalized === 'pc' ||
    normalized === 'pc (microsoft windows)' ||
    normalized === 'microsoft windows' ||
    normalized === 'windows'
  ) {
    return 'PC';
  }

  return value;
}

function resolvePlatformForInsight(entry: CategoryEntryRow): string {
  const selected = entry.selected_platform?.trim();
  if (selected) {
    return selected;
  }

  const mediaPlatforms = Array.isArray(entry.media_items?.platforms)
    ? entry.media_items.platforms.map(item => item?.trim()).filter(Boolean)
    : [];

  // If we only have one catalog platform, use it as a safe fallback.
  if (mediaPlatforms.length === 1) {
    return mediaPlatforms[0];
  }

  return 'Unspecified';
}

function buildGamePlatformInsight(entries: CategoryEntryRow[]): PlatformInsightPayload {
  const platformMap = new Map<
    string,
    { total: number; completed: number; dropped: number; attempts: number }
  >();

  for (const entry of entries) {
    const platform = normalizePlatformLabel(resolvePlatformForInsight(entry));
    const current = platformMap.get(platform) ?? {
      total: 0,
      completed: 0,
      dropped: 0,
      attempts: 0,
    };

    current.total += 1;
    if (entry.status === 'completed') {
      current.completed += 1;
      current.attempts += 1;
    }
    if (entry.status === 'dropped') {
      current.dropped += 1;
      current.attempts += 1;
    }

    platformMap.set(platform, current);
  }

  const rows: PlatformInsightRow[] = Array.from(platformMap.entries())
    .map(([platform, counts]) => ({
      platform,
      total: counts.attempts,
      completed: counts.completed,
      dropped: counts.dropped,
      completionRate:
        counts.attempts > 0 ? Math.round((counts.completed / counts.attempts) * 100) : 0,
    }))
    .filter(row => row.total > 0)
    .sort((a, b) => {
      if (b.completionRate !== a.completionRate) {
        return b.completionRate - a.completionRate;
      }
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      return a.platform.localeCompare(b.platform);
    });

  const comparableRows = rows.filter(row => row.total >= MIN_PLATFORM_ENTRIES_FOR_COMPARISON);
  if (comparableRows.length < 2) {
    return {
      rows,
      best: null,
      worst: null,
      summary: GAMES_PLATFORM_INSUFFICIENT_DATA,
    };
  }

  const best = [...comparableRows].sort((a, b) => {
    if (b.completionRate !== a.completionRate) {
      return b.completionRate - a.completionRate;
    }
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.platform.localeCompare(b.platform);
  })[0];

  const worst = [...comparableRows].sort((a, b) => {
    if (a.completionRate !== b.completionRate) {
      return a.completionRate - b.completionRate;
    }
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.platform.localeCompare(b.platform);
  })[0];

  const summary =
    best.completionRate === worst.completionRate
      ? `You complete titles at a similar rate on ${best.platform} and ${worst.platform} (${best.completionRate}%).`
      : `You complete more titles on ${best.platform} (${best.completionRate}%) than ${worst.platform} (${worst.completionRate}%).`;

  return { rows, best, worst, summary };
}

function buildCategoryChart(
  category: DashboardCategoryKey,
  rows: CategoryChartRow[],
): CategoryChartPayload {
  const data = rows.map(row => ({
    label: row.day ? format(new Date(row.day), 'MMM d') : 'Unknown',
    completed: row.completed ?? 0,
    dropped: row.dropped ?? 0,
  }));

  const totalCompleted = data.reduce((sum, point) => sum + point.completed, 0);
  const totalDropped = data.reduce((sum, point) => sum + point.dropped, 0);
  const total = totalCompleted + totalDropped;

  const insight =
    total === 0
      ? `No ${CATEGORY_LABELS[category].toLowerCase()} completions recorded yet — log more entries to populate this chart.`
      : `You complete ${Math.round((totalCompleted / total) * 100)}% of ${CATEGORY_LABELS[category].toLowerCase()} entries because ${totalCompleted} were completed and ${totalDropped} were dropped recently.`;

  return {
    data,
    insight,
  };
}

function buildCategoryInsights(entries: CategoryEntryRow[]): CategoryInsightsPayload {
  const statusCounts: Record<TasteProfileStatus, number> = {
    planned: 0,
    current: 0,
    completed: 0,
    dropped: 0,
  };
  const now = new Date();
  const cutoff7Days = subDays(now, 7).getTime();
  const cutoff30Days = subDays(now, 30).getTime();
  let updatedLast7Days = 0;
  let updatedLast30Days = 0;

  for (const entry of entries) {
    statusCounts[entry.status] += 1;

    const updatedAt = entry.updated_at ?? entry.created_at;
    if (!updatedAt) {
      continue;
    }
    const ts = new Date(updatedAt).getTime();
    if (!Number.isFinite(ts)) {
      continue;
    }
    if (ts >= cutoff30Days) {
      updatedLast30Days += 1;
    }
    if (ts >= cutoff7Days) {
      updatedLast7Days += 1;
    }
  }

  const completionNumerator = statusCounts.completed;
  const completionDenominator = statusCounts.completed + statusCounts.dropped;
  const completionRate =
    completionDenominator > 0 ? Math.round((completionNumerator / completionDenominator) * 100) : 0;

  return {
    statusCounts,
    completionRate,
    completionNumerator,
    completionDenominator,
    updatedLast7Days,
    updatedLast30Days,
  };
}

function buildRhythmEntries(entries: CategoryEntryRow[]): CategoryRhythmEntry[] {
  return entries.map(entry => {
    const media = entry.media_items;
    const genres = Array.isArray(media?.genres)
      ? media.genres.map(genre => (typeof genre === 'string' ? genre.trim() : '')).filter(Boolean)
      : [];
    const themes = Array.isArray(media?.igdb_themes)
      ? media.igdb_themes
          .map(theme => (typeof theme === 'string' ? theme.trim() : ''))
          .filter(Boolean)
      : [];
    const runtime =
      typeof media?.runtime === 'number' && Number.isFinite(media.runtime)
        ? media.runtime
        : typeof media?.duration === 'number' && Number.isFinite(media.duration)
          ? media.duration
          : null;

    return {
      updatedAt: entry.updated_at,
      createdAt: entry.created_at,
      status: entry.status,
      score: typeof entry.score === 'number' && Number.isFinite(entry.score) ? entry.score : null,
      progress:
        typeof entry.progress === 'number' && Number.isFinite(entry.progress)
          ? entry.progress
          : null,
      isFavorite: Boolean(entry.is_favorite),
      selectedPlatform:
        typeof entry.selected_platform === 'string' && entry.selected_platform.trim().length > 0
          ? entry.selected_platform.trim()
          : null,
      genres,
      themes,
      runtime,
    };
  });
}

// ============================================================================
// Media Suggestions Algorithm
// ============================================================================

/**
 * Normalizes a title by removing version-specific keywords
 * This helps detect similar games (e.g., "Alan Wake" vs "Alan Wake Remastered")
 */
function normalizeTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      // Remove common version keywords at the end
      .replace(
        /\s*:?\s*(remastered|remake|definitive edition|complete edition|enhanced edition|royal edition|scholar of the first sin|goty|game of the year edition|deluxe edition|ultimate edition)\s*$/i,
        '',
      )
      // Remove "Part X" or "Part I/II/III"
      .replace(/\s*:?\s*part\s+(\d+|i+|v+)\s*$/i, '')
      // Remove year editions like "2023" or "(2023)"
      .replace(/\s*[\(\[]?\d{4}[\)\]]?\s*$/i, '')
      .trim()
  );
}

/**
 * Checks if two titles are similar (likely the same game, different versions)
 */
function areTitlesSimilar(title1: string, title2: string): boolean {
  const normalized1 = normalizeTitle(title1);
  const normalized2 = normalizeTitle(title2);

  // Exact match after normalization
  if (normalized1 === normalized2) {
    return true;
  }

  // One is substring of the other (e.g., "Dark Souls II" in "Dark Souls II Scholar")
  const longer = normalized1.length > normalized2.length ? normalized1 : normalized2;
  const shorter = normalized1.length > normalized2.length ? normalized2 : normalized1;

  if (longer.startsWith(shorter) && longer.length - shorter.length < 10) {
    return true;
  }

  return false;
}

/**
 * Converts a title to a URL-friendly slug
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// Series Detection Logic
// ============================================================================

type SeriesInfo = {
  isSeries: boolean;
  seriesName: string;
  sequenceNumber: number;
};

/**
 * Detects if a title is a sequel/numbered entry in a series
 * Returns series information if detected
 */
function detectSeries(title: string): SeriesInfo {
  const normalizedTitle = title.trim();

  // Pattern 1: Arabic numerals (e.g., "Dragon Age 2", "The Witcher 3")
  const arabicPattern = /^(.+?)\s+(\d+)(?:\s*[-:]\s*|\s+|$)/i;
  const arabicMatch = normalizedTitle.match(arabicPattern);
  if (arabicMatch) {
    const seriesName = arabicMatch[1].trim();
    const number = parseInt(arabicMatch[2], 10);
    if (number > 1 && number <= 10) {
      // Reasonable range for sequels
      return { isSeries: true, seriesName, sequenceNumber: number };
    }
  }

  // Pattern 2: Roman numerals (e.g., "Dark Souls II", "Final Fantasy VII")
  const romanPattern = /^(.+?)\s+(II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)(?:\s*[-:]\s*|\s+|$)/i;
  const romanMatch = normalizedTitle.match(romanPattern);
  if (romanMatch) {
    const seriesName = romanMatch[1].trim();
    const romanNumeral = romanMatch[2].toUpperCase();
    const romanToArabic: Record<string, number> = {
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
      XI: 11,
      XII: 12,
    };
    const number = romanToArabic[romanNumeral];
    if (number && number > 1) {
      return { isSeries: true, seriesName, sequenceNumber: number };
    }
  }

  // Pattern 3: Words like "Part", "Chapter", "Episode" (e.g., "The Walking Dead: Episode 2")
  const partPattern = /^(.+?)\s*[-:]\s*(Part|Chapter|Episode|Season)\s+(\d+)/i;
  const partMatch = normalizedTitle.match(partPattern);
  if (partMatch) {
    const seriesName = partMatch[1].trim();
    const number = parseInt(partMatch[3], 10);
    if (number > 1 && number <= 20) {
      return { isSeries: true, seriesName, sequenceNumber: number };
    }
  }

  return { isSeries: false, seriesName: '', sequenceNumber: 0 };
}

type PrerequisiteCheckResult = {
  canRecommend: boolean;
  reason?: string;
  previousGameTitle?: string;
};

/**
 * Checks if user has played/completed previous games in the series
 * Returns whether prerequisites are met and the reason
 */
function checkSeriesPrerequisites(
  title: string,
  seriesInfo: SeriesInfo,
  userEntries: CategoryEntryRow[],
): PrerequisiteCheckResult {
  // If it's not a series, allow it
  if (!seriesInfo.isSeries) {
    return { canRecommend: true };
  }

  // For sequels (number > 1), check if previous games exist in library
  if (seriesInfo.sequenceNumber > 1) {
    // Look for ANY previous game in the series (could be numbered or unnumbered)
    const previousNumber = seriesInfo.sequenceNumber - 1;

    // Try to find previous game in user's library
    let foundEntry: CategoryEntryRow | null = null;
    let foundTitle = '';

    for (const entry of userEntries) {
      const media = entry.media_items;
      if (!media) {
        continue;
      }

      const entryTitle =
        media.title ??
        media.title_english ??
        media.title_romaji ??
        media.title_native ??
        media.original_title ??
        '';

      if (!entryTitle) {
        continue;
      }

      // Check if this entry matches the previous game in the series
      const entrySeriesInfo = detectSeries(entryTitle);

      // Strategy 1: Exact match - same series and previous number
      if (
        entrySeriesInfo.isSeries &&
        entrySeriesInfo.seriesName.toLowerCase() === seriesInfo.seriesName.toLowerCase() &&
        entrySeriesInfo.sequenceNumber === previousNumber
      ) {
        // Must be completed (not just current - they need to finish it first!)
        if (entry.status === 'completed') {
          foundEntry = entry;
          foundTitle = entryTitle;
          break;
        }
      }

      // Strategy 2: First game might not have a number (e.g., "Dragon Age: Origins")
      // Check if the title starts with the series name but has NO number
      if (seriesInfo.sequenceNumber === 2) {
        const normalizedEntry = entryTitle.toLowerCase();
        const normalizedSeriesName = seriesInfo.seriesName.toLowerCase();

        // Title starts with series name
        if (normalizedEntry.startsWith(normalizedSeriesName)) {
          // Check if it's NOT a numbered entry (to avoid matching "Dragon Age 3" when looking for prequel to "Dragon Age 2")
          if (!entrySeriesInfo.isSeries) {
            // This is likely the first game (unnumbered)
            if (entry.status === 'completed') {
              foundEntry = entry;
              foundTitle = entryTitle;
              break;
            }
          }
        }
      }

      // Strategy 3: Check if there's ANY game in the same series with lower sequence number
      if (
        entrySeriesInfo.isSeries &&
        entrySeriesInfo.seriesName.toLowerCase() === seriesInfo.seriesName.toLowerCase() &&
        entrySeriesInfo.sequenceNumber < seriesInfo.sequenceNumber
      ) {
        // Must be completed (not just current - they need to finish it first!)
        if (entry.status === 'completed') {
          foundEntry = entry;
          foundTitle = entryTitle;
          break;
        }
      }
    }

    // If previous game is found and completed, allow the sequel
    if (foundEntry && foundEntry.status === 'completed') {
      return {
        canRecommend: true,
        reason: `Ready for the next chapter - you completed ${foundTitle}`,
        previousGameTitle: foundTitle,
      };
    }

    // If previous game is not found or not played enough, block this sequel
    return { canRecommend: false };
  }

  return { canRecommend: true }; // First game in series is always allowed
}

/**
 * List of series where games are standalone-friendly (can jump in at any point)
 */
const STANDALONE_FRIENDLY_SERIES = [
  'final fantasy',
  'elder scrolls',
  'divinity: original sin',
  'persona',
  'dragon quest',
] as const;

/**
 * Checks if a series is standalone-friendly (no penalty for missing prerequisites)
 */
function isStandaloneFriendlySeries(seriesName: string): boolean {
  const normalized = seriesName.toLowerCase();
  return STANDALONE_FRIENDLY_SERIES.some(friendly => normalized.includes(friendly));
}

/**
 * Infers the title of the previous game in a series
 */
function inferPreviousGameTitle(seriesInfo: SeriesInfo, currentTitle: string): string {
  if (!seriesInfo.isSeries || seriesInfo.sequenceNumber <= 1) {
    return '';
  }

  const previousNumber = seriesInfo.sequenceNumber - 1;

  // For sequels to the first game, often the first game has no number
  if (previousNumber === 1) {
    // Try to construct: just the series name
    return seriesInfo.seriesName;
  }

  // For other sequels, try to construct the previous numbered title
  // Replace the current number with the previous number
  const currentNumberStr = seriesInfo.sequenceNumber.toString();

  // Try roman numerals first
  const romanMap: Record<number, string> = {
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
    6: 'VI',
    7: 'VII',
    8: 'VIII',
    9: 'IX',
    10: 'X',
    11: 'XI',
    12: 'XII',
  };

  const currentRoman = romanMap[seriesInfo.sequenceNumber];
  const previousRoman = romanMap[previousNumber];

  if (currentRoman && previousRoman && currentTitle.includes(currentRoman)) {
    return currentTitle.replace(currentRoman, previousRoman);
  }

  // Try arabic numerals
  if (currentTitle.includes(` ${currentNumberStr}`)) {
    return currentTitle.replace(` ${currentNumberStr}`, ` ${previousNumber}`);
  }

  // Fallback: just use series name with previous number
  return `${seriesInfo.seriesName} ${previousNumber}`;
}

/**
 * Calculates a score penalty for sequels where prerequisites haven't been met
 * Returns 0 if no penalty should apply (not a sequel, or standalone-friendly series)
 * Returns 0.10-0.18 for sequels with missing prerequisites
 */
function getSeriesPrereqPenalty(
  seriesInfo: SeriesInfo,
  title: string,
  prerequisiteCheck: PrerequisiteCheckResult,
): number {
  // No penalty if prerequisites are met
  if (prerequisiteCheck.canRecommend) {
    return 0;
  }

  // No penalty if not a sequel
  if (!seriesInfo.isSeries || seriesInfo.sequenceNumber <= 1) {
    return 0;
  }

  // No penalty for standalone-friendly series
  if (isStandaloneFriendlySeries(seriesInfo.seriesName)) {
    return 0;
  }

  // Apply penalty for sequels without prerequisites
  // Base penalty: 0.10
  // Additional penalty based on sequence number (later sequels = higher penalty)
  const basePenalty = 0.1;
  const sequencePenalty = Math.min(0.08, (seriesInfo.sequenceNumber - 2) * 0.02);

  return basePenalty + sequencePenalty;
}

/**
 * Generates a personalized reason for recommending a backlog item
 * based on user's genre/tag preferences
 */
function generateBacklogReason(
  media: NonNullable<CategoryEntryRow['media_items']>,
  userEntries: CategoryEntryRow[],
  context?: { title?: string },
): string {
  const genres = media.genres ?? [];
  const tags = media.tags ?? [];

  // Analyze user's completed/favorite games to find preferred genres/tags
  const genreCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const entry of userEntries) {
    const entryMedia = entry.media_items;
    if (!entryMedia) {
      continue;
    }

    // ONLY count games you've actually played (completed or current)
    // Skip planned (0 hours) and dropped games
    if (entry.status === 'planned') {
      continue;
    } // Skip backlog items - not played yet!
    if (entry.status === 'dropped') {
      continue;
    } // Skip dropped games

    // Weight completed and favorite games more heavily
    let weight = 1;
    if (entry.status === 'completed') {
      weight = 3;
    }
    if (entry.is_favorite) {
      weight = 4;
    }

    // Factor in hours played (progress) - more hours = more engagement
    const hours = Math.max(0, entry.progress ?? 0);
    // Hours multiplier: 10h=1.5x, 20h=2x, 50h=3.5x, 100h=6x, 200h=11x
    // This heavily boosts genres from games you spent a lot of time in
    const hoursMultiplier = 1 + hours / 20;
    weight *= hoursMultiplier;

    // Count genres
    for (const genre of entryMedia.genres ?? []) {
      if (!genre) {
        continue;
      }
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + weight);
    }

    // Count tags (limit to avoid noise)
    const entryTags = (entryMedia.tags ?? []).slice(0, 5);
    for (const tag of entryTags) {
      if (!tag) {
        continue;
      }
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + weight);
    }
  }

  // Find matching genres/tags between this game and user's preferences
  // ONLY show genres that are significant (at least 50% of your top genre's weight AND positive)
  const sortedGenres = genres
    .filter(g => g && (genreCounts.get(g) ?? 0) > 0) // ONLY positive weights
    .sort((a, b) => (genreCounts.get(b) ?? 0) - (genreCounts.get(a) ?? 0));

  // Calculate threshold: 50% of top genre's weight (stricter filtering)
  const topGenreWeight = sortedGenres.length > 0 ? (genreCounts.get(sortedGenres[0]) ?? 0) : 0;
  const genreThreshold = topGenreWeight * 0.5;

  const matchingGenres = sortedGenres
    .filter(g => (genreCounts.get(g) ?? 0) >= genreThreshold)
    .slice(0, 2);

  // Same for tags: 50% threshold AND positive weight
  const sortedTags = tags
    .filter(t => t && (tagCounts.get(t) ?? 0) > 0) // ONLY positive weights
    .sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0));

  const topTagWeight = sortedTags.length > 0 ? (tagCounts.get(sortedTags[0]) ?? 0) : 0;
  const tagThreshold = topTagWeight * 0.5;

  const matchingTags = sortedTags.filter(t => (tagCounts.get(t) ?? 0) >= tagThreshold).slice(0, 2);

  const title =
    context?.title ??
    media.title ??
    media.title_english ??
    media.title_romaji ??
    media.title_native ??
    media.original_title ??
    'Untitled';

  dbg('backlog-reason-analysis', {
    title,
    mediaGenres: genres,
    mediaTags: tags.slice(0, 8),
    topGenreWeight,
    genreThreshold,
    matchingGenres,
    topTagWeight,
    tagThreshold,
    matchingTags,
  });

  // Generate reason based on matches
  if (matchingGenres.length > 0 && matchingTags.length > 0) {
    return `You enjoy ${matchingGenres.join(' & ')} with ${matchingTags[0]}`;
  } else if (matchingGenres.length > 0) {
    return `You enjoy ${matchingGenres.join(' & ')} games`;
  } else if (matchingTags.length > 0) {
    return `Matches your interest in ${matchingTags.join(' & ')}`;
  } else {
    // Fallback: check if it's a popular genre
    const popularGenres = genres.slice(0, 2).filter(Boolean);
    if (popularGenres.length > 0) {
      return `${popularGenres.join(' & ')} game in your backlog`;
    }
    return 'In your backlog - ready to start';
  }
}

type UserPreferences = {
  favoriteGenres: Map<string, number>; // genre -> weight (can be negative for dropped)
  favoriteTags: Map<string, number>; // tag -> weight
  userBucketWeights: Record<InsightTagBucket, Map<string, number>>;
  droppedGenreCombinations: Set<string>; // stringified genre arrays from dropped games
  droppedSubgenreCombinations: Set<string>;
  droppedSubgenreCounts: Map<string, number>;
  averageRating: number;
  completedCount: number;
  totalEntries: number;
};

type CandidateItem = {
  id: number;
  category: string | null;
  title: string | null;
  title_english: string | null;
  title_romaji: string | null;
  title_native: string | null;
  original_title: string | null;
  cover_image_large: string | null;
  cover_image_medium: string | null;
  genres: string[] | null;
  tags: unknown[] | null;
  candidateBucketTags?: Partial<Record<InsightTagBucket, string[]>>;
};

type GameSuggestionContributor = {
  bucket: InsightTagBucket | 'genre';
  label: string;
  weightedScore: number;
};

type GameScoreResult = {
  score: number;
  contributors: GameSuggestionContributor[];
  hasPersonalSignal: boolean;
};

const GAME_BUCKET_CHANNEL_WEIGHTS: Record<InsightTagBucket, number> = {
  subgenre: 0.46,
  mechanic: 0.22,
  mood: 0.04,
  theme: 0.18,
  structure: 0.1,
};
const GAME_GENRE_FALLBACK_WEIGHT = 0.15;
const GAME_DROPPED_SUBGENRE_BLOCK_THRESHOLD = 2;
const GAME_DROPPED_SUBGENRE_PENALTY = 0.35;
const GAME_REQUIRED_SUBGENRE_POSITIVE_MATCH = 0.2;
const GAME_MIN_EXTERNAL_CONFIDENCE = 0.5;
const MIN_VISIBLE_CONFIDENCE = 0.5;
const MIN_VISIBLE_BACKLOG_CONFIDENCE = 0.6;
const MIN_VISIBLE_FALLBACK_CONFIDENCE = 0.6;
const PERSONAL_SMALL_LIBRARY_THRESHOLD = 10;
const PERSONAL_MAX_GENRES_PER_ITEM = 3;
const PERSONAL_MAX_BUCKET_TAGS_PER_ITEM = 3;
const PERSONAL_STATUS_WEIGHT = {
  completed: 1.8,
  current: 1.0,
  planned: 0.3,
} as const;
const PERSONAL_FAVORITE_BONUS = 0.9;
const PERSONAL_DROPPED_WEIGHT = {
  NO_RATING: -0.35,
  LOW_RATING: -1.2,
  HIGH_RATING: 0,
} as const;
const PERSONAL_RATING_BOOST = {
  HIGH: 0.95,
  MEDIUM: 0.4,
} as const;
const PERSONAL_PROGRESS_BOOST_MAX = {
  completed: 0.35,
  current: 0.55,
} as const;
const GENERIC_GENRE_NOISE_SET = new Set([
  'action',
  'fantasy',
  'drama',
  'comedy',
  'romance',
  'sci-fi',
]);
const GENERIC_GAME_SUBGENRE_SET = new Set(['adventure']);
const GENRE_ALIAS_MAP: Record<string, string> = {
  'role-playing': 'rpg',
  'role playing': 'rpg',
  'role-playing game': 'rpg',
  'role playing game': 'rpg',
  'role-playing (rpg)': 'rpg',
  'role-playing rpg': 'rpg',
  'turn-based strategy': 'turn-based',
  'turn based strategy': 'turn-based',
  'turn-based strategy (tbs)': 'turn-based',
  'turn-based strategy tbs': 'turn-based',
  tbs: 'turn-based',
};
export const PERSONALIZATION_MODEL_DEFAULTS = {
  smallLibraryThreshold: PERSONAL_SMALL_LIBRARY_THRESHOLD,
  maxGenresPerItem: PERSONAL_MAX_GENRES_PER_ITEM,
  maxBucketTagsPerItem: PERSONAL_MAX_BUCKET_TAGS_PER_ITEM,
  statusWeight: PERSONAL_STATUS_WEIGHT,
  favoriteBonus: PERSONAL_FAVORITE_BONUS,
  droppedWeight: PERSONAL_DROPPED_WEIGHT,
  ratingBoost: PERSONAL_RATING_BOOST,
  progressBoostMax: PERSONAL_PROGRESS_BOOST_MAX,
  gameBucketWeights: GAME_BUCKET_CHANNEL_WEIGHTS,
  gameGenreFallbackWeight: GAME_GENRE_FALLBACK_WEIGHT,
};
const DEBUG_GAME_SUGGESTIONS = process.env.DEBUG_GAME_SUGGESTIONS === '1';
const DASHBOARD_SUGGESTIONS_DEBUG =
  process.env.DASHBOARD_SUGGESTIONS_DEBUG === '1' || DEBUG_GAME_SUGGESTIONS;
const DASHBOARD_SUGGESTIONS_TARGET_TITLE = (
  process.env.DASHBOARD_SUGGESTIONS_TARGET_TITLE ?? ''
).trim();

function truncateDebugString(value: string, maxLen = 240): string {
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

function safeDebugJson(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'string') {
          return truncateDebugString(val, 180);
        }
        return val;
      },
      2,
    );
  } catch {
    return '[unserializable]';
  }
}

function dbg(...args: unknown[]) {
  if (!DASHBOARD_SUGGESTIONS_DEBUG) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(...args);
}

function dbgTable(label: string, rows: Array<Record<string, unknown>>) {
  if (!DASHBOARD_SUGGESTIONS_DEBUG) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(label);
  // eslint-disable-next-line no-console
  console.table(rows);
}

function toSafeListPreview(values: string[], max = 5): string[] {
  return values.slice(0, max).map(value => truncateDebugString(value, 120));
}

function formatTagsForDebug(tags: unknown): string {
  if (!Array.isArray(tags)) {
    return '';
  }
  const values: string[] = [];
  for (const tag of tags) {
    if (typeof tag === 'string') {
      const value = tag.trim();
      if (value) {
        values.push(value);
      }
      continue;
    }
    if (!tag || typeof tag !== 'object') {
      continue;
    }
    const record = tag as Record<string, unknown>;
    const value =
      typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : typeof record.slug === 'string' && record.slug.trim()
          ? record.slug.trim()
          : '';
    if (value) {
      values.push(value);
    }
  }
  return Array.from(new Set(values)).join(', ');
}

function resolveCandidateTitle(candidate: CandidateItem): string {
  return (
    candidate.title ??
    candidate.title_english ??
    candidate.title_romaji ??
    candidate.title_native ??
    candidate.original_title ??
    'Untitled'
  );
}

function isTargetTitleMatch(title: string): boolean {
  if (!DASHBOARD_SUGGESTIONS_TARGET_TITLE) {
    return false;
  }
  return title.toLowerCase().includes(DASHBOARD_SUGGESTIONS_TARGET_TITLE.toLowerCase());
}

function normalizePreferenceLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeGenreLabel(value: string): string {
  const normalized = normalizePreferenceLabel(value)
    .replace(/[()]/g, ' ')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  return GENRE_ALIAS_MAP[normalized] ?? normalized;
}

function getGenreNoiseWeight(label: string): number {
  return GENERIC_GENRE_NOISE_SET.has(label) ? 0.45 : 1;
}

function pickTopGenresForItem(
  genres: string[],
  maxGenres = PERSONAL_MAX_GENRES_PER_ITEM,
): string[] {
  if (genres.length === 0) {
    return [];
  }
  const ranked = Array.from(new Set(genres.map(normalizeGenreLabel).filter(Boolean)))
    .map(label => {
      const tokenCount = label.split(/[\s-]+/).filter(Boolean).length;
      const specificity = tokenCount > 1 ? 0.15 : 0;
      return {
        label,
        rank: getGenreNoiseWeight(label) + specificity,
      };
    })
    .sort((a, b) => {
      if (b.rank !== a.rank) {
        return b.rank - a.rank;
      }
      return a.label.localeCompare(b.label);
    });

  return ranked.slice(0, Math.max(1, maxGenres)).map(item => item.label);
}

function pickTopBucketLabels(
  bucket: InsightTagBucket,
  labels: string[],
  maxLabels = PERSONAL_MAX_BUCKET_TAGS_PER_ITEM,
): string[] {
  const normalized = Array.from(
    new Set(
      labels
        .map(label => canonicalizeBucketLabel(bucket, normalizePreferenceLabel(label)))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  return normalized.slice(0, Math.max(1, maxLabels));
}

function getBaseWeight(status: string, score: number | null): number {
  if (status === 'dropped') {
    if (score === null || score === undefined) {
      return PERSONAL_DROPPED_WEIGHT.NO_RATING;
    }
    if (score <= 5) {
      return PERSONAL_DROPPED_WEIGHT.LOW_RATING;
    }
    if (score >= 7) {
      return PERSONAL_DROPPED_WEIGHT.HIGH_RATING;
    }
    return PERSONAL_DROPPED_WEIGHT.NO_RATING;
  }

  return PERSONAL_STATUS_WEIGHT[status as keyof typeof PERSONAL_STATUS_WEIGHT] ?? 0;
}

function getRatingBoost(score: number | null): number {
  if (score === null || score === undefined) {
    return 0;
  }
  if (score >= 8) {
    return PERSONAL_RATING_BOOST.HIGH;
  }
  if (score >= 6) {
    return PERSONAL_RATING_BOOST.MEDIUM;
  }
  return 0;
}

function getFavoriteBonus(isFavorite: boolean | null | undefined): number {
  return isFavorite ? PERSONAL_FAVORITE_BONUS : 0;
}

function getProgressBoost(
  entry: Pick<CategoryEntryRow, 'progress' | 'status'>,
  isGamesMode: boolean,
): number {
  const progress =
    typeof entry.progress === 'number' && Number.isFinite(entry.progress) ? entry.progress : 0;
  if (progress <= 0) {
    return 0;
  }
  if (entry.status !== 'completed' && entry.status !== 'current') {
    return 0;
  }

  const denominator = isGamesMode ? 40 : 100;
  const normalized = Math.max(0, Math.min(1, progress / denominator));
  const curve = Math.sqrt(normalized);
  const maxBoost =
    entry.status === 'completed'
      ? PERSONAL_PROGRESS_BOOST_MAX.completed
      : PERSONAL_PROGRESS_BOOST_MAX.current;
  return curve * maxBoost;
}

function getItemSignalWeight(entry: CategoryEntryRow, isGamesMode: boolean): number {
  const baseWeight = getBaseWeight(entry.status, entry.score);
  const ratingBoost = getRatingBoost(entry.score);
  const favoriteBonus = getFavoriteBonus(entry.is_favorite);
  const progressBoost = getProgressBoost(entry, isGamesMode);
  return baseWeight + ratingBoost + favoriteBonus + progressBoost;
}

type WeightedContribution = {
  label: string;
  score: number;
};

function accumulateDistributedLabels(
  labels: string[],
  totalWeight: number,
  targetMap: Map<string, number>,
): void {
  if (labels.length === 0 || totalWeight === 0) {
    return;
  }
  const perLabelWeight = totalWeight / labels.length;
  for (const label of labels) {
    targetMap.set(label, (targetMap.get(label) ?? 0) + perLabelWeight);
  }
}

function extractNormalizedCandidateTags(tags: unknown[] | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return extractTasteTagLabelsFromMediaTags(tags).map(normalizePreferenceLabel).filter(Boolean);
}

function createEmptyBucketWeightMaps(): Record<InsightTagBucket, Map<string, number>> {
  return {
    subgenre: new Map(),
    mechanic: new Map(),
    mood: new Map(),
    theme: new Map(),
    structure: new Map(),
  };
}

/**
 * Analyzes user's entries to extract preferences
 */
function analyzeUserPreferences(
  entries: CategoryEntryRow[],
  gameTagMap?: Map<number, Partial<Record<InsightTagBucket, string[]>>>,
): UserPreferences {
  const isGamesMode = Boolean(gameTagMap);
  const genreWeights = new Map<string, number>();
  const tagWeights = new Map<string, number>();
  const userBucketWeights = createEmptyBucketWeightMaps();
  const droppedGenreCombinations = new Set<string>();
  const droppedSubgenreCombinations = new Set<string>();
  const droppedSubgenreCounts = new Map<string, number>();
  const droppedGamesDebug: Array<{ title: string; subgenres: string[] }> = [];
  let totalRating = 0;
  let ratingCount = 0;
  const completedCount = entries.filter(e => e.status === 'completed').length;

  for (const entry of entries) {
    const media = entry.media_items;
    if (!media) {
      continue;
    }

    const rawGenres = media.genres ?? [];
    const genres = pickTopGenresForItem(rawGenres);
    const isDropped = entry.status === 'dropped';

    // Track dropped genre combinations
    if (isDropped && genres.length > 0) {
      const genreKey = [...genres].sort().join('|');
      droppedGenreCombinations.add(genreKey);
    }

    let totalWeight = getItemSignalWeight(entry, isGamesMode);
    if (entries.length <= PERSONAL_SMALL_LIBRARY_THRESHOLD && entry.status === 'planned') {
      totalWeight *= 0.7;
    }

    if (totalWeight === 0 && !isDropped) {
      continue;
    }

    if (entry.score !== null && entry.score !== undefined && entry.status === 'completed') {
      totalRating += entry.score;
      ratingCount++;
    }

    const weightedGenres = genres.map(label => ({
      label,
      adjustedWeight: totalWeight * getGenreNoiseWeight(label),
    }));
    const genreWeightDenominator = weightedGenres.reduce(
      (sum, genre) => sum + genre.adjustedWeight,
      0,
    );
    if (genreWeightDenominator > 0) {
      for (const genre of weightedGenres) {
        const distributed = (genre.adjustedWeight / genreWeightDenominator) * totalWeight;
        genreWeights.set(genre.label, (genreWeights.get(genre.label) ?? 0) + distributed);
      }
    }

    // For games, tags come from bucket links and should not contribute to favoriteTags.
    if (!isGamesMode) {
      const tags = pickTopBucketLabels(
        'theme',
        extractTasteTagLabelsFromMediaTags(media.tags)
          .map(normalizePreferenceLabel)
          .filter(Boolean),
        2,
      );
      accumulateDistributedLabels(tags, totalWeight, tagWeights);
    }

    const mediaId = entry.media_items?.id;
    if (typeof mediaId === 'number' && gameTagMap?.has(mediaId)) {
      const bucketTags = gameTagMap.get(mediaId) ?? {};
      const normalizedSubgenres = pickTopBucketLabels('subgenre', bucketTags.subgenre ?? []);
      if (isDropped && normalizedSubgenres.length > 0) {
        droppedSubgenreCombinations.add([...normalizedSubgenres].sort().join('|'));
        // Track for debug output
        const title =
          media.title ??
          media.title_english ??
          media.title_romaji ??
          media.title_native ??
          media.original_title ??
          'Unknown';
        droppedGamesDebug.push({ title, subgenres: normalizedSubgenres });
      }
      for (const bucket of INSIGHT_TAG_BUCKETS) {
        const labels = pickTopBucketLabels(bucket, bucketTags[bucket] ?? []);
        accumulateDistributedLabels(labels, totalWeight, userBucketWeights[bucket]);
        if (isDropped && bucket === 'subgenre') {
          for (const label of labels) {
            droppedSubgenreCounts.set(label, (droppedSubgenreCounts.get(label) ?? 0) + 1);
          }
        }
      }
    }
  }

  // Debug: Show which subgenres are blocked
  if (isGamesMode && droppedSubgenreCounts.size > 0) {
    const blockedSubgenres = Array.from(droppedSubgenreCounts.entries())
      .filter(([, count]) => count >= GAME_DROPPED_SUBGENRE_BLOCK_THRESHOLD)
      .sort((a, b) => b[1] - a[1]);
    if (blockedSubgenres.length > 0) {
      dbg('BLOCKED SUBGENRES WARNING', {
        threshold: GAME_DROPPED_SUBGENRE_BLOCK_THRESHOLD,
        totalDroppedGames: droppedGamesDebug.length,
        droppedGames: droppedGamesDebug,
        blockedSubgenres: blockedSubgenres.map(([subgenre, count]) => ({
          subgenre,
          droppedCount: count,
        })),
        hint: 'These subgenres will block recommendations. Check your dropped games and update their status if needed.',
      });
    }
  }

  return {
    favoriteGenres: genreWeights,
    favoriteTags: tagWeights,
    userBucketWeights,
    droppedGenreCombinations,
    droppedSubgenreCombinations,
    droppedSubgenreCounts,
    averageRating: ratingCount > 0 ? totalRating / ratingCount : 0,
    completedCount,
    totalEntries: entries.length,
  };
}

/**
 * Scores a candidate item based on user preferences
 */
function scoreCandidateItem(
  candidate: CandidateItem,
  preferences: UserPreferences,
): { score: number; contributors: WeightedContribution[]; hasPersonalSignal: boolean } {
  const candidateGenres = pickTopGenresForItem(candidate.genres ?? []);
  const candidateTags = pickTopBucketLabels(
    'theme',
    extractNormalizedCandidateTags(candidate.tags),
    2,
  );

  // Check if this exact genre combination was dropped
  const genreKey = [...candidateGenres].sort().join('|');
  if (genreKey && preferences.droppedGenreCombinations.has(genreKey)) {
    return { score: 0, contributors: [], hasPersonalSignal: false };
  }

  const genreResult = scoreLabelsAgainstPreferenceMap(candidateGenres, preferences.favoriteGenres);
  const tagResult = scoreLabelsAgainstPreferenceMap(candidateTags, preferences.favoriteTags);

  const positiveScore = genreResult.positive * 0.72 + tagResult.positive * 0.28;
  const negativePenalty = genreResult.negative * 0.62 + tagResult.negative * 0.38;
  const score = Math.max(0, Math.min(1, positiveScore - negativePenalty));

  const contributors: WeightedContribution[] = [
    ...genreResult.contributors.map(item => ({ label: item.label, score: item.score * 0.72 })),
    ...tagResult.contributors.map(item => ({ label: item.label, score: item.score * 0.28 })),
  ]
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.label.localeCompare(b.label);
    });

  return { score, contributors, hasPersonalSignal: positiveScore > 0 };
}

function hasPositiveBucketPreference(preferences: UserPreferences): boolean {
  return INSIGHT_TAG_BUCKETS.some(bucket =>
    Array.from(preferences.userBucketWeights[bucket].values()).some(weight => weight > 0),
  );
}

function scoreLabelsAgainstPreferenceMap(
  labels: string[],
  preferenceMap: Map<string, number>,
): { positive: number; negative: number; contributors: Array<{ label: string; score: number }> } {
  if (labels.length === 0) {
    return { positive: 0, negative: 0, contributors: [] };
  }

  const uniqueLabels = Array.from(new Set(labels.map(normalizePreferenceLabel).filter(Boolean)));
  if (uniqueLabels.length === 0) {
    return { positive: 0, negative: 0, contributors: [] };
  }

  const positiveWeights = Array.from(preferenceMap.entries())
    .map(([label, weight]) => (weight > 0 ? weight * getGenreNoiseWeight(label) : weight))
    .filter(weight => weight > 0);
  const negativeWeights = Array.from(preferenceMap.values()).filter(weight => weight < 0);
  const maxPositiveWeight = positiveWeights.length > 0 ? Math.max(...positiveWeights) : 0;
  const maxNegativeWeight =
    negativeWeights.length > 0 ? Math.max(...negativeWeights.map(weight => Math.abs(weight))) : 0;

  let positiveRaw = 0;
  let negativeRaw = 0;
  const contributors: Array<{ label: string; score: number }> = [];
  const weightedLabels = uniqueLabels.map(label => {
    const noiseAdjustedWeight = preferenceMap.get(label) ?? 0;
    const adjusted =
      noiseAdjustedWeight > 0
        ? noiseAdjustedWeight * getGenreNoiseWeight(label)
        : noiseAdjustedWeight;
    return { label, adjusted };
  });
  const denominator = Math.max(1, Math.min(weightedLabels.length, 3));

  for (const { label, adjusted: weight } of weightedLabels) {
    if (weight > 0 && maxPositiveWeight > 0) {
      const normalizedScore = Math.min(1, weight / maxPositiveWeight);
      positiveRaw += normalizedScore / denominator;
      contributors.push({ label, score: normalizedScore / denominator });
      continue;
    }
    if (weight < 0 && maxNegativeWeight > 0) {
      negativeRaw += Math.min(1, Math.abs(weight) / maxNegativeWeight) / denominator;
    }
  }
  return {
    positive: Math.min(1, positiveRaw),
    negative: Math.min(1, negativeRaw),
    contributors,
  };
}

function scoreCandidateItemGames(
  candidate: CandidateItem,
  preferences: UserPreferences,
  candidateBucketTags: Partial<Record<InsightTagBucket, string[]>>,
): GameScoreResult {
  const candidateTitle = resolveCandidateTitle(candidate);
  const targetMatch = isTargetTitleMatch(candidateTitle);
  const candidateGenres = pickTopGenresForItem(candidate.genres ?? []);
  const subgenres = pickTopBucketLabels('subgenre', candidateBucketTags.subgenre ?? []);
  const subgenreKey = subgenres.length > 0 ? [...subgenres].sort().join('|') : '';
  if (targetMatch) {
    const bucketSummary = INSIGHT_TAG_BUCKETS.map(bucket => ({
      bucket,
      count: (candidateBucketTags[bucket] ?? []).length,
      sample: toSafeListPreview(candidateBucketTags[bucket] ?? [], 3),
    }));
    dbg(
      `[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] bucket summary for "${candidateTitle}"`,
      safeDebugJson(bucketSummary),
    );
  }
  if (subgenreKey && preferences.droppedSubgenreCombinations.has(subgenreKey)) {
    if (targetMatch) {
      dbg(
        `[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] excluded by droppedSubgenreCombinations`,
        { candidateTitle, subgenreKey },
      );
    }
    return { score: 0, contributors: [], hasPersonalSignal: false };
  }
  const blockedDroppedSubgenres = Array.from(new Set(subgenres)).filter(
    subgenre =>
      (preferences.droppedSubgenreCounts.get(subgenre) ?? 0) >=
      GAME_DROPPED_SUBGENRE_BLOCK_THRESHOLD,
  );
  if (targetMatch) {
    dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] dropped subgenre checks`, {
      candidateTitle,
      blockedDroppedSubgenres,
      droppedSubgenreCombinationHit: Boolean(
        subgenreKey && preferences.droppedSubgenreCombinations.has(subgenreKey),
      ),
    });
  }
  if (subgenres.length > 0 && blockedDroppedSubgenres.length === subgenres.length) {
    if (targetMatch) {
      dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] excluded by blockedDroppedSubgenres`, {
        candidateTitle,
        subgenres,
        blockedDroppedSubgenres,
      });
    }
    return { score: 0, contributors: [], hasPersonalSignal: false };
  }

  let positiveScore = 0;
  let negativePenalty = 0;
  const contributors: GameSuggestionContributor[] = [];
  let subgenrePositiveSignal = 0;

  for (const bucket of INSIGHT_TAG_BUCKETS) {
    const channelWeight = GAME_BUCKET_CHANNEL_WEIGHTS[bucket];
    const bucketLabels = pickTopBucketLabels(bucket, candidateBucketTags[bucket] ?? []);
    const channelResult = scoreLabelsAgainstPreferenceMap(
      bucketLabels,
      preferences.userBucketWeights[bucket],
    );
    if (bucket === 'subgenre') {
      subgenrePositiveSignal = channelResult.positive;
    }
    positiveScore += channelResult.positive * channelWeight;
    negativePenalty += channelResult.negative * channelWeight;
    for (const contributor of channelResult.contributors) {
      contributors.push({
        bucket,
        label: contributor.label,
        weightedScore: contributor.score * channelWeight,
      });
    }
  }

  if (candidateGenres.length > 0) {
    const genreResult = scoreLabelsAgainstPreferenceMap(
      candidateGenres,
      preferences.favoriteGenres,
    );
    positiveScore += genreResult.positive * GAME_GENRE_FALLBACK_WEIGHT;
    negativePenalty += genreResult.negative * GAME_GENRE_FALLBACK_WEIGHT;
    for (const contributor of genreResult.contributors) {
      contributors.push({
        bucket: 'genre',
        label: contributor.label,
        weightedScore: contributor.score * GAME_GENRE_FALLBACK_WEIGHT,
      });
    }
  }

  if (blockedDroppedSubgenres.length > 0) {
    const severity = blockedDroppedSubgenres.length / Math.max(1, subgenres.length);
    negativePenalty += GAME_DROPPED_SUBGENRE_PENALTY * severity;
  }

  const hasSubgenreData = subgenres.length > 0;
  if (hasSubgenreData && subgenrePositiveSignal < GAME_REQUIRED_SUBGENRE_POSITIVE_MATCH) {
    if (targetMatch) {
      dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] excluded by subgenre threshold`, {
        candidateTitle,
        hasSubgenreData,
        subgenrePositiveSignal,
        required: GAME_REQUIRED_SUBGENRE_POSITIVE_MATCH,
      });
    }
    return { score: 0, contributors: [], hasPersonalSignal: false };
  }

  const score = Math.max(0, Math.min(1, positiveScore - negativePenalty));
  const rankedContributors = contributors
    .filter(contributor => contributor.weightedScore > 0)
    .sort((a, b) => {
      const bucketPriorityA = a.bucket === 'subgenre' ? 1 : 0;
      const bucketPriorityB = b.bucket === 'subgenre' ? 1 : 0;
      if (bucketPriorityB !== bucketPriorityA) {
        return bucketPriorityB - bucketPriorityA;
      }
      return b.weightedScore - a.weightedScore;
    });

  if (targetMatch) {
    dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] scoreCandidateItemGames result`, {
      candidateTitle,
      subgenrePositiveSignal,
      hasSubgenreData,
      blockedDroppedSubgenres,
      score: Number(score.toFixed(4)),
      topContributors: rankedContributors.slice(0, 5).map(item => ({
        bucket: item.bucket,
        label: item.label,
        weightedScore: Number(item.weightedScore.toFixed(4)),
      })),
    });
  }

  return { score, contributors: rankedContributors, hasPersonalSignal: positiveScore > 0 };
}

function buildGameRecommendationReason(contributors: GameSuggestionContributor[]): string {
  if (contributors.length === 0) {
    return 'Based on your game taste profile';
  }

  const uniqueByLabel = new Set<string>();
  const selected: string[] = [];

  for (const contributor of contributors) {
    const key = `${contributor.bucket}:${contributor.label}`;
    if (uniqueByLabel.has(key)) {
      continue;
    }
    uniqueByLabel.add(key);
    selected.push(formatTasteProfileLabel(contributor.label));
    if (selected.length >= 2) {
      break;
    }
  }

  if (selected.length === 0) {
    return 'Based on your game taste profile';
  }
  if (selected.length === 1) {
    return `Because you love ${selected[0]}`;
  }
  return `Because you love ${selected[0]} + ${selected[1]}`;
}

function buildGeneralRecommendationReason(contributors: WeightedContribution[]): string {
  if (contributors.length === 0) {
    return 'Based on your library preferences';
  }
  const unique = Array.from(new Set(contributors.map(item => item.label)));
  const traits = unique.slice(0, 2).map(label => formatTasteProfileLabel(label));
  if (traits.length === 0) {
    return 'Based on your library preferences';
  }
  if (traits.length === 1) {
    return `Because you love ${traits[0]}`;
  }
  return `Because you love ${traits[0]} + ${traits[1]}`;
}

/**
 * Builds media suggestions for a category
 * Strategy:
 * - exactly 4 items total when possible
 * - 2 items from user's backlog
 * - 2 common-knowledge picks from the global database, excluding user's own lists
 */
async function buildMediaSuggestions(
  supabase: DashboardSupabaseClient,
  userId: string,
  category: DashboardCategoryKey,
  userEntries: CategoryEntryRow[],
  options?: {
    maxSuggestions?: number;
    maxBacklogSuggestions?: number;
  },
): Promise<MediaSuggestion[]> {
  const targetTitle = DASHBOARD_SUGGESTIONS_TARGET_TITLE.toLowerCase();
  const hasTarget = targetTitle.length > 0;
  dbg('buildMediaSuggestions:start', {
    category,
    userId,
    userEntriesCount: userEntries.length,
    targetTitle: hasTarget ? DASHBOARD_SUGGESTIONS_TARGET_TITLE : '(none)',
  });

  if (category === 'games') {
    const completedGames = userEntries
      .filter(entry => entry.status === 'completed')
      .map(entry => {
        const media = entry.media_items;
        const title =
          media?.title ??
          media?.title_english ??
          media?.title_romaji ??
          media?.title_native ??
          media?.original_title ??
          `media_id:${entry.media_items?.id ?? 'unknown'}`;

        return {
          mediaId: media?.id ?? null,
          title,
          isFavorite: Boolean(entry.is_favorite),
          favoriteRank: entry.pinned_rank ?? null,
          score: entry.score ?? null,
          hours: entry.progress ?? 0,
          genres: media?.genres ?? [],
          tags: media?.tags ?? [],
        };
      });

    dbg('[Games Suggestions] Completed games count', completedGames.length);
    dbgTable(
      '[Games Suggestions] Completed games table',
      completedGames.map(game => ({
        mediaId: game.mediaId,
        title: game.title,
        isFavorite: game.isFavorite,
        favoriteRank: game.favoriteRank,
        score: game.score,
        hours: game.hours,
        genres: game.genres.join(', '),
        tags: formatTagsForDebug(game.tags),
      })),
    );

    dbgTable(
      'User entries data-shape sanity (first 5)',
      userEntries.slice(0, 5).map(entry => {
        const media = entry.media_items;
        const firstTag = Array.isArray(media?.tags) ? media?.tags[0] : undefined;
        return {
          title:
            media?.title ??
            media?.title_english ??
            media?.title_romaji ??
            media?.title_native ??
            media?.original_title ??
            '(untitled)',
          genresType: typeof media?.genres,
          genresIsArray: Array.isArray(media?.genres),
          genresSample: Array.isArray(media?.genres) ? safeDebugJson(media.genres.slice(0, 2)) : '',
          tagsType: typeof media?.tags,
          tagsIsArray: Array.isArray(media?.tags),
          tagsSample:
            Array.isArray(media?.tags) && media.tags.length > 0 ? safeDebugJson(media.tags[0]) : '',
          tagObjectKeys:
            firstTag && typeof firstTag === 'object' && !Array.isArray(firstTag)
              ? Object.keys(firstTag as Record<string, unknown>)
                  .slice(0, 12)
                  .join(',')
              : '',
        };
      }),
    );
  }

  const suggestions: MediaSuggestion[] = [];
  const maxSuggestions = options?.maxSuggestions ?? 4;
  const maxBacklogSuggestions = options?.maxBacklogSuggestions ?? 2;

  // Add status count debugging
  const statusCounts = userEntries.reduce(
    (acc, entry) => {
      acc[entry.status] = (acc[entry.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  dbg('buildMediaSuggestions:status-breakdown', {
    category,
    totalEntries: userEntries.length,
    statusCounts,
  });

  // For games, show detailed entry table (first 10)
  if (category === 'games' && DASHBOARD_SUGGESTIONS_DEBUG) {
    dbgTable(
      '[User Entries] First 10 entries for debugging',
      userEntries.slice(0, 10).map(entry => ({
        title:
          entry.media_items?.title ??
          entry.media_items?.title_english ??
          entry.media_items?.original_title ??
          '(untitled)',
        status: entry.status,
        score: entry.score ?? 'null',
        progress: entry.progress ?? 0,
        is_favorite: entry.is_favorite ? 'yes' : 'no',
      })),
    );
  }

  // ============================================================================
  // PART 1: Backlog suggestions
  // ============================================================================
  const backlogEntries = userEntries.filter(entry => entry.status === 'planned');
  dbg('buildMediaSuggestions:backlog-count', {
    category,
    backlogEntriesCount: backlogEntries.length,
    maxBacklogSuggestions,
  });

  if (backlogEntries.length > 0 && maxBacklogSuggestions > 0) {
    // Sort by priority (if exists) or updated_at
    const sortedBacklog = backlogEntries.sort((a, b) => {
      const priorityA = (a as unknown as { priority?: number }).priority ?? 0;
      const priorityB = (b as unknown as { priority?: number }).priority ?? 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return dateB - dateA;
    });

    // Take up to 2 from backlog, but filter out sequels without prerequisites
    for (const entry of sortedBacklog) {
      if (suggestions.length >= maxBacklogSuggestions) {
        break;
      }

      const media = entry.media_items;
      if (!media) {
        continue;
      }

      const title =
        media.title ??
        media.title_english ??
        media.title_romaji ??
        media.title_native ??
        media.original_title ??
        'Untitled';

      // Check if this is a sequel that requires previous games
      const seriesInfo = detectSeries(title);
      const prerequisiteCheck = checkSeriesPrerequisites(title, seriesInfo, userEntries);
      if (hasTarget && title.toLowerCase().includes(targetTitle)) {
        dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] backlog series check`, {
          title,
          seriesInfo,
          prerequisiteCheck,
        });
      }

      // Skip if it's a sequel without prerequisites played
      if (!prerequisiteCheck.canRecommend) {
        dbg(`Skipping "${title}" - previous game in series not played/completed`);
        continue;
      }

      // Determine reason based on priority and series status
      let reason = 'In your backlog - ready to start';
      if (prerequisiteCheck.reason) {
        // If it's a sequel, use the series-specific reason
        reason = prerequisiteCheck.reason;
      } else if (
        (entry as unknown as { priority?: number }).priority &&
        (entry as unknown as { priority?: number }).priority! >= 50
      ) {
        // High priority item
        reason = 'High priority in your backlog';
      } else {
        // Generate personalized reason based on user's genre/tag preferences
        reason = generateBacklogReason(media, userEntries, { title });
      }

      const confidence = 1.0;
      suggestions.push({
        mediaId: media.id,
        category,
        title,
        cover: media.cover_image_large ?? media.cover_image_medium ?? DEFAULT_COVER,
        slug: titleToSlug(title),
        reason,
        confidence, // 100% confidence - it's in their backlog!
        source: 'backlog',
        genres: media.genres ?? [],
        tags: media.tags ?? [],
      });

      dbg('selected-suggestion', {
        source: 'backlog',
        category,
        title,
        reason,
        confidence,
        genres: media.genres ?? [],
        status: entry.status,
        priority: (entry as unknown as { priority?: number }).priority ?? null,
      });
    }
  }

  const normalizeGenreKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const droppedGenreCounts = new Map<string, number>();
  const activeGenreCounts = new Map<string, number>();

  for (const entry of userEntries) {
    const genres = entry.media_items?.genres ?? [];
    for (const genre of genres) {
      if (!genre) {
        continue;
      }
      const key = normalizeGenreKey(genre);
      if (!key) {
        continue;
      }
      if (entry.status === 'dropped') {
        droppedGenreCounts.set(key, (droppedGenreCounts.get(key) ?? 0) + 1);
        continue;
      }
      if (entry.status === 'current' || entry.status === 'completed') {
        activeGenreCounts.set(key, (activeGenreCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const resilientDroppedGenres = new Set(
    Array.from(droppedGenreCounts.entries())
      .filter(
        ([genre, droppedCount]) => droppedCount >= 1 && (activeGenreCounts.get(genre) ?? 0) >= 1,
      )
      .map(([genre]) => genre),
  );

  // ============================================================================
  // PART 2: Database-driven suggestions
  // ============================================================================
  const neededExternal = maxSuggestions - suggestions.length; // Fill up to max total

  if (neededExternal > 0) {
    // 1. Fetch ALL media IDs for exclusion
    const { data: allUserEntries, error: entriesError } = await supabase
      .from('user_media_entries')
      .select('media_id, media_items!inner(category)')
      .eq('user_id', userId)
      .eq('media_items.category', category);

    if (!entriesError && allUserEntries) {
      const existingMediaIds = new Set(
        allUserEntries
          .map(entry => entry.media_id)
          .filter((id): id is number => id !== null && id !== undefined),
      );
      dbg('external-pool:existingMediaIds', {
        count: existingMediaIds.size,
        sample: Array.from(existingMediaIds).slice(0, 12),
      });

      // 2. Fetch ALL existing titles for similarity check (no limit!)
      const { data: allUserMedia, error: mediaError } = await supabase
        .from('user_media_entries')
        .select(
          'media_items!inner(title, title_english, title_romaji, title_native, original_title)',
        )
        .eq('user_id', userId)
        .eq('media_items.category', category);

      if (mediaError || !allUserMedia) {
        return suggestions; // Return backlog suggestions if any
      }

      const existingTitles = allUserMedia
        .map(entry => {
          const media = (
            entry as unknown as {
              media_items: {
                title: string | null;
                title_english: string | null;
                title_romaji: string | null;
                title_native: string | null;
                original_title: string | null;
              };
            }
          ).media_items;
          if (!media) {
            return null;
          }
          return (
            media.title ??
            media.title_english ??
            media.title_romaji ??
            media.title_native ??
            media.original_title
          );
        })
        .filter((title): title is string => title !== null && title !== undefined);
      dbg('external-pool:existingTitles', {
        count: existingTitles.length,
        sample: toSafeListPreview(existingTitles, 8),
      });

      let userGameTagMap: Map<number, Partial<Record<InsightTagBucket, string[]>>> | undefined;
      if (category === 'games') {
        const userMediaIds = userEntries
          .map(entry => entry.media_items?.id)
          .filter((mediaId): mediaId is number => typeof mediaId === 'number');
        userGameTagMap = await fetchGameInsightTagMap(supabase, userMediaIds);
      }

      // 3. Analyze user preferences
      const preferences = analyzeUserPreferences(userEntries, userGameTagMap);
      if (category === 'games' && DASHBOARD_SUGGESTIONS_DEBUG) {
        const tagWeightKeys = Array.from(preferences.favoriteTags.keys());
        const objectObjectCount = tagWeightKeys.filter(
          key => key === '[object Object]' || /object Object/i.test(key),
        ).length;
        dbg('[Games Suggestions] tagWeights guard', {
          tagWeightsSize: preferences.favoriteTags.size,
          objectObjectCount,
        });
      }
      const hasPreferenceSignal =
        preferences.favoriteGenres.size > 0 ||
        preferences.favoriteTags.size > 0 ||
        (category === 'games' && hasPositiveBucketPreference(preferences));
      dbg('preference-signal', {
        category,
        hasPreferenceSignal,
        favoriteGenresCount: preferences.favoriteGenres.size,
        favoriteTagsCount: preferences.favoriteTags.size,
      });

      if (hasPreferenceSignal || category.length > 0) {
        // 4. Fetch candidate items from database (exclude user's items)
        // Fix candidate pool bias: increase limit and remove id ordering bias
        let candidatesQuery = supabase.from('media_items').select(
          `
            id,
            category,
            title,
            title_english,
            title_romaji,
            title_native,
            original_title,
            cover_image_large,
            cover_image_medium,
            genres,
            tags,
            release_date
          `,
        );

        const categoryFilters = category === 'games' ? ['games', 'game'] : [category];
        const today = new Date().toISOString();
        const candidateLimit = category === 'games' ? 3000 : 1500; // More candidates for games to compensate for threshold filtering
        candidatesQuery = candidatesQuery
          .in('category', categoryFilters)
          .or(`release_date.is.null,release_date.lte.${today}`) // Exclude future releases
          .limit(candidateLimit);
        if (existingMediaIds.size > 0) {
          candidatesQuery = candidatesQuery.not(
            'id',
            'in',
            `(${Array.from(existingMediaIds).join(',')})`,
          );
        }

        const { data: candidates, error } = await candidatesQuery;

        dbg('candidate-pool:query-result', {
          category,
          hasError: Boolean(error),
          errorMessage: error?.message ?? null,
          candidatesCount: candidates?.length ?? 0,
          existingMediaIdsCount: existingMediaIds.size,
        });

        if (error) {
          dbg('candidate-pool:ERROR', {
            category,
            error: error.message,
            hint: 'Check database connection and query permissions',
          });
        }

        if (!candidates || candidates.length === 0) {
          dbg('candidate-pool:EMPTY', {
            category,
            existingMediaIdsCount: existingMediaIds.size,
            hint: 'No candidates found. Possible causes: (1) All items in DB already in user library, (2) No items in category in DB, (3) Query filter too restrictive',
          });
        }

        if (!error && candidates && candidates.length > 0) {
          const candidateIds = candidates
            .map(candidate => candidate.id)
            .filter((candidateId): candidateId is number => typeof candidateId === 'number');
          const { data: popularityRows } = await supabase
            .from('user_media_entries')
            .select('media_id,status,is_favorite,score')
            .in('media_id', candidateIds);

          const popularityByMediaId = new Map<
            number,
            {
              tracked: number;
              completed: number;
              favorites: number;
              scoreSum: number;
              scoreCount: number;
            }
          >();
          for (const row of popularityRows ?? []) {
            const mediaId = (row as { media_id: number | null }).media_id;
            if (typeof mediaId !== 'number') {
              continue;
            }
            const stats = popularityByMediaId.get(mediaId) ?? {
              tracked: 0,
              completed: 0,
              favorites: 0,
              scoreSum: 0,
              scoreCount: 0,
            };
            stats.tracked += 1;
            if ((row as { status?: string | null }).status === 'completed') {
              stats.completed += 1;
            }
            if ((row as { is_favorite?: boolean | null }).is_favorite) {
              stats.favorites += 1;
            }
            const rawScore = (row as { score?: number | string | null }).score;
            const parsedScore =
              typeof rawScore === 'number'
                ? rawScore
                : typeof rawScore === 'string' && rawScore.trim() !== ''
                  ? Number(rawScore)
                  : null;
            if (parsedScore !== null && Number.isFinite(parsedScore)) {
              stats.scoreSum += parsedScore;
              stats.scoreCount += 1;
            }
            popularityByMediaId.set(mediaId, stats);
          }

          const candidateTitles = candidates.map(candidate =>
            resolveCandidateTitle(candidate as CandidateItem),
          );
          const targetInCandidates = hasTarget
            ? candidateTitles.some(title => title.toLowerCase().includes(targetTitle))
            : false;
          dbg('candidate-pool:after-sql', {
            fetchedCount: candidates.length,
            candidateIdListSize: candidateIds.length,
            targetInCandidates,
            sampleTitles: toSafeListPreview(candidateTitles, 10),
          });

          if (hasTarget) {
            const targetLookupPattern = `%${DASHBOARD_SUGGESTIONS_TARGET_TITLE}%`;
            const { data: targetRows, error: targetRowsError } = await supabase
              .from('media_items')
              .select('id,title,title_english,title_romaji,title_native,original_title,category')
              .in('category', category === 'games' ? ['games', 'game'] : [category])
              .or(
                `title.ilike.${targetLookupPattern},title_english.ilike.${targetLookupPattern},title_romaji.ilike.${targetLookupPattern},title_native.ilike.${targetLookupPattern},original_title.ilike.${targetLookupPattern}`,
              )
              .limit(25);

            if (targetRowsError) {
              dbg(
                `[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] lookup-error`,
                targetRowsError.message,
              );
            } else {
              const targetLookup = (targetRows ?? []).map(row => {
                const typedRow = row as unknown as CandidateItem;
                return {
                  id: typedRow.id,
                  title: resolveCandidateTitle(typedRow),
                  excludedByExistingMediaIds: existingMediaIds.has(typedRow.id),
                  presentInFetchedCandidates: candidateIds.includes(typedRow.id),
                };
              });
              dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] candidate presence diagnostics`, {
                foundInMediaItemsForCategory: targetLookup.length > 0,
                targetLookupCount: targetLookup.length,
                targetLookupSample: targetLookup.slice(0, 10),
                inferredFilteredByLimit:
                  targetLookup.length > 0 &&
                  targetLookup.every(
                    item => !item.presentInFetchedCandidates && !item.excludedByExistingMediaIds,
                  ) &&
                  candidateIds.length >= 100,
                sqlNotInApplied: true,
                sqlLimitApplied: candidateLimit,
              });
            }
          }

          dbgTable(
            'Candidates data-shape sanity (first 5)',
            candidates.slice(0, 5).map(candidate => {
              const typed = candidate as CandidateItem;
              const firstTag = Array.isArray(typed.tags) ? typed.tags[0] : undefined;
              return {
                title: resolveCandidateTitle(typed),
                genresType: typeof typed.genres,
                genresIsArray: Array.isArray(typed.genres),
                genresSample:
                  Array.isArray(typed.genres) && typed.genres.length > 0
                    ? safeDebugJson(typed.genres.slice(0, 2))
                    : '',
                tagsType: typeof typed.tags,
                tagsIsArray: Array.isArray(typed.tags),
                tagsSample:
                  Array.isArray(typed.tags) && typed.tags.length > 0
                    ? safeDebugJson(typed.tags[0])
                    : '',
                tagObjectKeys:
                  firstTag && typeof firstTag === 'object' && !Array.isArray(firstTag)
                    ? Object.keys(firstTag as Record<string, unknown>)
                        .slice(0, 12)
                        .join(',')
                    : '',
              };
            }),
          );
          const candidateGameTagMap =
            category === 'games'
              ? await fetchGameInsightTagMap(supabase, candidateIds)
              : new Map<number, Partial<Record<InsightTagBucket, string[]>>>();

          // 5. Score and rank candidates
          const rankedCandidates = candidates
            .map(candidate => {
              const typedCandidate = candidate as CandidateItem;
              const resolvedTitle = resolveCandidateTitle(typedCandidate);
              const targetMatch = isTargetTitleMatch(resolvedTitle);
              const candidateBucketTags =
                category === 'games'
                  ? (candidateGameTagMap.get(typedCandidate.id) ?? {})
                  : undefined;
              const hasAnyBucketSignal =
                category === 'games' &&
                INSIGHT_TAG_BUCKETS.some(
                  bucket => (candidateBucketTags?.[bucket] ?? []).length > 0,
                );
              if (targetMatch) {
                dbg(
                  `[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] candidate bucket gate pre-check`,
                  {
                    id: typedCandidate.id,
                    title: resolvedTitle,
                    hasAnyBucketSignal,
                    bucketSummary: INSIGHT_TAG_BUCKETS.map(bucket => ({
                      bucket,
                      count: (candidateBucketTags?.[bucket] ?? []).length,
                      sample: toSafeListPreview(candidateBucketTags?.[bucket] ?? [], 3),
                    })),
                  },
                );
              }
              const gameScoreResult =
                category === 'games'
                  ? scoreCandidateItemGames(typedCandidate, preferences, candidateBucketTags ?? {})
                  : null;
              const nonGameScoreResult =
                category === 'games' ? null : scoreCandidateItem(typedCandidate, preferences);
              const personalScore =
                category === 'games'
                  ? (gameScoreResult?.score ?? 0)
                  : (nonGameScoreResult?.score ?? 0);
              const hasCandidatePersonalSignal =
                category === 'games'
                  ? (gameScoreResult?.hasPersonalSignal ?? false)
                  : (nonGameScoreResult?.hasPersonalSignal ?? false);
              const popularity = popularityByMediaId.get(typedCandidate.id) ?? {
                tracked: 0,
                completed: 0,
                favorites: 0,
                scoreSum: 0,
                scoreCount: 0,
              };
              const trackedScore = Math.min(1, popularity.tracked / 20);
              const completionScore =
                popularity.tracked > 0 ? popularity.completed / popularity.tracked : 0;
              const favoriteScore =
                popularity.tracked > 0 ? popularity.favorites / popularity.tracked : 0;
              const avgScore =
                popularity.scoreCount > 0 ? popularity.scoreSum / popularity.scoreCount : 0;
              const ratingScore = avgScore > 0 ? Math.min(1, avgScore / 10) : 0;
              const commonKnowledgeScore =
                trackedScore * 0.5 +
                completionScore * 0.25 +
                favoriteScore * 0.15 +
                ratingScore * 0.1;

              const combinedScore = hasCandidatePersonalSignal
                ? popularity.tracked > 0
                  ? personalScore * 0.45 + commonKnowledgeScore * 0.55
                  : personalScore
                : commonKnowledgeScore;

              return {
                candidate: {
                  ...typedCandidate,
                  candidateBucketTags,
                },
                score: combinedScore,
                personalScore,
                commonKnowledgeScore,
                popularity,
                gameContributors: gameScoreResult?.contributors ?? [],
                traitContributors:
                  category === 'games'
                    ? (gameScoreResult?.contributors.map(item => ({
                        label: item.label,
                        score: item.weightedScore,
                      })) ?? [])
                    : (nonGameScoreResult?.contributors ?? []),
                hasCandidatePersonalSignal,
              };
            })
            .sort((a, b) => b.score - a.score);

          // Adaptive popularity gating for low-user environments
          const totalPopularityRows = popularityRows?.length ?? 0;
          const minTracked =
            totalPopularityRows < 250 || // Low-user environment
            rankedCandidates.some(item => item.hasCandidatePersonalSignal)
              ? 1 // Relax gate if personal signal exists
              : 2; // Default gate
          dbg('adaptive-popularity-gate', {
            category,
            totalPopularityRows,
            minTracked,
            hasPersonalSignalCandidates: rankedCandidates.filter(
              item => item.hasCandidatePersonalSignal,
            ).length,
          });

          const commonKnowledgeCandidates = rankedCandidates.filter(
            item =>
              item.commonKnowledgeScore >=
                (category === 'games' ? GAME_MIN_EXTERNAL_CONFIDENCE * 0.24 : 0.12) &&
              item.popularity.tracked >= minTracked,
          );
          if (hasTarget) {
            const targetRanked = rankedCandidates.find(item =>
              resolveCandidateTitle(item.candidate).toLowerCase().includes(targetTitle),
            );
            dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] final scoring checkpoint`, {
              foundInRankedCandidates: Boolean(targetRanked),
              finalScore: targetRanked ? Number(targetRanked.score.toFixed(4)) : null,
              commonKnowledgeScore: targetRanked
                ? Number(targetRanked.commonKnowledgeScore.toFixed(4))
                : null,
              trackedByUsers: targetRanked ? targetRanked.popularity.tracked : 0,
              topContributors: (targetRanked?.gameContributors ?? []).slice(0, 5).map(item => ({
                bucket: item.bucket,
                label: item.label,
                weightedScore: Number(item.weightedScore.toFixed(4)),
              })),
            });
          }
          const scoredCandidates =
            commonKnowledgeCandidates.length > 0
              ? commonKnowledgeCandidates
              : rankedCandidates.filter(item => item.score > 0);

          // 6. Build external suggestion objects (skip similar titles)
          // Add diversity tracking to avoid duplicate reason signatures
          const reasonSignatures = new Map<string, number>(); // signature -> count
          const MAX_DUPLICATE_REASONS = 2;

          for (const {
            candidate,
            score,
            gameContributors,
            popularity,
            traitContributors,
          } of scoredCandidates) {
            if (suggestions.length >= maxSuggestions) {
              break;
            }

            const title =
              candidate.title ??
              candidate.title_english ??
              candidate.title_romaji ??
              candidate.title_native ??
              candidate.original_title ??
              'Untitled';

            // Skip if user already has a similar title
            // (e.g., "Alan Wake" if they have "Alan Wake Remastered")
            const hasSimilarTitle = existingTitles.some(existingTitle =>
              areTitlesSimilar(title, existingTitle),
            );
            if (hasTarget && title.toLowerCase().includes(targetTitle)) {
              const matchedExistingTitle = existingTitles.find(existingTitle =>
                areTitlesSimilar(title, existingTitle),
              );
              dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] similar-title filter`, {
                title,
                hasSimilarTitle,
                matchedExistingTitle: matchedExistingTitle ?? null,
              });
            }

            if (hasSimilarTitle) {
              continue; // Skip this candidate
            }

            const seriesInfo = detectSeries(title);
            const prerequisiteCheck = checkSeriesPrerequisites(title, seriesInfo, userEntries);

            // For database suggestions, apply penalty instead of hard blocking
            const prereqPenalty = getSeriesPrereqPenalty(seriesInfo, title, prerequisiteCheck);
            const penalizedScore = Math.max(0, score - prereqPenalty);

            // Debug log for target title
            if (hasTarget && title.toLowerCase().includes(targetTitle)) {
              dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] series prerequisite penalty`, {
                title,
                seriesInfo,
                prerequisiteCheck,
                prereqPenalty: Number(prereqPenalty.toFixed(4)),
                originalScore: Number(score.toFixed(4)),
                penalizedScore: Number(penalizedScore.toFixed(4)),
              });
            }

            const cover =
              candidate.cover_image_large ?? candidate.cover_image_medium ?? DEFAULT_COVER;

            const droppedGenreMatch = (candidate.genres ?? [])
              .filter(genre => genre && resilientDroppedGenres.has(normalizeGenreKey(genre)))
              .slice(0, 1);

            // Build reason - check if it's a sequel with missing prerequisites
            let reason: string;
            if (droppedGenreMatch.length > 0) {
              reason = `Second-chance pick: you still play a lot of ${droppedGenreMatch[0]} even after some drops.`;
            } else if (
              seriesInfo.isSeries &&
              seriesInfo.sequenceNumber > 1 &&
              !prerequisiteCheck.canRecommend &&
              !isStandaloneFriendlySeries(seriesInfo.seriesName)
            ) {
              // Sequel with missing prerequisites - add a note
              const previousTitle = inferPreviousGameTitle(seriesInfo, title);
              const baseReason =
                category === 'games'
                  ? buildGameRecommendationReason(gameContributors)
                  : buildGeneralRecommendationReason(traitContributors);
              reason = `${baseReason} — you can jump in here, but starting with ${previousTitle} may improve the story.`;
            } else {
              reason =
                category === 'games'
                  ? buildGameRecommendationReason(gameContributors)
                  : buildGeneralRecommendationReason(traitContributors);
            }

            // Check diversity constraint
            const topContributors =
              category === 'games'
                ? gameContributors.slice(0, 2).map(item => item.label)
                : traitContributors.slice(0, 2).map(item => item.label);
            const reasonSignature = topContributors.sort().join('|') || 'generic';
            const currentCount = reasonSignatures.get(reasonSignature) ?? 0;

            if (currentCount >= MAX_DUPLICATE_REASONS) {
              // Skip to maintain diversity
              dbg('diversity-skip', { title, reasonSignature, currentCount });
              continue;
            }

            reasonSignatures.set(reasonSignature, currentCount + 1);

            if (DEBUG_GAME_SUGGESTIONS && category === 'games') {
              dbg(`[Games Suggestion Debug] ${title}`, {
                contributors: gameContributors.slice(0, 3).map(item => ({
                  bucket: item.bucket,
                  label: item.label,
                  score: Number(item.weightedScore.toFixed(3)),
                })),
              });
            }

            const confidence = Math.min(0.99, Math.max(0, penalizedScore));
            suggestions.push({
              mediaId: candidate.id,
              category,
              title,
              cover,
              slug: titleToSlug(title),
              reason,
              confidence,
              source: 'database',
              genres: candidate.genres ?? [],
              tags: extractTasteTagLabelsFromMediaTags(candidate.tags),
              bucketTags: category === 'games' ? candidate.candidateBucketTags : undefined,
            });

            dbg('selected-suggestion', {
              source: 'database',
              category,
              title,
              reason,
              confidence,
              originalScore: Number(score.toFixed(4)),
              prereqPenalty: prereqPenalty > 0 ? Number(prereqPenalty.toFixed(4)) : undefined,
              combinedScore: Number(penalizedScore.toFixed(4)),
              popularityTracked: popularity.tracked,
              popularityCompleted: popularity.completed,
              popularityFavorites: popularity.favorites,
              genres: candidate.genres ?? [],
            });
          }

          const fallbackNeeded = maxSuggestions - suggestions.length;
          if (fallbackNeeded > 0) {
            const selectedMediaIds = new Set(suggestions.map(item => item.mediaId));
            // Compute scores for fallback candidates and filter by threshold
            const fallbackCandidatesWithScores = candidates
              .map(candidate => candidate as CandidateItem)
              .filter(candidate => {
                if (typeof candidate.id !== 'number') {
                  return false;
                }
                if (selectedMediaIds.has(candidate.id)) {
                  return false;
                }
                return !existingMediaIds.has(candidate.id);
              })
              .map(candidate => {
                // Compute common knowledge score for fallback
                const popularity = popularityByMediaId.get(candidate.id) ?? {
                  tracked: 0,
                  completed: 0,
                  favorites: 0,
                  scoreSum: 0,
                  scoreCount: 0,
                };
                const trackedScore = Math.min(1, popularity.tracked / 20);
                const completionScore =
                  popularity.tracked > 0 ? popularity.completed / popularity.tracked : 0;
                const favoriteScore =
                  popularity.tracked > 0 ? popularity.favorites / popularity.tracked : 0;
                const avgScore =
                  popularity.scoreCount > 0 ? popularity.scoreSum / popularity.scoreCount : 0;
                const ratingScore = avgScore > 0 ? Math.min(1, avgScore / 10) : 0;
                const commonKnowledgeScore =
                  trackedScore * 0.5 +
                  completionScore * 0.25 +
                  favoriteScore * 0.15 +
                  ratingScore * 0.1;

                return {
                  candidate,
                  score: commonKnowledgeScore,
                };
              })
              .filter(item => item.score >= MIN_VISIBLE_FALLBACK_CONFIDENCE)
              .sort((a, b) => b.score - a.score)
              .slice(0, fallbackNeeded);

            for (const { candidate, score } of fallbackCandidatesWithScores) {
              const title = resolveCandidateTitle(candidate);
              const cover =
                candidate.cover_image_large ?? candidate.cover_image_medium ?? DEFAULT_COVER;
              const confidence = Math.min(0.99, Math.max(0, score));
              suggestions.push({
                mediaId: candidate.id,
                category,
                title,
                cover,
                slug: titleToSlug(title),
                reason: 'Community pick for your tastes',
                confidence,
                source: 'database-fallback',
                genres: candidate.genres ?? [],
                tags: extractTasteTagLabelsFromMediaTags(candidate.tags),
              });

              dbg('selected-suggestion', {
                source: 'database-fallback',
                category,
                title,
                reason: 'Community pick for your tastes',
                confidence,
                genres: candidate.genres ?? [],
              });
            }
          }
        } else {
          dbg('candidate-pool:empty-or-error', {
            hasError: Boolean(error),
            errorMessage: error?.message ?? null,
            candidatesCount: candidates?.length ?? 0,
          });
        }
      } else {
        dbg('external-pool:skipped-no-preference-signal', { category });
      }
    }
  }

  const beforeFilterCount = suggestions.length;
  const beforeFilterBySource = suggestions.reduce(
    (acc, item) => {
      acc[item.source] = (acc[item.source] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Apply confidence threshold filtering
  const aboveThresholdCount = suggestions.filter(
    item => item.confidence >= MIN_VISIBLE_CONFIDENCE,
  ).length;

  // Filter out suggestions below threshold and sort by confidence
  const filteredSuggestions = suggestions
    .filter(item =>
      item.source === 'backlog'
        ? item.confidence >= MIN_VISIBLE_BACKLOG_CONFIDENCE
        : item.confidence >= MIN_VISIBLE_CONFIDENCE,
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSuggestions);

  // Debug target title if specified
  if (hasTarget) {
    const targetSuggestion = suggestions.find(item =>
      item.title.toLowerCase().includes(targetTitle),
    );
    if (targetSuggestion) {
      const passedThreshold = targetSuggestion.confidence >= MIN_VISIBLE_CONFIDENCE;
      dbg(`[TARGET:${DASHBOARD_SUGGESTIONS_TARGET_TITLE}] threshold filter result`, {
        title: targetSuggestion.title,
        confidence: Number(targetSuggestion.confidence.toFixed(4)),
        threshold: MIN_VISIBLE_CONFIDENCE,
        passedThreshold,
        reason: targetSuggestion.reason,
      });
    }
  }

  const sourceCounts = filteredSuggestions.reduce(
    (acc, item) => {
      acc[item.source] = (acc[item.source] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  dbg('buildMediaSuggestions:threshold-filtering', {
    category,
    threshold: MIN_VISIBLE_CONFIDENCE,
    beforeFilterCount,
    beforeFilterBySource,
    aboveThresholdCount,
    afterFilterCount: filteredSuggestions.length,
  });

  dbg('buildMediaSuggestions:end', {
    category,
    totalSuggestions: filteredSuggestions.length,
    sourceCounts,
    titlesWithScores: filteredSuggestions.map(item => ({
      title: item.title,
      source: item.source,
      confidence: Number(item.confidence.toFixed(4)),
      reason: item.reason,
    })),
    targetAppearsInFinalList: hasTarget
      ? filteredSuggestions.some(item => item.title.toLowerCase().includes(targetTitle))
      : null,
  });

  return filteredSuggestions;
}

export const __personalizationTestUtils = {
  normalizeGenreLabel,
  pickTopGenresForItem,
  analyzeUserPreferences,
  scoreCandidateItem,
  scoreCandidateItemGames,
  detectSeries,
  checkSeriesPrerequisites,
};

export async function buildBacklogPersonalMediaSuggestions(
  supabase: DashboardSupabaseClient,
  userId: string,
  category: DashboardCategoryKey,
  limit = 4,
): Promise<MediaSuggestion[]> {
  const entries = await fetchCategoryEntries(supabase, userId, category);
  return buildMediaSuggestions(supabase, userId, category, entries, {
    maxSuggestions: limit,
    maxBacklogSuggestions: 0,
  });
}
