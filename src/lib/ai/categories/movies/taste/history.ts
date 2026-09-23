import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { readDerivedAuthorship } from '@/lib/ai/shared/taste/derived-authorship';
import { MOVIES_AI_CATEGORY, MOVIES_TASTE_LOG_SCOPE } from '../constants';
import type { MoviesAiAuthorship } from './types';

/**
 * Loading a film library, and the one thing that library does not contain.
 *
 * `media_items` carries no credits for a film — no director, no cast — so the rows here describe
 * *what* was watched and never *who made it*. The authorship half comes from
 * `user_category_profiles`, derived from TMDB credits by the profile recompute, and is fetched
 * alongside rather than joined: it is one row keyed by user, not per media item.
 */

const PAGE_SIZE = 500;

export type MoviesHistoryEntry = {
  id: number;
  mediaId: number;
  status: 'planned' | 'current' | 'completed' | 'dropped';
  score: number | null;
  /** Minutes watched, where the library recorded any. Almost always null for films. */
  progress: number | null;
  isFavorite: boolean;
  updatedAt: string;
  media: {
    id: number;
    title: string;
    genres: string[];
    /** Minutes, from `media_items.runtime`. */
    runtime: number | null;
    releaseYear: number | null;
  };
};

export type MoviesHistory = {
  entries: MoviesHistoryEntry[];
  authorship: MoviesAiAuthorship;
};

type MoviesHistoryRow = {
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
    runtime: number | null;
    release_date: string | null;
  };
};

export async function loadMoviesHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MoviesHistory> {
  const [entries, authorship] = await Promise.all([
    loadEntries(supabase, userId),
    readDerivedAuthorship(
      supabase,
      userId,
      MOVIES_AI_CATEGORY,
      ['directors', 'actors'],
      MOVIES_TASTE_LOG_SCOPE,
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
): Promise<MoviesHistoryEntry[]> {
  const rows: MoviesHistoryRow[] = [];
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
          runtime,
          release_date
        )
      `,
      )
      .eq('media_items.category', 'movies')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`[${MOVIES_TASTE_LOG_SCOPE}] history load failed:`, error.message ?? error);
      return [];
    }

    const page = (data ?? []) as unknown as MoviesHistoryRow[];
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

function toHistoryEntry(row: MoviesHistoryRow): MoviesHistoryEntry {
  const item = row.media_items;
  return {
    id: row.id,
    mediaId: row.media_id,
    status: row.status as MoviesHistoryEntry['status'],
    score: normalizeScore(row.score),
    progress: normalizeCount(row.progress),
    isFavorite: row.is_favorite ?? false,
    updatedAt: row.updated_at ?? new Date().toISOString(),
    media: {
      id: item.id,
      // English first, matching how the rest of the app titles films, so the titles the model is
      // asked to cite are the titles the user sees on their own dashboard.
      title: item.title_english ?? item.title ?? item.original_title ?? 'Untitled',
      genres: (item.genres ?? []).filter(Boolean),
      runtime: normalizeCount(item.runtime),
      releaseYear: parseYear(item.release_date),
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
  return Number.isFinite(year) && year > 1870 && year < 2100 ? year : null;
}
