import { notFound } from 'next/navigation';
import { requireSeriesStudioAccess } from '@/lib/articles/seriesStudioAccess';
import { canManageSeries } from '@/lib/articles/seriesAccess';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import getSupabaseServer from '@/lib/supabase-server';
import SeriesEditor, {
  type SeriesEditorArticle,
  type SeriesEditorInitial,
} from '@/app/components/studio/SeriesEditor.client';

export const dynamic = 'force-dynamic';
export default async function EditSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    notFound();
  }
  const access = await requireSeriesStudioAccess();
  const userId = access.session.user.id;
  const db = await createRouteHandlerClient();
  const { data: series } = await db.from('article_series').select('*').eq('id', id).maybeSingle();
  if (!series || !canManageSeries({ roles: access.roles }, userId, series)) {
    notFound();
  }
  const [{ data: chapters }, { data: translation }] = await Promise.all([
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
  const chapterIds = (chapters ?? []).map(row => row.article_id);

  // The picker: every article for those who manage all series, otherwise the
  // editor's own articles.
  let query = db
    .from('articles')
    .select('id,title,status,author_id')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (!access.canManageAll) {
    query = query.eq('author_id', userId);
  }
  const { data: rows } = await query;

  const admin = getSupabaseServer();
  // This user manages the series, so the titles of its current chapters may be
  // shown even when another author wrote them (they are not in the picker).
  const pickerIds = new Set((rows ?? []).map(row => row.id));
  const missingChapterIds = chapterIds.filter(chapterId => !pickerIds.has(chapterId));
  const { data: chapterRows } = missingChapterIds.length
    ? await admin.from('articles').select('id,title,status,author_id').in('id', missingChapterIds)
    : { data: [] };

  const allRows = [...(rows ?? []), ...(chapterRows ?? [])];
  const articleIds = allRows.map(row => row.id);
  // Only reveal assignment state for articles already visible here.
  const { data: assignments } = articleIds.length
    ? await admin
        .from('article_series_chapters')
        .select('series_id,article_id')
        .in('article_id', articleIds)
    : { data: [] };
  const assigned = new Map((assignments ?? []).map(row => [row.article_id, row.series_id]));
  const articles: SeriesEditorArticle[] = allRows.map(row => ({
    id: row.id,
    title: row.title || 'Untitled draft',
    status: row.status ?? 'draft',
    author_id: row.author_id,
    assignedElsewhere: assigned.has(row.id) && assigned.get(row.id) !== id,
    // Mirrors replace_series_chapters: only those who manage all series may
    // remove or reorder another author's chapters.
    locked: !access.canManageAll && row.author_id !== userId,
  }));
  const initial: SeriesEditorInitial = {
    ...series,
    // The column is text with a CHECK constraint; the generated type is string.
    status: series.status === 'published' ? 'published' : 'draft',
    translation: translation ?? null,
    chapterIds,
  };
  return <SeriesEditor initial={initial} articles={articles} />;
}
