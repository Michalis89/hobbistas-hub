import { withApiRoute } from '@/lib/observability/withApiRoute';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { sanitizeHtmlContent } from '@/utils/security/sanitizeHtml';
import { validatePlainText } from '@/utils/validation/text';
import { validateTipTapContent } from '@/utils/validation/tiptap';
import { API_ERRORS } from '@/lib/api/errors';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { fail, ok } from '@/lib/api/response';
import { revalidateCache } from '@/lib/cache/tags';
import { hasAnyRole } from '@/lib/roles';
import { getUserFullInfo } from '@/lib/services/userService';
import { isArticleLocale, SOURCE_ARTICLE_LOCALE } from '@/lib/articles/locales';

const TRANSLATION_FIELDS =
  'article_id, locale, title, description, content_rich, content_html, meta_title, meta_description, updated_at';

/** Author of the piece, or an editorial role. Mirrors PUT /api/articles/[id]. */
async function assertCanEditArticle(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  articleId: number,
  userId: string,
) {
  const { data: article, error } = await supabase
    .from('articles')
    .select('id, author_id')
    .eq('id', articleId)
    .single();

  if (error || !article) {
    return { error: fail({ error: 'Article not found' }, 404) };
  }

  const userData = await getUserFullInfo(supabase, userId);
  const isAuthor = article.author_id === userId;
  const isEditor = hasAnyRole(userData, ['admin', 'owner', 'reviewer']);

  if (!isAuthor && !isEditor) {
    return { error: fail({ error: 'Access forbidden' }, 403) };
  }

  return { error: null };
}

function parseArticleId(raw: string) {
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

// GET - every translation for one article, for the studio editor
async function GETHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const articleId = parseArticleId(id);
    if (articleId === null) {
      return fail({ error: 'Invalid article id' }, 400);
    }

    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);

    const guard = await assertCanEditArticle(supabase, articleId, session.user.id);
    if (guard.error) {
      return guard.error;
    }

    const { data, error } = await supabase
      .from('article_translations')
      .select(TRANSLATION_FIELDS)
      .eq('article_id', articleId);

    if (error) {
      console.error('Error loading translations:', error);
      return fail({ error: 'Could not load translations' }, 500);
    }

    return ok({ translations: data ?? [] });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.error('Error loading translations:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

// PUT - create or replace one locale's translation
async function PUTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const articleId = parseArticleId(id);
    if (articleId === null) {
      return fail({ error: 'Invalid article id' }, 400);
    }

    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);

    const guard = await assertCanEditArticle(supabase, articleId, session.user.id);
    if (guard.error) {
      return guard.error;
    }

    const body = await req.json().catch(() => null);
    const locale = body?.locale;

    if (!isArticleLocale(locale)) {
      return fail({ error: 'Unsupported language' }, 400);
    }
    if (locale === SOURCE_ARTICLE_LOCALE) {
      // English lives on the article row. Accepting it here would create a
      // second copy that silently shadows the real one.
      return fail(
        { error: 'The source language is edited on the article itself, not as a translation.' },
        400,
      );
    }

    const { title, description, content_rich, content_html, meta_title, meta_description } =
      body ?? {};

    const titleValidation = validatePlainText(title, 'Title');
    if (!titleValidation.isValid) {
      return fail({ error: titleValidation.error || 'Invalid title' }, 400);
    }
    if (typeof title !== 'string' || title.trim() === '') {
      return fail({ error: 'A translation needs a title.' }, 400);
    }
    if (description !== undefined && description !== null) {
      const descriptionValidation = validatePlainText(description, 'Description');
      if (!descriptionValidation.isValid) {
        return fail({ error: descriptionValidation.error || 'Invalid description' }, 400);
      }
    }
    if (meta_title !== undefined && meta_title !== null) {
      const metaTitleValidation = validatePlainText(meta_title, 'Meta title');
      if (!metaTitleValidation.isValid) {
        return fail({ error: metaTitleValidation.error || 'Invalid meta title' }, 400);
      }
    }
    if (meta_description !== undefined && meta_description !== null) {
      const metaDescriptionValidation = validatePlainText(meta_description, 'Meta description');
      if (!metaDescriptionValidation.isValid) {
        return fail({ error: metaDescriptionValidation.error || 'Invalid meta description' }, 400);
      }
    }
    if (content_rich !== undefined && content_rich !== null) {
      // Same gate as the article body: `content_rich` is rendered directly.
      const contentValidation = validateTipTapContent(content_rich);
      if (!contentValidation.isValid) {
        return fail({ error: contentValidation.error || 'Invalid content format' }, 400);
      }
    }

    const emptyToNull = (value: unknown) =>
      typeof value === 'string' && value.trim() !== '' ? value : null;

    const payload = {
      article_id: articleId,
      locale,
      title: title.trim(),
      description: emptyToNull(description),
      content_rich: content_rich ?? null,
      content_html: sanitizeHtmlContent(content_html ?? '').trim() || null,
      meta_title: emptyToNull(meta_title),
      meta_description: emptyToNull(meta_description),
    };

    const { data, error } = await supabase
      .from('article_translations')
      .upsert(payload, { onConflict: 'article_id,locale' })
      .select(TRANSLATION_FIELDS)
      .single();

    if (error) {
      console.error('Error saving translation:', error);
      return fail({ error: 'Could not save the translation' }, 500);
    }

    revalidateCache.article(articleId);

    return ok({ message: 'Translation saved', translation: data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.error('Error saving translation:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

// DELETE - remove one locale, taking it out of the reader's switcher
async function DELETEHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const articleId = parseArticleId(id);
    if (articleId === null) {
      return fail({ error: 'Invalid article id' }, 400);
    }

    const locale = new URL(req.url).searchParams.get('locale');
    if (!isArticleLocale(locale) || locale === SOURCE_ARTICLE_LOCALE) {
      return fail({ error: 'Unsupported language' }, 400);
    }

    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);

    const guard = await assertCanEditArticle(supabase, articleId, session.user.id);
    if (guard.error) {
      return guard.error;
    }

    const { error } = await supabase
      .from('article_translations')
      .delete()
      .eq('article_id', articleId)
      .eq('locale', locale);

    if (error) {
      console.error('Error deleting translation:', error);
      return fail({ error: 'Could not delete the translation' }, 500);
    }

    revalidateCache.article(articleId);

    return ok({ message: 'Translation removed' });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.error('Error deleting translation:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const GET = withApiRoute(GETHandler);
export const PUT = withApiRoute(PUTHandler);
export const DELETE = withApiRoute(DELETEHandler);
