import { withApiRoute } from '@/lib/observability/withApiRoute';
import {
  editorContext,
  errorResponse,
  isValidCoverUrl,
  privateResponse,
  seriesWriteStatus,
} from '@/lib/articles/seriesEditor';
import { ok, fail } from '@/lib/api/response';
import { validatePlainText } from '@/utils/validation/text';

async function post(request: Request) {
  try {
    const { db, userId, canCreate } = await editorContext();
    if (!canCreate) {
      return privateResponse(fail({ error: 'Forbidden' }, 403));
    }
    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : null;
    const cover = typeof body?.cover_image === 'string' ? body.cover_image.trim() || null : null;
    if (
      !title ||
      title.length > 200 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 200 ||
      (description && description.length > 2000) ||
      !validatePlainText(title, 'Title').isValid ||
      !validatePlainText(description, 'Description').isValid ||
      !isValidCoverUrl(cover)
    ) {
      return privateResponse(fail({ error: 'Invalid series fields' }, 400));
    }
    const { data, error } = await db
      .from('article_series')
      .insert({
        title,
        slug,
        description,
        cover_image: cover,
        owner_id: userId,
        status: 'draft',
      })
      .select()
      .single();
    if (error) {
      const status = seriesWriteStatus(error.code);
      return privateResponse(
        fail(
          { error: status === 409 ? 'Slug already exists' : 'Unable to create series' },
          status === 500 ? 403 : status,
        ),
      );
    }
    return privateResponse(ok(data, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
export const POST = withApiRoute(post);
