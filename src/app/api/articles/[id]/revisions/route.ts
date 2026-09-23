import { withApiRoute } from '@/lib/observability/withApiRoute';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { getUserFullInfo } from '@/lib/services/userService';
import { hasAnyRole } from '@/lib/roles';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';

/**
 * Article version history.
 *
 * Without `?revision=`, returns the list without bodies: twenty snapshots of a
 * long article is megabytes, and the list only needs timestamps to render.
 */
async function GETHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const articleId = Number.parseInt(id, 10);
    if (!Number.isInteger(articleId)) {
      return fail({ error: 'Invalid article id' }, 400);
    }

    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);

    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id, author_id')
      .eq('id', articleId)
      .single();

    if (articleError || !article) {
      return fail({ error: 'Article not found' }, 404);
    }

    const userData = await getUserFullInfo(supabase, session.user.id);
    const isAuthor = article.author_id === session.user.id;
    const canManage = hasAnyRole(userData, ['admin', 'owner', 'moderator']);

    if (!isAuthor && !canManage) {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }

    const revisionId = Number.parseInt(new URL(req.url).searchParams.get('revision') ?? '', 10);

    if (Number.isInteger(revisionId)) {
      const { data: revision, error } = await supabase
        .from('article_revisions')
        .select('id, created_at, title, description, content_rich, content_html')
        .eq('id', revisionId)
        .eq('article_id', articleId)
        .single();

      if (error || !revision) {
        return fail({ error: 'Revision not found' }, 404);
      }

      return ok({ revision });
    }

    const { data: revisions, error } = await supabase
      .from('article_revisions')
      .select('id, created_at, title')
      .eq('article_id', articleId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to list article revisions', error);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    return ok({ revisions: revisions ?? [] });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.error('Article revisions error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const GET = withApiRoute(GETHandler);
