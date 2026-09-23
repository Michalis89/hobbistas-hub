import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { ANIME_RERANK_LOG_SCOPE } from '../constants';

/**
 * The fields a rerank needs that the served path never loads.
 *
 * The anime adapter's `MediaCandidate` carries a title, a cover and a genre list — enough for a
 * genre-overlap score and nothing more. Asking the adapter to load synopses and episode counts for
 * every candidate in the library would charge a much larger query to the request the user is
 * waiting on, for the benefit of an observation that runs after the response has been flushed. So
 * the rerank fetches what it needs, for the twenty rows it actually sends.
 */
export type AnimeRerankCandidateDetail = {
  synopsis: string | null;
  format: string | null;
  episodes: number | null;
  seasonYear: number | null;
};

type DetailRow = {
  id: number;
  description: string | null;
  format: string | null;
  episodes: number | null;
  season_year: number | null;
};

/**
 * Loads details for exactly the shortlisted ids.
 *
 * Returns an empty map on failure rather than throwing: a shadow observation with thinner
 * candidates is still worth having, and nothing here may disturb the response already sent.
 */
export async function loadAnimeCandidateDetails(
  supabase: SupabaseClient<Database>,
  mediaIds: readonly number[],
): Promise<Map<number, AnimeRerankCandidateDetail>> {
  const details = new Map<number, AnimeRerankCandidateDetail>();
  if (mediaIds.length === 0) {
    return details;
  }

  const { data, error } = await supabase
    .from('media_items')
    .select('id, description, format, episodes, season_year')
    .in('id', [...mediaIds]);

  if (error) {
    console.warn(`[${ANIME_RERANK_LOG_SCOPE}] candidate detail load failed:`, error.message ?? error);
    return details;
  }

  for (const row of (data ?? []) as DetailRow[]) {
    details.set(row.id, {
      synopsis: row.description ?? null,
      format: row.format ?? null,
      episodes: normalizeEpisodes(row.episodes),
      seasonYear: normalizeYear(row.season_year),
    });
  }

  return details;
}

/** Zero means "unknown" on these rows, not "no episodes"; a fabricated 0 would read as a film. */
function normalizeEpisodes(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function normalizeYear(value: number | null): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 1900 && value < 2100
    ? value
    : null;
}
