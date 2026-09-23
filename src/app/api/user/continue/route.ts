import { withApiRoute } from '@/lib/observability/withApiRoute';

import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { API_ERRORS } from '@/lib/api/errors';
import { fail } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DASHBOARD_CATEGORIES = ['games', 'anime', 'manga', 'movies', 'tv', 'books'] as const;
const SLIDE_CATEGORIES = ['games', 'anime', 'manga', 'tv', 'books'] as const;
type DashboardCategory = (typeof DASHBOARD_CATEGORIES)[number];

type ContinueSlide = {
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

/**
 * GET /api/user/continue
 * Returns continue-where-you-left-off slides, enabled categories, and counts.
 */
async function GETHandler() {
  try {
    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);
    const userId = session.user.id;

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
      return NextResponse.json({
        enabledCategories: normalizedCategories,
        slides: [],
        countsByCategory: {},
      });
    }

    let entries: ContinueEntry[] = [];
    if (slideCategories.length > 0) {
      const { data: currentEntries, error: currentError } = await supabase
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
        .order('id', { ascending: false });

      if (currentError) {
        throw currentError;
      }

      entries = Array.isArray(currentEntries) ? (currentEntries as ContinueEntry[]) : [];
    }
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

    const { data: countEntries, error: countError } = await supabase
      .from('user_media_entries')
      .select('status, media_items!inner(category)')
      .eq('user_id', userId)
      .in('media_items.category', normalizedCategories);

    if (countError) {
      throw countError;
    }

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

    return NextResponse.json({
      enabledCategories: normalizedCategories,
      slides,
      countsByCategory,
    });
  } catch (error) {
    console.error('Continue endpoint error:', error);
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const GET = withApiRoute(GETHandler);
