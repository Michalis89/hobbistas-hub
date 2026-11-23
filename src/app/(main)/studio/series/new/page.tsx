import { requireSeriesStudioAccess } from '@/lib/articles/seriesStudioAccess';
import SeriesEditor from '@/app/components/studio/SeriesEditor.client';
import { redirect } from 'next/navigation';

export default async function NewSeriesPage() {
  const access = await requireSeriesStudioAccess();
  if (!access.canCreate) {
    redirect('/studio/series');
  }
  return <SeriesEditor initial={null} articles={[]} />;
}
