import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeriesDatabase } from './seriesDatabase';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { getUserFullInfo } from '@/lib/services/userService';
import { fail } from '@/lib/api/response';
import { canCreateSeries, canManageAllSeries, canManageSeries } from './seriesAccess';

export async function editorContext() {
  const client = await createRouteHandlerClient();
  const session = await requireAuth(client);
  const user = await getUserFullInfo(client, session.user.id);
  return {
    db: client as unknown as SupabaseClient<SeriesDatabase>,
    user,
    userId: session.user.id,
    canCreate: canCreateSeries(user),
    canManageAll: canManageAllSeries(user),
  };
}

/**
 * The series, if this user may manage it; otherwise null (reported as 404 so
 * a series' existence is not revealed). RLS applies the same rule again.
 */
export async function managedSeries(
  db: SupabaseClient<SeriesDatabase>,
  id: number,
  user: { roles?: string[] | null } | null,
  userId: string,
) {
  const { data } = await db.from('article_series').select('*').eq('id', id).maybeSingle();
  return data && canManageSeries(user, userId, data) ? data : null;
}

export function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export function errorResponse(error: unknown) {
  const unauthorized = error instanceof UnauthorizedError;
  return privateResponse(
    fail(
      { error: unauthorized ? 'Unauthorized' : 'Unable to process request' },
      unauthorized ? 401 : 500,
    ),
  );
}

/**
 * HTTP status for a database error from a series write.
 *
 * PT409 (stale chapter version), 23505 (article already in another series),
 * 40P01 (deadlock) and 40001 (serialization failure) are all conflicts the
 * editor must resolve by reloading; none is retried automatically.
 */
export function seriesWriteStatus(code: string | undefined): 400 | 403 | 404 | 409 | 500 {
  switch (code) {
    case 'PT409':
    case '23505':
    case '40P01':
    case '40001':
      return 409;
    case '42501':
      return 403;
    case 'P0002':
      return 404;
    case '22023':
    case '23514':
      return 400;
    default:
      return 500;
  }
}

export function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Covers are https only: the page is served over https and http would be blocked. */
export function isValidCoverUrl(value: string | null): boolean {
  return !value || /^https:\/\/\S+$/i.test(value);
}
