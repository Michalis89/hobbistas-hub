import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeriesDatabase } from '@/lib/articles/seriesDatabase';
import { withApiRoute } from '@/lib/observability/withApiRoute';
import {
  editorContext,
  errorResponse,
  managedSeries,
  parseId,
  privateResponse,
  seriesWriteStatus,
} from '@/lib/articles/seriesEditor';
import { ok, fail } from '@/lib/api/response';
import { revalidateCache } from '@/lib/cache/tags';
import { validatePlainText } from '@/utils/validation/text';

/** Keeps the sitemap's lastmod honest when only the translation changed. */
async function touchSeries(db: SupabaseClient<SeriesDatabase>, id: number) {
  await db.from('article_series').update({ updated_at: new Date().toISOString() }).eq('id', id);
}

async function put(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await params).id);
    const { db, user, userId } = await editorContext();
    if (!id || !(await managedSeries(db, id, user, userId))) {
      return privateResponse(fail({ error: 'Series not found' }, 404));
    }
    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : null;
    if (
      !title ||
      title.length > 200 ||
      (description && description.length > 2000) ||
      !validatePlainText(title, 'Title').isValid ||
      !validatePlainText(description, 'Description').isValid
    ) {
      return privateResponse(fail({ error: 'Invalid translation' }, 400));
    }
    const { error } = await db
      .from('article_series_translations')
      .upsert({ series_id: id, locale: 'el', title, description });
    if (error) {
      return privateResponse(
        fail({ error: 'Unable to save translation' }, seriesWriteStatus(error.code)),
      );
    }
    await touchSeries(db, id);
    revalidateCache.article();
    return privateResponse(ok({ saved: true }));
  } catch (error) {
    return errorResponse(error);
  }
}
export const PUT = withApiRoute(put);

async function del(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await params).id);
    const { db, user, userId } = await editorContext();
    if (!id || !(await managedSeries(db, id, user, userId))) {
      return privateResponse(fail({ error: 'Series not found' }, 404));
    }
    const { error } = await db
      .from('article_series_translations')
      .delete()
      .eq('series_id', id)
      .eq('locale', 'el');
    if (error) {
      return privateResponse(
        fail({ error: 'Unable to delete translation' }, seriesWriteStatus(error.code)),
      );
    }
    await touchSeries(db, id);
    revalidateCache.article();
    return privateResponse(ok({ deleted: true }));
  } catch (error) {
    return errorResponse(error);
  }
}
export const DELETE = withApiRoute(del);
