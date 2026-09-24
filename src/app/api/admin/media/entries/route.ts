import { withApiRoute } from '@/lib/observability/withApiRoute';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, okWithMeta } from '@/lib/api/response';
import { UnauthorizedError } from '@/lib/api/auth';
import { ForbiddenError, requireAdminRole } from '@/lib/api/permissions';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function escapeLike(value: string) {
  return value.replace(/[%_]/g, match => `\\${match}`);
}

async function fetchDistinctOptions(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  column: 'source' | 'category' | 'status' | 'format',
) {
  const { data, error } = await supabase
    .from('media_items')
    .select(column)
    .not(column, 'is', null)
    .limit(2000);

  if (error) {
    throw error;
  }

  // `column` is a union, so supabase-js infers a union of four differently
  // shaped row arrays and `.map` ends up with no signature common to all of
  // them. The rows are only ever read through the dynamic key, so collapse the
  // shape once here rather than casting inside the callback.
  const rows = (data ?? []) as Record<string, unknown>[];

  return Array.from(
    new Set(
      rows
        .map(row => row[column])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

async function GETHandler(req: Request) {
  try {
    const supabase = await createRouteHandlerClient();
    await requireAdminRole(supabase);

    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source')?.trim() ?? '';
    const category = searchParams.get('category')?.trim() ?? '';
    const status = searchParams.get('status')?.trim() ?? '';
    const format = searchParams.get('format')?.trim() ?? '';
    const q = searchParams.get('q')?.trim() ?? '';
    const onlyNew = searchParams.get('only_new') === '1';
    const newWindowDays = 7;

    const limit = Math.min(
      Math.max(
        Number.parseInt(searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT,
        1,
      ),
      MAX_LIMIT,
    );
    const offset = Math.max(Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);

    let request = supabase
      .from('media_items')
      .select(
        'id,mal_id,category,source,title,title_english,title_romaji,title_native,description,summary,storyline,format,status,season_year,episodes,start_date,end_date,first_release_date,release_date,runtime,rating,rating_count,aggregated_rating,aggregated_rating_count,metacritic,esrb_rating,rawg_id,igdb_id,igdb_category,igdb_slug,steam_app_id,developer,publisher,platforms,genres,igdb_themes,igdb_game_modes,igdb_player_perspectives,igdb_artwork_image_ids,igdb_screenshot_image_ids,official_website,cover_image_id,cover_url_thumb,cover_url_big,cover_image_large,cover_image_medium,igdb_updated_at,created_at,updated_at',
        { count: 'exact' },
      )
      .order('updated_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (source) {
      request = request.eq('source', source);
    }
    if (category) {
      request = request.eq('category', category);
    }
    if (status) {
      request = request.eq('status', status);
    }
    if (format) {
      request = request.eq('format', format);
    }
    if (q) {
      const safeQuery = `%${escapeLike(q)}%`;
      request = request.or(
        `title_english.ilike.${safeQuery},title_romaji.ilike.${safeQuery},title_native.ilike.${safeQuery},description.ilike.${safeQuery}`,
      );
    }
    if (onlyNew) {
      const cutoffIso = new Date(Date.now() - newWindowDays * 24 * 60 * 60 * 1000).toISOString();
      request = request.gte('created_at', cutoffIso);
    }

    const [{ data, error, count }, sourceOptions, categoryOptions, statusOptions, formatOptions] =
      await Promise.all([
        request,
        fetchDistinctOptions(supabase, 'source'),
        fetchDistinctOptions(supabase, 'category'),
        fetchDistinctOptions(supabase, 'status'),
        fetchDistinctOptions(supabase, 'format'),
      ]);

    if (error) {
      console.error('Admin media entries list error:', error);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    return okWithMeta(Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [], {
      total: count ?? 0,
      limit,
      offset,
      filters: {
        source: sourceOptions,
        category: categoryOptions,
        status: statusOptions,
        format: formatOptions,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof ForbiddenError) {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin media entries list error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const dynamic = 'force-dynamic';

export const GET = withApiRoute(GETHandler);
