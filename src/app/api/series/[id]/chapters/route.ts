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

async function put(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await params).id);
    const { db, userId, elevated } = await editorContext();
    if (!id || !(await managedSeries(db, id, userId, elevated))) {
      return privateResponse(fail({ error: 'Series not found' }, 404));
    }
    const body = await request.json().catch(() => null);
    if (
      !Number.isSafeInteger(body?.version) ||
      body.version < 0 ||
      !Array.isArray(body?.article_ids) ||
      body.article_ids.length > 500 ||
      body.article_ids.some((item: unknown) => !Number.isSafeInteger(item) || Number(item) < 1) ||
      new Set(body.article_ids).size !== body.article_ids.length
    ) {
      return privateResponse(fail({ error: 'Invalid chapter list or version' }, 400));
    }
    const { data, error } = await db.rpc('replace_series_chapters', {
      p_series_id: id,
      p_version: body.version,
      p_article_ids: body.article_ids,
    });
    if (error) {
      const status = ['40001', '23505'].includes(error.code)
        ? 409
        : error.code === '42501'
          ? 403
          : 400;
      return privateResponse(
        fail(
          {
            error:
              status === 409
                ? 'Series changed or a chapter belongs to another series. Reload and try again.'
                : 'Unable to save chapters',
          },
          status,
        ),
      );
    }
    revalidateCache.article();
    return privateResponse(ok({ version: data }));
  } catch (error) {
    return errorResponse(error);
  }
}
export const PUT = withApiRoute(put);
