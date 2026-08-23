import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { buildResultDebug } from './games-debug';
import { buildGamesRecommendations } from './games-recommendation-engine';
import { normalizeGameIdentityKey, normalizePlatformKey, normalizeScore, titleToSlug } from './games-normalizers';
import { buildGamesTasteProfile } from './games-taste-engine';
import type {
  GameCandidate,
  GameHistoryEntry,
  GamesRecommendationResult,
} from './games-types';

const DATABASE_FETCH_PAGE_SIZE = 500;
const MIN_POPULARITY = 3;

type SupabaseClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;

type UserMediaEntryRow = {
  id: number;
  media_id: number;
  status: string;
  score: number | null;
  progress: number | null;
  priority: number | null;
  is_favorite: boolean | null;
  pinned_rank: number | null;
  updated_at: string | null;
  selected_platform: string | null;
  media_items: {
    id: number;
    title: string | null;
    category: string | null;
    genres: string[] | null;
    igdb_themes: string[] | null;
    studios: string[] | null;
    platforms: string[] | null;
    cover_url_big: string | null;
    cover_url_thumb: string | null;
    cover_image_large: string | null;
    cover_image_medium: string | null;
  };
};

type MediaItemRow = {
  id: number;
  title: string | null;
  igdb_slug: string | null;
  genres: string[] | null;
  igdb_themes: string[] | null;
  platforms: string[] | null;
  cover_url_big: string | null;
  cover_url_thumb: string | null;
  cover_image_large: string | null;
  cover_image_medium: string | null;
};

type CategoryProfile = {
  games?: {
    favorite_platform?: string;
  };
  [key: string]: unknown;
};

export async function generateGamesRecommendationsV3(
  userId: string,
): Promise<GamesRecommendationResult> {
  const supabase = await createRouteHandlerClient();

  const [history, categoryProfile] = await Promise.all([
    loadUserMediaHistory(supabase, userId),
    loadUserCategoryProfile(supabase, userId),
  ]);

  const favoritePlatform = categoryProfile?.games?.favorite_platform ?? null;
  const preferredPlatformKey = favoritePlatform ? normalizePlatformKey(favoritePlatform) : '';

  const ownedIds = new Set(history.map(entry => entry.mediaId));
  const ownedIdentityKeys = new Set(
    history.map(entry => normalizeGameIdentityKey(entry.media.title)).filter(Boolean),
  );

  const candidates = await loadDatabaseGames(supabase, ownedIds, ownedIdentityKeys, preferredPlatformKey);

  const backlog = history.filter(entry => entry.status === 'planned');
  const taste = buildGamesTasteProfile(history);
  const recommendations = buildGamesRecommendations({
    history,
    backlog,
    databaseCandidates: candidates,
    taste,
  });

  return {
    tasteProfile: taste.profile,
    backlogPicks: recommendations.backlogPicks,
    possibleNext: recommendations.possibleNext,
    shadowContext: recommendations.shadowContext,
    debug: buildResultDebug(history),
  };
}

export async function loadUserMediaHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<GameHistoryEntry[]> {
  const rows = await loadUserMediaHistoryRows(supabase, userId);

  return rows.map((row: UserMediaEntryRow) => ({
    id: row.id,
    mediaId: row.media_id,
    status: row.status as GameHistoryEntry['status'],
    score: normalizeScore(row.score),
    progress: row.progress,
    priority: row.priority,
    isFavorite: row.is_favorite ?? false,
    pinnedRank: row.pinned_rank,
    updatedAt: row.updated_at ?? new Date().toISOString(),
    selectedPlatform: row.selected_platform,
    media: {
      id: row.media_items.id,
      title: row.media_items.title ?? 'Untitled',
      genres: row.media_items.genres ?? [],
      themes: row.media_items.igdb_themes ?? [],
      studios: row.media_items.studios ?? [],
      platforms: row.media_items.platforms ?? [],
      coverImageLarge:
        row.media_items.cover_url_big ??
        row.media_items.cover_image_large ??
        row.media_items.cover_url_thumb ??
        row.media_items.cover_image_medium ??
        undefined,
      coverImageMedium:
        row.media_items.cover_url_thumb ?? row.media_items.cover_image_medium ?? undefined,
    },
  }));
}

export async function loadUserMediaHistoryRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserMediaEntryRow[]> {
  const allRows: UserMediaEntryRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('user_media_entries')
      .select(
        `
        id,
        media_id,
        status,
        score,
        progress,
        priority,
        is_favorite,
        pinned_rank,
        updated_at,
        selected_platform,
        media_items!inner(
          id,
          title,
          category,
          genres,
          igdb_themes,
          studios,
          platforms,
          cover_url_big,
          cover_url_thumb,
          cover_image_large,
          cover_image_medium
        )
      `,
      )
      .in('media_items.category', ['games', 'game'])
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + DATABASE_FETCH_PAGE_SIZE - 1);

    if (error) {
      console.error('[GamesRecommenderV3] Error loading media history:', error);
      return [];
    }

    const pageRows = (data || []) as UserMediaEntryRow[];
    if (pageRows.length === 0) {
      break;
    }

    allRows.push(...pageRows);
    if (pageRows.length < DATABASE_FETCH_PAGE_SIZE) {
      break;
    }

    offset += DATABASE_FETCH_PAGE_SIZE;
  }

  return allRows;
}

async function loadUserCategoryProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<CategoryProfile | null> {
  const { data, error } = await supabase
    .from('user_category_profiles')
    .select('profiles')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[GamesRecommenderV3] Error loading category profile:', error);
    return null;
  }

  return (data?.profiles as CategoryProfile | null) ?? null;
}

async function loadDatabaseGames(
  supabase: SupabaseClient,
  existingMediaIds: Set<number>,
  ownedIdentityKeys: Set<string>,
  preferredPlatformKey: string,
): Promise<GameCandidate[]> {
  const allRows: MediaItemRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('media_items')
      .select(
        `
        id,
        title,
        igdb_slug,
        genres,
        igdb_themes,
        platforms,
        cover_url_big,
        cover_url_thumb,
        cover_image_large,
        cover_image_medium
      `,
      )
      .in('category', ['games', 'game'])
      .order('id', { ascending: false })
      .range(offset, offset + DATABASE_FETCH_PAGE_SIZE - 1);

    if (error) {
      console.error('[GamesRecommenderV3] Error loading database games:', error);
      return [];
    }

    const pageRows = (data || []) as MediaItemRow[];
    if (pageRows.length === 0) {
      break;
    }

    allRows.push(...pageRows);
    if (pageRows.length < DATABASE_FETCH_PAGE_SIZE) {
      break;
    }

    offset += DATABASE_FETCH_PAGE_SIZE;
  }

  const filteredRows = allRows.filter(row => {
    if (existingMediaIds.has(row.id)) {
      return false;
    }

    const identitySource = row.igdb_slug || row.title || '';
    const identityKey = normalizeGameIdentityKey(identitySource);
    if (identityKey && ownedIdentityKeys.has(identityKey)) {
      return false;
    }

    return true;
  });

  const popularityMap = await loadPopularityScores(
    supabase,
    filteredRows.map(row => row.id),
  );

  const candidates = filteredRows.map((row): GameCandidate => ({
    id: row.id,
    title: row.title ?? 'Untitled',
    slug: row.igdb_slug || titleToSlug(row.title ?? 'untitled'),
    genres: row.genres ?? [],
    themes: row.igdb_themes ?? [],
    platforms: row.platforms ?? [],
    cover:
      row.cover_url_big ?? row.cover_image_large ?? row.cover_url_thumb ?? row.cover_image_medium ?? '',
    popularityScore: popularityMap.get(row.id) ?? 0,
  }));

  if (!preferredPlatformKey) {
    return candidates;
  }

  // Keep unmatched platforms but slightly prefer platform-compatible candidates by reordering.
  const compatible: GameCandidate[] = [];
  const fallback: GameCandidate[] = [];

  for (const candidate of candidates) {
    const candidateKeys = candidate.platforms.map(normalizePlatformKey).filter(Boolean);
    if (candidateKeys.includes(preferredPlatformKey)) {
      compatible.push(candidate);
      continue;
    }
    fallback.push(candidate);
  }

  return [...compatible, ...fallback];
}

async function loadPopularityScores(
  supabase: SupabaseClient,
  mediaIds: number[],
): Promise<Map<number, number>> {
  if (mediaIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('user_media_entries')
    .select('media_id, status, is_favorite, score')
    .in('media_id', mediaIds);

  if (error) {
    console.error('[GamesRecommenderV3] Error loading popularity:', error);
    return new Map();
  }

  const stats = new Map<number, { tracked: number; completed: number; favorites: number }>();

  for (const row of data || []) {
    const mediaId = row.media_id;
    const current = stats.get(mediaId) ?? { tracked: 0, completed: 0, favorites: 0 };

    current.tracked += 1;
    if (row.status === 'completed') {
      current.completed += 1;
    }
    if (row.is_favorite) {
      current.favorites += 1;
    }

    stats.set(mediaId, current);
  }

  const popularityScores = new Map<number, number>();

  for (const [mediaId, stat] of stats.entries()) {
    if (stat.tracked < MIN_POPULARITY) {
      continue;
    }

    const trackedScore = Math.min(50, (stat.tracked / 20) * 50);
    const completionRate = stat.completed / stat.tracked;
    const favoriteRate = stat.favorites / stat.tracked;

    const score = trackedScore + completionRate * 30 + favoriteRate * 20;
    popularityScores.set(mediaId, Math.min(100, score));
  }

  return popularityScores;
}
