import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Loads manga library history for taste evidence.
 *
 * More defensive than the anime loader, because the manga rows in this database are not what
 * their column names claim. Three write paths produce them and they do not agree:
 *
 *   1. the admin importer (`/api/admin/media/import/mal`) writes `chapters` and `volumes` from
 *      MAL's `num_chapters` / `num_volumes` — genuine series totals;
 *   2. the in-app search provider writes the same two fields the same way;
 *   3. the user MAL OAuth sync (`/api/integrations/mal/sync`) writes
 *      `chapters: list_status.num_chapters_read` — *the importing user's own progress* — and
 *      never writes `volumes` at all.
 *
 * Path 3 upserts on `(mal_id, category)` into a row shared by every user, so one reader's chapter
 * count can be sitting in the `chapters` column of a title nobody else has read. Treating that as
 * a denominator would not merely be imprecise; it would invent a completion ratio out of a
 * stranger's bookmark. See `resolveChapterTotal` for how this is contained.
 *
 * Deliberately absent: `tags`. As on anime rows, the MAL importer writes alternative-title
 * synonyms into that column rather than thematic tags, so it carries no taste signal.
 *
 * Deliberately absent because the schema has no such column for manga: authors, artists,
 * publishers, serialisation magazine, an explicit demographic field, an explicit theme field, and
 * any sequel/prequel/spin-off relation. `studios` exists but is written only for anime. Every one
 * of those would be useful and none of them is available; the profile is built without them.
 */

const PAGE_SIZE = 500;

const MANGA_HISTORY_SELECT = [
  'id',
  'media_id',
  'status',
  'score',
  'progress',
  'is_favorite',
  'import_source',
  'updated_at',
  'media_items!inner(id,title,title_english,title_romaji,genres,chapters,volumes,format,status,start_date)',
].join(',');

/**
 * What `user_media_entries.progress` counts on a manga row.
 *
 * The two importers disagree and the column does not record which one wrote it, so the unit is
 * inferred from `import_source` rather than assumed:
 *
 *   - the MAL OAuth sync writes `num_chapters_read`, so its rows are chapters;
 *   - the edit dialog labels the field "Volumes", clamps it against the volume total and writes
 *     what the user typed, so hand-managed rows are volumes.
 *
 * `unknown` is a real and common answer, and is treated as such everywhere downstream: no ratio
 * is computed from a count whose unit is not known.
 */
export type MangaProgressUnit = 'chapters' | 'volumes' | 'unknown';

export type MangaHistoryEntry = {
  id: number;
  mediaId: number;
  status: 'planned' | 'current' | 'completed' | 'dropped';
  score: number | null;
  /** Raw progress count. Meaningless without {@link MangaHistoryEntry.progressUnit}. */
  progress: number | null;
  progressUnit: MangaProgressUnit;
  isFavorite: boolean;
  updatedAt: string;
  media: {
    id: number;
    title: string;
    genres: string[];
    /**
     * Total chapters, but only when the row can be shown not to have come from the OAuth sync.
     * Null far more often than the column is populated. See `resolveChapterTotal`.
     */
    totalChapters: number | null;
    /** Total volumes. Trustworthy whenever present — no write path puts progress here. */
    totalVolumes: number | null;
    /** MAL `media_type`, lowercased: manga, novel, light_novel, one_shot, doujinshi, manhwa. */
    format: string | null;
    /** MAL publication status: finished, currently_publishing, on_hiatus, discontinued. */
    publicationStatus: string | null;
    /** First publication year, from `start_date`. Null when absent. */
    startYear: number | null;
  };
};

type MangaHistoryRow = {
  id: number;
  media_id: number;
  status: string;
  score: number | null;
  progress: number | null;
  is_favorite: boolean | null;
  import_source: string | null;
  updated_at: string | null;
  media_items: {
    id: number;
    title: string | null;
    title_english: string | null;
    title_romaji: string | null;
    genres: string[] | null;
    chapters: number | null;
    volumes: number | null;
    format: string | null;
    status: string | null;
    start_date: string | null;
  };
};

export async function loadMangaHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<MangaHistoryEntry[]> {
  const rows: MangaHistoryRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('user_media_entries')
      .select(MANGA_HISTORY_SELECT)
      .eq('media_items.category', 'manga')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('[manga-ai-taste] history load failed:', error.message ?? error);
      return [];
    }

    const page = (data ?? []) as unknown as MangaHistoryRow[];
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

/**
 * Whether `media_items.chapters` may be read as a series total.
 *
 * The rule is: only when `volumes` is also populated.
 *
 * It works because of how the write paths are shaped rather than by luck. The two paths that
 * write a *true* chapter total (admin import, in-app search) always write `num_chapters` and
 * `num_volumes` in the same statement. The path that writes a *user's progress* into `chapters`
 * never writes `volumes` at all. So a populated `chapters` beside a null `volumes` is the
 * signature of the OAuth sync, and the number in it is somebody's bookmark.
 *
 * The cost is real and worth stating plainly: a genuinely volume-less series — most manhwa and
 * webtoons publish in chapters only, and MAL reports `num_volumes: 0` for them — loses a chapter
 * total it legitimately had. That is the deliberate direction to fail in. A missing total makes
 * the progress band degrade to the absolute-count fallback, which is honest; a wrong total makes
 * it produce a confident ratio that is fiction.
 */
export function resolveChapterTotal(
  chapters: number | null,
  volumes: number | null,
): number | null {
  if (normalizeCount(volumes) === null) {
    return null;
  }
  return normalizeCount(chapters);
}

/**
 * What unit a row's `progress` is counted in.
 *
 * `import_source` is the only structural record of which writer produced the row, so it is what
 * decides. A row imported from MAL and then hand-edited is indistinguishable from one that was
 * not, and no heuristic recovers it — the incoherence is caught later instead, by the progress
 * bander refusing to compute a ratio from a count that exceeds its own total.
 */
export function resolveProgressUnit(
  importSource: string | null,
  progress: number | null,
): MangaProgressUnit {
  if (normalizeCount(progress) === null) {
    return 'unknown';
  }
  return importSource === 'mal' ? 'chapters' : 'volumes';
}

function toHistoryEntry(row: MangaHistoryRow): MangaHistoryEntry {
  const item = row.media_items;
  const progress = normalizeCount(row.progress);

  return {
    id: row.id,
    mediaId: row.media_id,
    status: row.status as MangaHistoryEntry['status'],
    score: normalizeScore(row.score),
    progress,
    progressUnit: resolveProgressUnit(row.import_source, progress),
    isFavorite: row.is_favorite ?? false,
    updatedAt: row.updated_at ?? new Date().toISOString(),
    media: {
      id: item.id,
      // English first, matching how the rest of the app titles manga, so the titles the model is
      // asked to cite are the titles the user sees on their own dashboard.
      title: item.title_english ?? item.title_romaji ?? item.title ?? 'Untitled',
      genres: item.genres ?? [],
      totalChapters: resolveChapterTotal(item.chapters, item.volumes),
      totalVolumes: normalizeCount(item.volumes),
      format: item.format?.trim().toLowerCase() || null,
      publicationStatus: item.status?.trim().toLowerCase() || null,
      startYear: parseYear(item.start_date),
    },
  };
}

function parseYear(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) && year > 0 ? year : null;
}

/** Zero and negatives mean "not recorded" for both counts and totals. */
function normalizeCount(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeScore(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
