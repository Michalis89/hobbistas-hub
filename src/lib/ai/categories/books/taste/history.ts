import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { BOOKS_TASTE_LOG_SCOPE } from '../constants';

/**
 * Loading a book library.
 *
 * One column here does not mean what it is called, and the whole category depends on knowing it:
 * `media_items.tags` holds **author names** for books, written there by the Google Books importer.
 * `recomputeCategoryProfiles` already reads it that way to derive `favorite_authors`, so this is
 * the established reading rather than a guess — but it is worth stating at every site, because the
 * same column on a manga row holds alternative titles and on a games row holds nothing useful.
 *
 * That is also why books need no derived-authorship lookup: the signal is on the row. Movies and tv
 * have to quote a library-wide list computed from TMDB credits; a book knows who wrote it.
 */

const PAGE_SIZE = 500;

export type BooksHistoryEntry = {
  id: number;
  mediaId: number;
  status: 'planned' | 'current' | 'completed' | 'dropped';
  score: number | null;
  /** Pages read, where the library recorded any. */
  progress: number | null;
  isFavorite: boolean;
  updatedAt: string;
  media: {
    id: number;
    title: string;
    genres: string[];
    /** From `media_items.tags` — see the module note. */
    authors: string[];
    pageCount: number | null;
    publicationYear: number | null;
  };
};

type BooksHistoryRow = {
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
    original_title: string | null;
    genres: string[] | null;
    tags: unknown;
    page_count: number | null;
    release_date: string | null;
  };
};

export async function loadBooksHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BooksHistoryEntry[]> {
  const rows: BooksHistoryRow[] = [];
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
          original_title,
          genres,
          tags,
          page_count,
          release_date
        )
      `,
      )
      .eq('media_items.category', 'books')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`[${BOOKS_TASTE_LOG_SCOPE}] history load failed:`, error.message ?? error);
      return [];
    }

    const page = (data ?? []) as unknown as BooksHistoryRow[];
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

function toHistoryEntry(row: BooksHistoryRow): BooksHistoryEntry {
  const item = row.media_items;
  return {
    id: row.id,
    mediaId: row.media_id,
    status: row.status as BooksHistoryEntry['status'],
    score: normalizeScore(row.score),
    progress: normalizeCount(row.progress),
    isFavorite: row.is_favorite ?? false,
    updatedAt: row.updated_at ?? new Date().toISOString(),
    media: {
      id: item.id,
      title: item.title ?? item.original_title ?? 'Untitled',
      genres: (item.genres ?? []).filter(Boolean),
      authors: toAuthorList(item.tags),
      pageCount: normalizeCount(item.page_count),
      publicationYear: parseYear(item.release_date),
    },
  };
}

/** `tags` is `jsonb`, so it arrives as whatever was written. Anything not a string array is dropped. */
function toAuthorList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .filter((name): name is string => typeof name === 'string')
        .map(name => name.trim())
        .filter(Boolean),
    ),
  ).sort();
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
  return Number.isFinite(year) && year > 1400 && year < 2100 ? year : null;
}
