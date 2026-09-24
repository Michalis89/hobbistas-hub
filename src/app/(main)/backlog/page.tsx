import type { Metadata } from 'next';
import { Suspense } from 'react';
import BacklogPageClient from '@/app/(main)/backlog/BacklogPageClient';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import { getCategoryBySlug } from '@/config/hobbies';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_URL } from '@/config/site';
import { requireServerAuth } from '@/lib/auth/requireServerAuth';
import { Skeleton } from '@/components/ui/skeleton';

export const revalidate = 300;

function BacklogPageShellSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6 md:px-6 md:py-8">
      <Skeleton className="h-9 w-48" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    </div>
  );
}

type BacklogPageProps = {
  searchParams: Promise<{ category?: string }>;
};

export async function generateMetadata({ searchParams }: BacklogPageProps): Promise<Metadata> {
  const { category } = await searchParams;
  const normalizedCategory = category?.toLowerCase();
  const categoryData = normalizedCategory ? getCategoryBySlug(normalizedCategory) : undefined;
  const categoryLabel = categoryData?.title;

  const title = categoryLabel
    ? `Backlog for ${categoryLabel} | Hobbistas`
    : 'Backlog & Progress | Hobbistas';

  const description = categoryLabel
    ? `Organize your ${categoryLabel} backlog with goals, notes, and progress tracking.`
    : 'Organize your backlog with goals, progress tracking, and per-hobby insights.';

  // Canonical strategy: treat category query pages as first-class and keep their querystring.
  const path = normalizedCategory ? `/backlog?category=${normalizedCategory}` : '/backlog';

  return buildMetadata({
    title,
    description,
    path,
    // Behind `requireServerAuth`: a crawler only ever sees the redirect to
    // login, and the `?category=` variants would otherwise read as a set of
    // near-duplicate indexable URLs.
    noindex: true,
  });
}

export default async function BacklogPage({ searchParams }: BacklogPageProps) {
  const { category } = await searchParams;
  const normalizedCategory = category?.toLowerCase();
  const categoryData = normalizedCategory ? getCategoryBySlug(normalizedCategory) : undefined;
  const categoryLabel = categoryData?.title;
  const breadcrumb = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Backlog', url: `${SITE_URL}/backlog` },
  ];

  if (categoryLabel) {
    breadcrumb.push({
      name: categoryLabel,
      url: `${SITE_URL}/backlog?category=${normalizedCategory}`,
    });
  }

  const redirectPath = normalizedCategory ? `/backlog?category=${normalizedCategory}` : '/backlog';
  await requireServerAuth(redirectPath);

  return (
    <>
      <StructuredData data={getBreadcrumbStructuredData(breadcrumb)} />
      <Suspense fallback={<BacklogPageShellSkeleton />}>
        <BacklogPageClient />
      </Suspense>
    </>
  );
}
