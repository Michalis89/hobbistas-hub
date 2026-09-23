import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { readDerivedAuthorship } from '@/lib/ai/shared/taste/derived-authorship';
import { TV_AI_CATEGORY, TV_TASTE_LOG_SCOPE } from '../constants';
import type { TvAiAuthorship } from './types';

/**
 * Loading a television library.
 *
 * Two things about these rows shape everything downstream. A row may be a whole series or a single
 * season, and nothing in the schema says which — only the title does, which is why the identity
 * normalizer carries so much weight here. And `number_of_episodes` is a *series* total even on a
 * row that represents one season, so progress and total can be recorded against different units;
 * the evidence builder reconciles that rather than dividing them naively.
 */

const PAGE_SIZE = 500;

export type TvHistoryEntry = {
  id: number;
  mediaId: number;
  status: 'planned' | 'current' | 'completed' | 'dropped';
  score: number | null;
  /** Episodes watched, as the library recorded them. */
  progress: number | null;
  isFavorite: boolean;
  updatedAt: string;
  media: {
    id: number;
    title: string;
    genres: string[];
    totalEpisodes: number | null;
    totalSeasons: number | null;
    firstAirYear: number | null;
  };
};

export type TvHistory = {
  entries: TvHistoryEntry[];
  authorship: TvAiAuthorship;
};

type TvHistoryRow = {
  id: number;
  media_id: number;
  status: string;
  score: number | null;
  progress: number | null;
  is_favorite: boolean | null;
  updated_at: string | null;
  media_items: {
    id: number;
    title: string | null;
    title_english: string | null;
    original_title: string | null;
    genres: string[] | null;
    number_of_episodes: number | null;
    number_of_seasons: number | null;
    first_air_date: string | null;
  };
};

export async function loadTvHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TvHistory> {
  const [entries, authorship] = await Promise.all([
    loadEntries(supabase, userId),
    readDerivedAuthorship(
      supabase,
      userId,
      TV_AI_CATEGORY,
      ['directors', 'actors'],
      TV_TASTE_LOG_SCOPE,
    ),
  ]);

  return {
    entries,
    authorship: {
      directors: authorship.directors ?? [],
      actors: authorship.actors ?? [],
    },
  };
}

async function loadEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TvHistoryEntry[]> {
  const rows: TvHistoryRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('user_media_entries')
      .select(
        `
        id,
        media_id,
        status,
        score,
        progress,
        is_favorite,
        updated_at,
        media_items!inner(
          id,
          title,
          title_english,
          original_title,
          genres,
          number_of_episodes,
          number_of_seasons,
          first_air_date
        )
      `,
      )
      .eq('media_items.category', 'tv')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`[${TV_TASTE_LOG_SCOPE}] history load failed:`, error.message ?? error);
      return [];
    }

    const page = (data ?? []) as unknown as TvHistoryRow[];
    if (page.length === 0) {
      break;
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return rows.map(toHistoryEntry);
}

function toHistoryEntry(row: TvHistoryRow): TvHistoryEntry {
  const item = row.media_items;
  return {
    id: row.id,
    mediaId: row.media_id,
    status: row.status as TvHistoryEntry['status'],
    score: normalizeScore(row.score),
    progress: normalizeCount(row.progress),
    isFavorite: row.is_favorite ?? false,
    updatedAt: row.updated_at ?? new Date().toISOString(),
    media: {
      id: item.id,
      title: item.title_english ?? item.title ?? item.original_title ?? 'Untitled',
      genres: (item.genres ?? []).filter(Boolean),
      totalEpisodes: normalizeCount(item.number_of_episodes),
      totalSeasons: normalizeCount(item.number_of_seasons),
      firstAirYear: parseYear(item.first_air_date),
    },
  };
}

/** Zero is "unrated" on this column, not a rating of zero. */
function normalizeScore(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeCount(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function parseYear(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) && year > 1930 && year < 2100 ? year : null;
}
