/**
 * Server-side data fetching for dashboard
 * Extracted from API routes for direct Server Component usage
 */

import type { createRouteHandlerClient } from '@/lib/supabase-route-handler';

type SupabaseServerClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;

// Types from /api/user/stats
type CategoryStats = {
  total: number;
  in_progress: number;
  completed: number;
  dropped: number;
  hours: number;
};

export type PersonalStats = {
  // Summary totals
  total_backlog: number;
  in_progress: number;
  completed: number;
  total_hours: number;
  // Per-category breakdown
  games: CategoryStats;
  anime: CategoryStats;
  manga: CategoryStats & { chapters: number };
  movies: CategoryStats;
  tv: CategoryStats;
  books: CategoryStats & { pages: number };
  // Which categories user has content in
  active_categories: string[];
};

// Types from /api/user/continue
const DASHBOARD_CATEGORIES = ['games', 'anime', 'manga', 'movies', 'tv', 'books'] as const;
const SLIDE_CATEGORIES = ['games', 'anime', 'manga', 'tv', 'books'] as const;
type DashboardCategory = (typeof DASHBOARD_CATEGORIES)[number];

export type ContinueSlide = {
  category: string;
  entry_id: number;
  media_id: number;
  status: string;
  progress: number | null;
  score: string | null;
  updated_at: string;
  created_at: string;
  title: string | null;
  season_year: number | null;
  release_date: string | null;
  cover_image_large: string | null;
  cover_image_medium: string | null;
};

type CountBucket = {
  total: number;
  planned: number;
  current: number;
  completed: number;
  dropped: number;
};

export type ContinueData = {
  enabledCategories: string[];
  slides: ContinueSlide[];
  countsByCategory: Record<string, CountBucket>;
};

type MediaPreview = {
  category: string | null;
  source: string | null;
  steam_app_id: number | null;
  title: string | null;
  title_english: string | null;
  title_romaji: string | null;
  title_native: string | null;
  original_title: string | null;
  season_year: number | null;
  release_date: string | null;
  cover_image_large: string | null;
  cover_image_medium: string | null;
};

type ContinueEntry = {
  id: number;
  media_id: number;
  status: string;
  progress: number | null;
  score: number | null;
  updated_at: string | null;
  created_at: string | null;
  media_items: MediaPreview | null;
};

type CountEntry = {
  status: string | null;
  media_items: { category: string | null } | null;
};

// Helper functions
const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getEntryActivityTimestamp = (entry: Pick<ContinueEntry, 'updated_at' | 'created_at'>) =>
  toTimestamp(entry.updated_at ?? entry.created_at);

const compareEntryDates = (a: ContinueEntry, b: ContinueEntry) => {
  const activityDiff = getEntryActivityTimestamp(b) - getEntryActivityTimestamp(a);
  if (activityDiff !== 0) {
    return activityDiff;
  }

  const createdDiff = toTimestamp(b.created_at) - toTimestamp(a.created_at);
  if (createdDiff !== 0) {
    return createdDiff;
  }

  return b.id - a.id;
};

const resolveTitle = (media: MediaPreview | null) =>
  media?.title ??
  media?.title_english ??
  media?.title_romaji ??
  media?.title_native ??
  media?.original_title ??
  null;

const normalizeSteamCoverForContinue = (
  url: string | null | undefined,
  steamAppId: number | null | undefined,
) => {
  if (!url) {
    return null;
  }

  if (
    steamAppId &&
    url === `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`
  ) {
    return null;
  }

  if (
    url.includes('cdn.cloudflare.steamstatic.com/steam/apps/') &&
    !url.includes('/steamcommunity/public/images/apps/') &&
    !url.endsWith('/header.jpg')
  ) {
    return url.replace('/steam/apps/', '/steamcommunity/public/images/apps/');
  }

  return url;
};

const normalizeEnabledCategories = (categories: string[]) =>
  categories.filter(category => DASHBOARD_CATEGORIES.includes(category as DashboardCategory));

const EMPTY_STATS: PersonalStats = {
  total_backlog: 0,
  in_progress: 0,
  completed: 0,
  total_hours: 0,
  games: { total: 0, in_progress: 0, completed: 0, dropped: 0, hours: 0 },
  anime: { total: 0, in_progress: 0, completed: 0, dropped: 0, hours: 0 },
  manga: { total: 0, in_progress: 0, completed: 0, dropped: 0, hours: 0, chapters: 0 },
  movies: { total: 0, in_progress: 0, completed: 0, dropped: 0, hours: 0 },
  tv: { total: 0, in_progress: 0, completed: 0, dropped: 0, hours: 0 },
  books: { total: 0, in_progress: 0, completed: 0, dropped: 0, hours: 0, pages: 0 },
  active_categories: [],
};

/**
 * Fetch user stats server-side via the calculate_user_stats RPC.
 * @param userId - The authenticated user ID
 * @returns PersonalStats object
 */
export async function fetchUserStats(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PersonalStats> {
  const { data, error } = await supabase.rpc('calculate_user_stats', {
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }

  return (data as PersonalStats) ?? EMPTY_STATS;
}

/**
 * Fetch continue data server-side
 * @param userId - The authenticated user ID
 * @returns ContinueData object
 */
export async function fetchContinueData(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ContinueData> {
  // Calculate enabled categories from user_category_profiles
  const { data: categoryProfile } = await supabase
    .from('user_category_profiles')
    .select('profiles')
    .eq('user_id', userId)
    .maybeSingle();

  // Categories are the keys in user_category_profiles.profiles
  const enabledCategories = categoryProfile?.profiles
    ? Object.keys(categoryProfile.profiles).filter(key => key && typeof key === 'string')
    : [];

  const normalizedCategories = normalizeEnabledCategories(enabledCategories);
  const slideCategories = normalizedCategories.filter(category =>
    SLIDE_CATEGORIES.includes(category as (typeof SLIDE_CATEGORIES)[number]),
  );

  if (normalizedCategories.length === 0) {
    return {
      enabledCategories: normalizedCategories,
      slides: [],
      countsByCategory: {},
    };
  }

  // Both queries only depend on normalizedCategories/slideCategories from the profile fetch above
  const [
    { data: currentEntriesData, error: currentError },
    { data: countEntries, error: countError },
  ] = await Promise.all([
    slideCategories.length > 0
      ? supabase
          .from('user_media_entries')
          .select(
            `
            id,
            media_id,
            status,
            progress,
            score,
            updated_at,
            created_at,
            media_items!inner (
              category,
              source,
              steam_app_id,
              title,
              title_english,
              title_romaji,
              title_native,
              original_title,
              season_year,
              release_date,
              cover_image_large,
              cover_image_medium
            )
          `,
          )
          .eq('user_id', userId)
          .eq('status', 'current')
          // Deliberate: "pick up where you left off" means something actually
          // started. An entry marked current with no recorded progress has no
          // point to resume from, so it stays out of the hero.
          .gt('progress', 0)
          .in('media_items.category', slideCategories)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('user_media_entries')
      .select('status, media_items!inner(category)')
      .eq('user_id', userId)
      .in('media_items.category', normalizedCategories),
  ]);

  if (currentError) {
    throw currentError;
  }
  if (countError) {
    throw countError;
  }

  const entries = Array.isArray(currentEntriesData) ? (currentEntriesData as ContinueEntry[]) : [];

  const sortedEntries = entries
    .filter(entry => entry.media_items?.category)
    .sort(compareEntryDates);

  const latestByCategory = new Map<string, ContinueSlide>();
  for (const entry of sortedEntries) {
    const media = entry.media_items;
    const category = media?.category;
    if (!category || latestByCategory.has(category)) {
      continue;
    }

    latestByCategory.set(category, {
      category,
      entry_id: entry.id,
      media_id: entry.media_id,
      status: entry.status,
      progress: entry.progress ?? null,
      score: entry.score !== null && entry.score !== undefined ? String(entry.score) : null,
      updated_at: entry.updated_at ?? entry.created_at ?? '',
      created_at: entry.created_at ?? entry.updated_at ?? '',
      title: resolveTitle(media),
      season_year: media?.season_year ?? null,
      release_date: media?.release_date ?? null,
      cover_image_large:
        media?.source === 'steam'
          ? normalizeSteamCoverForContinue(media?.cover_image_large, media?.steam_app_id)
          : (media?.cover_image_large ?? null),
      cover_image_medium:
        media?.source === 'steam'
          ? normalizeSteamCoverForContinue(media?.cover_image_medium, media?.steam_app_id)
          : (media?.cover_image_medium ?? null),
    });
  }

  const slides = Array.from(latestByCategory.values()).sort((a, b) => {
    const activityDiff =
      toTimestamp(b.updated_at || b.created_at) - toTimestamp(a.updated_at || a.created_at);
    if (activityDiff !== 0) {
      return activityDiff;
    }

    const createdDiff = toTimestamp(b.created_at) - toTimestamp(a.created_at);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return b.entry_id - a.entry_id;
  });

  const countsByCategory: Record<string, CountBucket> = {};
  for (const category of normalizedCategories) {
    countsByCategory[category] = {
      total: 0,
      planned: 0,
      current: 0,
      completed: 0,
      dropped: 0,
    };
  }

  for (const entry of (countEntries ?? []) as CountEntry[]) {
    const category = entry.media_items?.category;
    if (!category || !(category in countsByCategory)) {
      continue;
    }

    if (!entry.status) {
      continue;
    }
    const status = entry.status;
    countsByCategory[category].total += 1;

    if (status in countsByCategory[category]) {
      countsByCategory[category][status as keyof CountBucket] += 1;
    }
  }

  return {
    enabledCategories: normalizedCategories,
    slides,
    countsByCategory,
  };
}
