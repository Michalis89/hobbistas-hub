// Server Component — no 'use client'
import type { PersonalStats } from './types';
import { DASHBOARD_TAB_CATEGORIES } from '@/lib/dashboard/category-data';
import type { CategoryDashboardSection, DashboardCategoryKey } from '@/lib/dashboard/category-data';
import CategoryDashboardTabs from '@/app/components/dashboard/CategoryDashboardTabs';
import DashboardEmptyState from '@/app/components/dashboard/DashboardEmptyState';
import UnifiedOverviewRow from '@/app/components/dashboard/UnifiedOverviewRow';
import type {
  UnifiedOverviewCategory,
  UnifiedOverviewInput,
} from '@/lib/dashboard/unified-overview';

type HomeDashboardSectionsProps = {
  mediaCategories: DashboardCategoryKey[];
  categorySections: Record<DashboardCategoryKey, CategoryDashboardSection>;
  stats: PersonalStats;
  categoryProfile?: Record<string, unknown> | null;
  isReadOnly?: boolean;
};

function resolveStatsForCategory(stats: PersonalStats, category: DashboardCategoryKey) {
  if (category === 'games') {
    return stats.games;
  }
  if (category === 'anime') {
    return stats.anime;
  }
  if (category === 'manga') {
    return stats.manga;
  }
  if (category === 'movies') {
    return stats.movies;
  }
  if (category === 'tv') {
    return stats.tv;
  }
  return stats.books;
}

function buildUnifiedOverviewCategories(
  mediaCategories: DashboardCategoryKey[],
  categorySections: Record<DashboardCategoryKey, CategoryDashboardSection>,
  stats: PersonalStats,
): UnifiedOverviewCategory[] {
  return DASHBOARD_TAB_CATEGORIES.map(category => {
    const categoryStats = resolveStatsForCategory(stats, category);
    const recentlyFinished = Math.max(
      0,
      categorySections[category]?.insights?.updatedLast7Days ?? 0,
    );
    return {
      key: category,
      enabled: mediaCategories.includes(category),
      inProgress: categoryStats.in_progress ?? 0,
      completed: categoryStats.completed ?? 0,
      recentlyFinished,
    };
  });
}

export function HomeDashboardSections({
  mediaCategories,
  categorySections,
  stats,
  categoryProfile = null,
  isReadOnly = false,
}: HomeDashboardSectionsProps) {
  const overviewCategories = buildUnifiedOverviewCategories(
    mediaCategories,
    categorySections,
    stats,
  );

  const overviewData: UnifiedOverviewInput = {
    categories: overviewCategories,
    totalMinutes: Math.max(0, (stats.total_hours ?? 0) * 60),
    hasFullTimeCoverage: true,
  };

  // Every counter, chart, and taste profile below is derived from the user's own
  // entries. With none, the whole apparatus renders as zeros and "No data yet",
  // which looks broken instead of new — so show a first-run panel instead.
  const hasAnyEntries = mediaCategories.some(
    category => (resolveStatsForCategory(stats, category)?.total ?? 0) > 0,
  );

  if (mediaCategories.length > 0 && !hasAnyEntries && !isReadOnly) {
    return <DashboardEmptyState categories={mediaCategories} />;
  }

  return (
    <>
      {mediaCategories.length > 0 && (
        <section className="mt-10 md:mt-12">
          <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-6">
            <UnifiedOverviewRow data={overviewData} />
            <CategoryDashboardTabs
              enabledCategories={mediaCategories}
              sections={categorySections}
              stats={stats}
              categoryProfile={categoryProfile}
              isReadOnly={isReadOnly}
            />
          </div>
        </section>
      )}
    </>
  );
}
