import { redirect } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { canManageAllArticles, hasAnyRole } from '@/lib/roles';

export type StudioAccess = {
  session: Session;
  roles: string[];
  /** May create and edit articles. */
  canWriteArticles: boolean;
  /** May create and edit reviews. */
  canWriteReviews: boolean;
  /** May see and edit other authors' content (admin, owner, moderator). */
  canManageAllContent: boolean;
  /** May start a new article or review; a moderator only edits existing ones. */
  canCreate: boolean;
};

/**
 * Gate for /studio.
 *
 * The studio is open to every author and reviewer, not just admins: writing is
 * the point of the role. Admins, owners and moderators additionally see and
 * edit everyone's work, drafts included; a moderator gets in for that alone,
 * without being able to start new pieces.
 *
 * The database enforces the same "manage all" rule through RLS
 * (`public.can_manage_all_articles()`), see `canManageAllArticles`.
 *
 * Redirects rather than throwing, because this runs in page server components.
 */
export async function requireStudioAccess(): Promise<StudioAccess> {
  const supabase = await createRouteHandlerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login?redirect=/studio');
  }

  const { data: user } = await supabase
    .from('users')
    .select('roles')
    .eq('id', session.user.id)
    .single();

  const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : [];
  const carrier = { roles };

  const canWriteArticles = hasAnyRole(carrier, ['admin', 'owner', 'author']);
  const canWriteReviews = hasAnyRole(carrier, ['admin', 'owner', 'reviewer']);
  const canManageAllContent = canManageAllArticles(carrier);
  const canCreate = canWriteArticles || canWriteReviews;

  if (!canCreate && !canManageAllContent) {
    redirect('/dashboard');
  }

  return {
    session,
    roles,
    canWriteArticles,
    canWriteReviews,
    canManageAllContent,
    canCreate,
  };
}
