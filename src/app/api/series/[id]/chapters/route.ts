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

const MESSAGES: Record<number, string> = {
  400: 'Invalid chapter list',
  403: 'You can only add, remove or reorder your own articles in this series.',
  404: 'Series not found',
  409: 'This series changed, or a chapter belongs to another series. Reload and try again.',
  500: 'Unable to save chapters',
};

async function put(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await params).id);
    const { db, user, userId } = await editorContext();
    if (!id || !(await managedSeries(db, id, user, userId))) {
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
      const status = seriesWriteStatus(error.code);
      return privateResponse(fail({ error: MESSAGES[status] }, status));
    }
    revalidateCache.article();
    return privateResponse(ok({ version: data }));
  } catch (error) {
    return errorResponse(error);
  }
}
export const PUT = withApiRoute(put);
