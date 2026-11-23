import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeriesDatabase } from '@/lib/articles/seriesDatabase';
import { requireStudioAccess } from '@/lib/articles/studioAccess';
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
  const access = await requireStudioAccess();
  const db = (await createRouteHandlerClient()) as unknown as SupabaseClient<SeriesDatabase>;
  const { data: series } = await db.from('article_series').select('*').eq('id', id).maybeSingle();
  if (!series || (!access.canManageAllContent && series.owner_id !== access.session.user.id)) {
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
  let query = db
    .from('articles')
    .select('id,title,status,author_id')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (!access.canManageAllContent) {
    query = query.eq('author_id', access.session.user.id);
  }
  const { data: rows } = await query;
  const articleIds = (rows ?? []).map(row => row.id);
  // Only reveal assignment state for articles already visible in the picker.
  const admin = getSupabaseServer() as unknown as SupabaseClient<SeriesDatabase>;
  const { data: assignments } = articleIds.length
    ? await admin
        .from('article_series_chapters')
        .select('series_id,article_id')
        .in('article_id', articleIds)
    : { data: [] };
  const assigned = new Map((assignments ?? []).map(row => [row.article_id, row.series_id]));
  const articles: SeriesEditorArticle[] = (rows ?? []).map(row => ({
    ...row,
    status: row.status ?? 'draft',
    assignedElsewhere: assigned.has(row.id) && assigned.get(row.id) !== id,
  }));
  const initial: SeriesEditorInitial = {
    ...series,
    translation: translation ?? null,
    chapterIds: (chapters ?? []).map(row => row.article_id),
  };
  return <SeriesEditor initial={initial} articles={articles} />;
}
