import { redirect } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { canAccessSeriesStudio, canCreateSeries, canManageAllSeries } from './seriesAccess';

export type SeriesStudioAccess = {
  session: Session;
  roles: string[];
  canCreate: boolean;
  canManageAll: boolean;
};

/**
 * Gate for /studio/series, deliberately separate from `requireStudioAccess`.
 *
 * Studio's article screens stay exactly as they are. Series Management also
 * admits moderators, because they may manage every series (the same rule the
 * API and the database apply).
 */
export async function requireSeriesStudioAccess(): Promise<SeriesStudioAccess> {
  const supabase = await createRouteHandlerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login?redirect=/studio/series');
  }

  const { data: user } = await supabase
    .from('users')
    .select('roles')
    .eq('id', session.user.id)
    .single();

  const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : [];
  const carrier = { roles };

  if (!canAccessSeriesStudio(carrier)) {
    redirect('/dashboard');
  }

  return {
    session,
    roles,
    canCreate: canCreateSeries(carrier),
    canManageAll: canManageAllSeries(carrier),
  };
}
