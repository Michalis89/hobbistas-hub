import { withApiRoute } from '@/lib/observability/withApiRoute';
import {
  editorContext,
  errorResponse,
  managedSeries,
  parseId,
  privateResponse,
} from '@/lib/articles/seriesEditor';
import { ok, fail } from '@/lib/api/response';
import { revalidateCache } from '@/lib/cache/tags';
import { validatePlainText } from '@/utils/validation/text';

type Context = { params: Promise<{ id: string }> };
async function access(context: Context) {
  const id = parseId((await context.params).id);
  const editor = await editorContext();
  const series = id ? await managedSeries(editor.db, id, editor.userId, editor.elevated) : null;
  return { ...editor, id, series };
}
async function get(_request: Request, context: Context) {
  try {
    const { db, id, series } = await access(context);
    if (!id || !series) {
      return privateResponse(fail({ error: 'Series not found' }, 404));
    }
    const [{ data: chapters, error }, { data: translation }] = await Promise.all([
      db
        .from('article_series_chapters')
        .select('article_id,position')
        .eq('series_id', id)
        .order('position'),
      db
        .from('article_series_translations')
        .select('title,description')
        .eq('series_id', id)
        .eq('locale', 'el')
        .maybeSingle(),
    ]);
    if (error) {
      return privateResponse(fail({ error: 'Could not load chapters' }, 500));
    }
    return privateResponse(ok({ series, chapters: chapters ?? [], translation }));
  } catch (error) {
    return errorResponse(error);
  }
}
async function put(request: Request, context: Context) {
  try {
    const { db, id, series } = await access(context);
    if (!id || !series) {
      return privateResponse(fail({ error: 'Series not found' }, 404));
    }
    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : null;
    const cover = typeof body?.cover_image === 'string' ? body.cover_image.trim() : null;
    if (
      !title ||
      title.length > 200 ||
      !['draft', 'published'].includes(body?.status) ||
      (description && description.length > 2000) ||
      !validatePlainText(title, 'Title').isValid ||
      !validatePlainText(description, 'Description').isValid ||
      (cover && !/^https?:\/\//i.test(cover))
    ) {
      return privateResponse(fail({ error: 'Invalid series fields' }, 400));
    }
    const { data, error } = await db
      .from('article_series')
      .update({
        title,
        description,
        cover_image: cover || null,
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      return privateResponse(fail({ error: 'Unable to update series' }, 403));
    }
    revalidateCache.article();
    return privateResponse(ok(data));
  } catch (error) {
    return errorResponse(error);
  }
}
async function del(_request: Request, context: Context) {
  try {
    const { db, id, series } = await access(context);
    if (!id || !series) {
      return privateResponse(fail({ error: 'Series not found' }, 404));
    }
    const { error } = await db.from('article_series').delete().eq('id', id);
    if (error) {
      return privateResponse(fail({ error: 'Unable to delete series' }, 403));
    }
    revalidateCache.article();
    return privateResponse(ok({ deleted: true }));
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = withApiRoute(get);
export const PUT = withApiRoute(put);
export const DELETE = withApiRoute(del);
