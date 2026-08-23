import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import HomeDashboardContent from '@/app/components/home/HomeDashboardContent';
import { HomeDashboardSections } from '@/app/components/home/HomeDashboardSections';
import { fetchUserStats, fetchContinueData } from '@/lib/dashboard/server-data';
import { PageContainer } from '@/app/components/layout';
import type { CategoryDashboardSection, DashboardCategoryKey } from '@/lib/dashboard/category-data';
import {
  DASHBOARD_TAB_CATEGORIES,
  fetchCategoryDashboardData,
} from '@/lib/dashboard/category-data';
import type { PersonalStats } from '@/app/components/home/types';
import { instrumentOwnDashboardSuggestions } from '@/lib/recommendations/instrumentation/dashboard';

type DashboardBasePayload = {
  userId: string;
  username: string;
  displayName: string | null;
  stats: PersonalStats;
  continueData: Awaited<ReturnType<typeof fetchContinueData>>;
  mediaCategories: DashboardCategoryKey[];
};

export function DashboardContentSkeleton() {
  return (
    <div className="min-h-[80vh] pb-14 pt-2 md:pb-16 md:pt-3">
      <section className="px-4 pb-8 pt-12 md:px-6 md:pb-8 md:pt-16">
        <div className="mx-auto max-w-screen-2xl">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-10 w-72 rounded bg-muted/80" />
            <div className="h-4 w-96 max-w-full rounded bg-muted" />
          </div>
        </div>
      </section>

      <section className="px-4 py-8 md:px-6 md:py-10">
        <div className="mx-auto max-w-screen-2xl">
          <div className="min-h-[304px] animate-pulse p-6 md:p-8">
            <div className="grid min-h-[260px] items-center gap-7 md:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
              <div className="space-y-4">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-8 w-3/4 rounded bg-muted/80" />
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="flex gap-3 pt-4">
                  <div className="h-11 w-28 rounded-full bg-muted" />
                  <div className="h-11 w-44 rounded-full bg-muted" />
                </div>
              </div>
              <div className="aspect-[4/5] w-full rounded-2xl bg-muted md:w-[340px]" />
            </div>
          </div>
        </div>
      </section>

      <PageContainer size="lg">
        <div className="grid gap-3.5 md:grid-cols-4 md:gap-4">
          <div className="h-24 animate-pulse bg-muted" />
          <div className="h-24 animate-pulse bg-muted" />
          <div className="h-24 animate-pulse bg-muted" />
          <div className="h-24 animate-pulse bg-muted" />
        </div>
      </PageContainer>
    </div>
  );
}

export function DashboardSectionsSkeleton() {
  return (
    <>
      <section className="mt-12 px-4 md:mt-14 md:px-6">
        <div className="mx-auto max-w-screen-2xl animate-pulse space-y-4">
          <div className="h-10 w-full rounded-xl bg-muted/70" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-64 rounded-2xl bg-muted/55" />
            <div className="h-64 rounded-2xl bg-muted/55" />
          </div>
        </div>
      </section>

      <PageContainer size="lg">
        <div className="mx-auto mt-12 max-w-screen-2xl animate-pulse space-y-4 px-4 md:mt-14 md:px-6">
          <div className="h-[1px] w-full bg-muted/60" />
          <div className="h-10 w-56 rounded-full bg-muted/70" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="h-72 rounded-2xl bg-muted/50" />
            <div className="h-72 rounded-2xl bg-muted/50" />
            <div className="h-72 rounded-2xl bg-muted/50" />
            <div className="h-72 rounded-2xl bg-muted/50" />
          </div>
        </div>
      </PageContainer>
    </>
  );
}

export async function DashboardSectionsData({
  supabase,
  userId,
  mediaCategories,
  stats,
  categoryProfile,
}: {
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>;
  userId: string;
  mediaCategories: DashboardCategoryKey[];
  stats: PersonalStats;
  categoryProfile: Record<string, unknown> | null;
}) {
  if (mediaCategories.length === 0) {
    return null;
  }

  const categorySections: Record<DashboardCategoryKey, CategoryDashboardSection> =
    await instrumentOwnDashboardSuggestions(
      supabase,
      userId,
      await fetchCategoryDashboardData(supabase, userId, mediaCategories),
    );

  return (
    <HomeDashboardSections
      mediaCategories={mediaCategories}
      categorySections={categorySections}
      stats={stats}
      categoryProfile={categoryProfile}
    />
  );
}

export async function DashboardData() {
  const supabase = await createRouteHandlerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login');
  }

  const userId = session.user.id;
  const username = session.user.user_metadata?.username ?? 'User';
  const displayName = session.user.user_metadata?.display_name ?? null;

  type CategoryProfileRow = { profiles?: unknown } | null;
  const categoryProfilePromise =
    typeof (supabase as { from?: unknown }).from === 'function'
      ? supabase
          .from('user_category_profiles')
          .select('profiles')
          .eq('user_id', userId)
          .maybeSingle()
          .then(result => result.data as CategoryProfileRow)
      : Promise.resolve<CategoryProfileRow>(null);

  const [stats, continueData, categoryProfileData] = await Promise.all([
    fetchUserStats(supabase, userId),
    fetchContinueData(supabase, userId),
    categoryProfilePromise,
  ]);
  const categoryProfile =
    categoryProfileData?.profiles && typeof categoryProfileData.profiles === 'object'
      ? (categoryProfileData.profiles as Record<string, unknown>)
      : null;

  const requestedCategories = (continueData.enabledCategories ?? []).filter(
    (category): category is DashboardCategoryKey =>
      DASHBOARD_TAB_CATEGORIES.includes(category as DashboardCategoryKey),
  );
  const fallbackCategories = (stats.active_categories ?? []).filter(
    (category): category is DashboardCategoryKey =>
      DASHBOARD_TAB_CATEGORIES.includes(category as DashboardCategoryKey),
  );
  const mediaCategories = requestedCategories.length > 0 ? requestedCategories : fallbackCategories;

  const payload: DashboardBasePayload = {
    userId,
    username,
    displayName,
    stats,
    continueData,
    mediaCategories,
  };

  return (
    <>
      <HomeDashboardContent
        username={payload.username}
        displayName={payload.displayName}
        stats={payload.stats}
        continueData={payload.continueData}
        mediaCategories={payload.mediaCategories}
      />
      <Suspense fallback={<DashboardSectionsSkeleton />}>
        <DashboardSectionsData
          supabase={supabase}
          userId={payload.userId}
          mediaCategories={payload.mediaCategories}
          stats={payload.stats}
          categoryProfile={categoryProfile}
        />
      </Suspense>
    </>
  );
}
