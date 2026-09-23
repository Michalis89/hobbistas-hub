import { withApiRoute } from '@/lib/observability/withApiRoute';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { sanitizeHtmlContent } from '@/utils/security/sanitizeHtml';
import { validatePlainText, validatePlainTextArray } from '@/utils/validation/text';
import { validateTipTapContent } from '@/utils/validation/tiptap';
import { normalizeSlug } from '@/utils/slugify';
import { insertActivity } from '@/lib/services/activityService';
import type { Database } from '@/lib/supabase/database.types';
import { API_ERRORS } from '@/lib/api/errors';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { fail, ok } from '@/lib/api/response';
import { revalidateCache } from '@/lib/cache/tags';
import { collectArticleMediaLinks, syncArticleMediaLinks } from '@/lib/articles/mediaLinks';
import { snapshotArticleRevision } from '@/lib/articles/revisions';
import { hasAnyRole } from '@/lib/roles';
import { getUserFullInfo } from '@/lib/services/userService';

// GET - Fetch single article by ID or slug
async function GETHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createRouteHandlerClient();

    // Try to fetch by ID first, then by slug
    const isNumeric = /^\d+$/.test(id);

    let query = supabase
      .from('articles')
      .select('*, users!author_id(username, display_name, avatar_url)');

    if (isNumeric) {
      query = query.eq('id', Number.parseInt(id, 10));
    } else {
      const normalized = normalizeSlug(id);
      const slugCandidates = Array.from(
        new Set([id, normalized, `-${normalized}`, `${normalized}-`, `-${normalized}-`]),
      ).filter(value => value && value !== '-');
      query = query.in('slug', slugCandidates);
    }

    const { data: article, error } = await query.single();

    if (error || !article) {
      return fail({ error: 'Article not found' }, 404);
    }

    // Record view (optionally)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user?.id) {
      try {
        const viewPayload: Database['public']['Tables']['article_views']['Insert'] = {
          article_id: article.id,
          user_id: session.user.id,
        };
        await supabase.from('article_views').insert(viewPayload);
      } catch {
        // Views tracking is optional, don't fail if it errors
      }
    }

    return ok(article);
  } catch (error) {
    console.error('Error fetching article:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

// PUT - Update article
async function PUTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createRouteHandlerClient();

    const session = await requireAuth(supabase);

    // Get existing article
    const { data: existingArticle, error: fetchError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', Number.parseInt(id, 10))
      .single();

    if (fetchError || !existingArticle) {
      return fail({ error: 'Article not found' }, 404);
    }

    // Check permission (author or admin)
    const userData = await getUserFullInfo(supabase, session.user.id);

    const isAuthor = existingArticle.author_id === session.user.id;
    const isAdmin = hasAnyRole(userData, ['admin', 'owner', 'reviewer']);

    if (!isAuthor && !isAdmin) {
      return fail({ error: 'Access forbidden' }, 403);
    }

    const body = await req.json();
    const {
      title,
      slug,
      description,
      category,
      topic,
      tags,
      cover_image,
      content_rich,
      content_html,
      meta_title,
      meta_description,
      status,
      is_featured,
      score,
      media_id,
      scheduled_for,
    } = body;

    if (score !== undefined && score !== null) {
      const numScore = Number(score);
      if (Number.isNaN(numScore) || numScore < 0 || numScore > 10) {
        return fail({ error: 'Score must be between 0 and 10' }, 400);
      }
    }
    if (title !== undefined) {
      const titleValidation = validatePlainText(title, 'Title');
      if (!titleValidation.isValid) {
        return fail({ error: titleValidation.error || 'Invalid title' }, 400);
      }
    }
    if (description !== undefined) {
      const descriptionValidation = validatePlainText(description, 'Description');
      if (!descriptionValidation.isValid) {
        return fail({ error: descriptionValidation.error || 'Invalid description' }, 400);
      }
    }
    if (meta_title !== undefined) {
      const metaTitleValidation = validatePlainText(meta_title, 'Meta title');
      if (!metaTitleValidation.isValid) {
        return fail({ error: metaTitleValidation.error || 'Invalid meta title' }, 400);
      }
    }
    if (meta_description !== undefined) {
      const metaDescriptionValidation = validatePlainText(meta_description, 'Meta description');
      if (!metaDescriptionValidation.isValid) {
        return fail({ error: metaDescriptionValidation.error || 'Invalid meta description' }, 400);
      }
    }
    if (tags !== undefined) {
      const tagsValidation = validatePlainTextArray(tags, 'Tags');
      if (!tagsValidation.isValid) {
        return fail({ error: tagsValidation.error || 'Invalid tags' }, 400);
      }
    }
    if (status === 'scheduled') {
      const when = scheduled_for ? new Date(scheduled_for) : null;
      if (!when || Number.isNaN(when.getTime())) {
        return fail({ error: 'A scheduled article needs a publish date.' }, 400);
      }
      if (when.getTime() <= Date.now()) {
        return fail({ error: 'The publish date must be in the future.' }, 400);
      }
    }
    if (content_rich !== undefined) {
      // content_rich is rendered directly, so it must be validated on the way
      // in and not only when it is created.
      const contentRichValidation = validateTipTapContent(content_rich);
      if (!contentRichValidation.isValid) {
        return fail({ error: contentRichValidation.error || 'Invalid content format' }, 400);
      }
    }

    // Build update object (only include provided fields)
    const updateData: Database['public']['Tables']['articles']['Update'] = {};
    if (title !== undefined) {
      updateData.title = title;
    }
    if (slug !== undefined) {
      updateData.slug = normalizeSlug(slug);
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (category !== undefined) {
      updateData.category = category;
    }
    if (topic !== undefined) {
      updateData.topic = topic;
    }
    if (tags !== undefined) {
      updateData.tags = tags;
    }
    if (cover_image !== undefined) {
      updateData.cover_image = cover_image;
    }
    if (content_rich !== undefined) {
      updateData.content_rich = content_rich;
    }
    if (content_html !== undefined) {
      updateData.content_html = sanitizeHtmlContent(content_html).trim() || null;
    }
    if (meta_title !== undefined) {
      updateData.meta_title = meta_title;
    }
    if (meta_description !== undefined) {
      updateData.meta_description = meta_description;
    }
    if (is_featured !== undefined) {
      updateData.is_featured = is_featured;
    }
    if (score !== undefined) {
      updateData.score = score !== null ? Number(score) : null;
    }
    if (media_id !== undefined) {
      updateData.media_id = media_id !== null ? Number(media_id) : null;
    }

    // Handle status change
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'published' && !existingArticle.published_at) {
        updateData.published_at = new Date().toISOString();
      }
      // scheduled_for only means something while the article is scheduled, so
      // any other status clears it instead of leaving a stale date behind.
      if (status === 'scheduled') {
        updateData.scheduled_for = scheduled_for ?? null;
      } else {
        updateData.scheduled_for = null;
      }
    } else if (scheduled_for !== undefined && existingArticle.status === 'scheduled') {
      updateData.scheduled_for = scheduled_for;
    }

    // Snapshot the pre-edit state before overwriting it. Done here rather than
    // after the update so the revision is the version being replaced.
    await snapshotArticleRevision(
      supabase,
      existingArticle,
      session.user.id,
      title !== undefined ||
        description !== undefined ||
        content_rich !== undefined ||
        content_html !== undefined,
    );

    const { data: article, error: updateError } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', Number.parseInt(id, 10))
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating article:', updateError);
      return fail({ error: 'Article update failed' }, 500);
    }

    // Log activity
    await insertActivity(supabase, session.user.id, 'article_updated', {
      articleId: article.id,
      articleTitle: article.title,
      articleSlug: article.slug,
      changes: Object.keys(updateData),
      username: userData?.username,
      display_name: userData?.display_name,
      avatar_url: userData?.avatar_url,
    });

    await syncArticleMediaLinks(
      supabase,
      article.id,
      collectArticleMediaLinks({
        contentRich: article.content_rich,
        subjectMediaId: article.media_id,
      }),
    );

    // Revalidate article caches
    revalidateCache.article(article.id);

    return ok({ message: 'Article updated successfully', article });
  } catch (error) {
    console.error('Error updating article:', error);
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

// DELETE - Delete article
async function DELETEHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createRouteHandlerClient();

    const session = await requireAuth(supabase);

    // Get existing article
    const { data: existingArticle, error: fetchError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', Number.parseInt(id, 10))
      .single();

    if (fetchError || !existingArticle) {
      return fail({ error: 'Article not found' }, 404);
    }

    // Check permission (author or admin)
    const userData = await getUserFullInfo(supabase, session.user.id);

    const isAuthor = existingArticle.author_id === session.user.id;
    const isAdmin = hasAnyRole(userData, ['admin', 'owner', 'reviewer']);

    if (!isAuthor && !isAdmin) {
      return fail({ error: 'Access forbidden' }, 403);
    }

    // Delete article (cascade will handle likes, comments, views)
    const { error: deleteError } = await supabase
      .from('articles')
      .delete()
      .eq('id', Number.parseInt(id, 10));

    if (deleteError) {
      console.error('Error deleting article:', deleteError);
      return fail({ error: 'Article deletion failed' }, 500);
    }

    // Log activity
    await insertActivity(supabase, session.user.id, 'article_deleted', {
      articleId: existingArticle.id,
      articleTitle: existingArticle.title,
      articleSlug: existingArticle.slug,
      username: userData?.username,
      display_name: userData?.display_name,
      avatar_url: userData?.avatar_url,
    });

    // Revalidate article caches
    revalidateCache.article(existingArticle.id);

    return ok({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Error deleting article:', error);
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const GET = withApiRoute(GETHandler);
export const PUT = withApiRoute(PUTHandler);
export const DELETE = withApiRoute(DELETEHandler);
