import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeriesDatabase } from '@/lib/articles/seriesDatabase';
import { requireSeriesStudioAccess } from '@/lib/articles/seriesStudioAccess';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { PageContainer } from '@/app/components/layout';

export const dynamic = 'force-dynamic';
export default async function SeriesStudioPage() {
  const access = await requireSeriesStudioAccess();
  const db = (await createRouteHandlerClient()) as unknown as SupabaseClient<SeriesDatabase>;
  // RLS returns exactly the series this user may manage; the owner filter only
  // keeps an editor's list focused on their own work.
  let query = db
    .from('article_series')
    .select('id,title,status,owner_id')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (!access.canManageAll) {
    query = query.eq('owner_id', access.session.user.id);
  }
  const { data: series } = await query;
  const ids = (series ?? []).map(row => row.id);
  const { data: chapters } = ids.length
    ? await db.from('article_series_chapters').select('series_id').in('series_id', ids)
    : { data: [] };
  return (
    <PageContainer size="lg" className="space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Article series</h1>
        {access.canCreate && (
          <Link className="text-primary" href="/studio/series/new">
            Create series
          </Link>
        )}
      </div>
      <Link href="/studio" className="text-primary">
        ← Studio
      </Link>
      {!series?.length && <p className="text-muted-foreground">No series yet.</p>}
      <ul className="space-y-3">
        {series?.map(row => (
          <li key={row.id} className="rounded-xl border border-border bg-card p-4">
            <Link className="font-semibold text-primary" href={`/studio/series/${row.id}`}>
              {row.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {row.status} ·{' '}
              {(chapters ?? []).filter(chapter => chapter.series_id === row.id).length} chapters
            </p>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
