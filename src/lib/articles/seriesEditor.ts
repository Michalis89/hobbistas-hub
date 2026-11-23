import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeriesDatabase } from './seriesDatabase';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth } from '@/lib/api/auth';
import { getUserFullInfo } from '@/lib/services/userService';
import { isAdminOrModerator } from '@/lib/roles';
import { fail } from '@/lib/api/response';

export async function editorContext() {
  const client = await createRouteHandlerClient();
  const session = await requireAuth(client);
  const user = await getUserFullInfo(client, session.user.id);
  return {
    db: client as unknown as SupabaseClient<SeriesDatabase>,
    user,
    userId: session.user.id,
    elevated: isAdminOrModerator(user),
  };
}
export async function managedSeries(
  db: SupabaseClient<SeriesDatabase>,
  id: number,
  userId: string,
  elevated: boolean,
) {
  const { data } = await db.from('article_series').select('*').eq('id', id).maybeSingle();
  return data && (data.owner_id === userId || elevated) ? data : null;
}
export function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export function errorResponse(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return privateResponse(
    fail(
      { error: name === 'UnauthorizedError' ? 'Unauthorized' : 'Unable to process request' },
      name === 'UnauthorizedError' ? 401 : 500,
    ),
  );
}
export function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
