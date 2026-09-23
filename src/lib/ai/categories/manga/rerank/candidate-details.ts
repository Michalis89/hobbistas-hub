import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { resolveChapterTotal } from '@/lib/ai/categories/manga/taste/history';
import { MANGA_RERANK_LOG_SCOPE } from '../constants';

/**
 * The fields a rerank needs that the served path never loads.
 *
 * The shared pipeline's `MediaCandidate` carries a title, a cover and a label list. Asking it to
 * load synopses and chapter counts for every manga in the library would charge a much larger query
 * to the request the user is waiting on, for the benefit of an observation that runs after the
 * response has been flushed. So the rerank fetches what it needs, for the twenty rows it sends.
 */
export type MangaRerankCandidateDetail = {
  synopsis: string | null;
  format: string | null;
  /** Null unless `resolveChapterTotal` can show the number is a series total, not a bookmark. */
  totalChapters: number | null;
  totalVolumes: number | null;
  publicationStatus: string | null;
  startYear: number | null;
};

type DetailRow = {
  id: number;
  description: string | null;
  format: string | null;
  chapters: number | null;
  volumes: number | null;
  status: string | null;
  start_date: string | null;
};

/**
 * Loads details for exactly the shortlisted ids.
 *
 * Returns an empty map on failure rather than throwing: a shadow observation with thinner
 * candidates is still worth having, and nothing here may disturb the response already sent.
 */
export async function loadMangaCandidateDetails(
  supabase: SupabaseClient<Database>,
  mediaIds: readonly number[],
): Promise<Map<number, MangaRerankCandidateDetail>> {
  const details = new Map<number, MangaRerankCandidateDetail>();
  if (mediaIds.length === 0) {
    return details;
  }

  const { data, error } = await supabase
    .from('media_items')
    .select('id, description, format, chapters, volumes, status, start_date')
    .in('id', [...mediaIds]);

  if (error) {
    console.warn(`[${MANGA_RERANK_LOG_SCOPE}] candidate detail load failed:`, error.message ?? error);
    return details;
  }

  for (const row of (data ?? []) as DetailRow[]) {
    details.set(row.id, {
      synopsis: row.description ?? null,
      format: row.format?.trim().toLowerCase() || null,
      // The one rule that decides whether `chapters` is a total or somebody's bookmark. Shared
      // with the taste layer rather than restated, so the two can never disagree about a row.
      totalChapters: resolveChapterTotal(row.chapters, row.volumes),
      totalVolumes: normalizeCount(row.volumes),
      publicationStatus: row.status?.trim().toLowerCase() || null,
      startYear: parseYear(row.start_date),
    });
  }

  return details;
}

/** Zero means "unknown" on these rows, not "none". */
function normalizeCount(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function parseYear(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) && year > 1900 && year < 2100 ? year : null;
}
