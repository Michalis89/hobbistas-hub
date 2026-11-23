import { requireStudioAccess } from '@/lib/articles/studioAccess';
import SeriesEditor from '@/app/components/studio/SeriesEditor.client';
import { redirect } from 'next/navigation';

export default async function NewSeriesPage() {
  const access = await requireStudioAccess();
  if (!access.canWriteArticles && !access.canWriteReviews) {
    redirect('/studio/series');
  }
  return <SeriesEditor initial={null} articles={[]} />;
}
