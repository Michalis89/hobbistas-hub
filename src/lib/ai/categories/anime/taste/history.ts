import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Loads anime library history for taste evidence.
 *
 * A separate loader from `animeAdapter.loadData`, on purpose. That one selects only what the
 * deterministic recommender scores on — title, genres, covers — and widening it would make every
 * recommendation request pay for columns the scorers are forbidden to read. The AI path needs
 * `episodes`, `format` and `season_year` and nothing else needs them, so it asks for them here.
 *
 * Deliberately absent: `tags`. On anime rows the MAL importer writes alternative-title synonyms
 * into that column, not thematic tags. Feeding "Shingeki no Kyojin" to the model as a *theme* of
 * Attack on Titan would be worse than sending nothing.
 */

const PAGE_SIZE = 500;

export type AnimeHistoryEntry = {
  id: number;
  mediaId: number;
  status: 'planned' | 'current' | 'completed' | 'dropped';
  score: number | null;
  /** Episodes watched. Anime progress is an absolute count, not a percentage. */
  progress: number | null;
  isFavorite: boolean;
  updatedAt: string;
  media: {
    id: number;
    title: string;
    genres: string[];
    /** Total episodes from the source. Null for films and for rows the importer left blank. */
    episodes: number | null;
    /** MAL `media_type`: tv, movie, ova, ona, special, music. */
    format: string | null;
    seasonYear: number | null;
  };
};

type AnimeHistoryRow = {
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
    title_romaji: string | null;
    genres: string[] | null;
    episodes: number | null;
    format: string | null;
    season_year: number | null;
  };
};

export async function loadAnimeHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<AnimeHistoryEntry[]> {
  const rows: AnimeHistoryRow[] = [];
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
          title_romaji,
          genres,
          episodes,
          format,
          season_year
        )
      `,
      )
      .eq('media_items.category', 'anime')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('[anime-ai-taste] history load failed:', error.message ?? error);
      return [];
    }

    const page = (data ?? []) as unknown as AnimeHistoryRow[];
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

function toHistoryEntry(row: AnimeHistoryRow): AnimeHistoryEntry {
  const item = row.media_items;
  return {
    id: row.id,
    mediaId: row.media_id,
    status: row.status as AnimeHistoryEntry['status'],
    score: normalizeScore(row.score),
    progress: normalizeCount(row.progress),
    isFavorite: row.is_favorite ?? false,
    updatedAt: row.updated_at ?? new Date().toISOString(),
    media: {
      id: item.id,
      // English first, matching how the rest of the app titles anime, so the titles the model is
      // asked to cite are the titles the user sees on their own dashboard.
      title: item.title_english ?? item.title_romaji ?? item.title ?? 'Untitled',
      genres: item.genres ?? [],
      episodes: normalizeCount(item.episodes),
      format: item.format?.trim().toLowerCase() || null,
      seasonYear: normalizeCount(item.season_year),
    },
  };
}

/** Zero and negatives mean "not recorded" for both counts and totals. */
function normalizeCount(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeScore(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
