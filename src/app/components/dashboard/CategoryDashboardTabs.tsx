'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DASHBOARD_TAB_CATEGORIES } from '@/lib/dashboard/category-data';
import type { CategoryDashboardSection, DashboardCategoryKey } from '@/lib/dashboard/category-data';
import type { PersonalStats } from '@/app/components/home/types';
import CategorySuggestions from './CategorySuggestions';
import MediaSuggestions from './MediaSuggestions';
import DashboardCategoryStats from './DashboardCategoryStats';

const CategoryTopFive = dynamic(() => import('./CategoryTopFive'), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full rounded-2xl" />,
});

const CategoryInsightsGrid = dynamic(() => import('./CategoryInsightsGrid'), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full rounded-2xl" />,
});

const AiGamingIdentitySection = dynamic(() => import('./AiGamingIdentitySection'), {
  ssr: false,
});

const CATEGORY_TITLES: Record<DashboardCategoryKey, string> = {
  games: 'Games',
  books: 'Books',
  anime: 'Anime',
  manga: 'Manga',
  movies: 'Movies',
  tv: 'TV',
};

type CategoryDashboardTabsProps = {
  enabledCategories: DashboardCategoryKey[];
  sections: Record<DashboardCategoryKey, CategoryDashboardSection>;
  stats: PersonalStats;
  categoryProfile?: Record<string, unknown> | null;
  isReadOnly?: boolean;
};

export default function CategoryDashboardTabs({
  enabledCategories,
  sections,
  stats,
  categoryProfile = null,
  isReadOnly = false,
}: CategoryDashboardTabsProps) {
  const visibleCategories = DASHBOARD_TAB_CATEGORIES.filter(category =>
    enabledCategories.includes(category),
  );
  const firstCategory = useMemo(() => visibleCategories[0], [visibleCategories]);
  const [selectedCategory, setSelectedCategory] = useState<DashboardCategoryKey | undefined>(
    firstCategory,
  );
  const activeCategory = useMemo(() => {
    if (!visibleCategories.length) {
      return undefined;
    }

    if (selectedCategory && visibleCategories.includes(selectedCategory)) {
      return selectedCategory;
    }

    return visibleCategories[0];
  }, [selectedCategory, visibleCategories]);

  if (!visibleCategories.length) {
    return null;
  }

  const resolveStatsForCategory = (category: DashboardCategoryKey) => {
    const categoryStats =
      category === 'games'
        ? stats.games
        : category === 'anime'
          ? stats.anime
          : category === 'manga'
            ? stats.manga
            : category === 'movies'
              ? stats.movies
              : category === 'tv'
                ? stats.tv
                : stats.books;

    const total = categoryStats.total ?? 0;
    const completed = categoryStats.completed ?? 0;
    const current = categoryStats.in_progress ?? 0;
    const dropped = categoryStats.dropped ?? 0;
    const hours = categoryStats.hours ?? 0;
    const planned = Math.max(0, total - completed - current - dropped);
    const favorites = sections[category]?.favoritesCount ?? 0;

    return { total, completed, current, planned, dropped, favorites, hours };
  };

  return (
    <Tabs
      value={activeCategory}
      onValueChange={value => setSelectedCategory(value as DashboardCategoryKey)}
      className="min-w-0 space-y-8 overflow-x-hidden md:space-y-10"
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex sm:justify-center sm:px-0">
        <TabsList className="inline-flex h-auto min-w-max items-center justify-start gap-1 rounded-2xl border border-black/10 bg-card/80 p-1 shadow-sm dark:border-white/10 sm:min-w-0 sm:flex-wrap sm:justify-center">
          {visibleCategories.map(category => (
            <TabsTrigger
              key={category}
              value={category}
              className="h-9 shrink-0 whitespace-nowrap rounded-xl border border-transparent px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75 transition-colors data-[state=active]:border-black/10 data-[state=active]:bg-card/90 data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-white/10"
            >
              {CATEGORY_TITLES[category]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="min-w-0 space-y-8 md:space-y-10">
        {visibleCategories.map(category => (
          <TabsContent key={category} value={category} className="mt-0">
            <div className="flex flex-col">
              <DashboardCategoryStats
                category={category}
                stats={resolveStatsForCategory(category)}
              />
              <div className="mt-9 md:mt-11">
                <CategoryTopFive
                  category={category}
                  items={sections[category]?.topFive ?? []}
                  favorites={sections[category]?.favorites ?? []}
                  isReadOnly={isReadOnly}
                />
              </div>
              <div className="mt-9 md:mt-11">
                <CategorySuggestions
                  category={category}
                  items={sections[category]?.tasteProfileItems ?? []}
                  categoryNote={
                    sections[category]?.recommenderTasteProfile ??
                    (categoryProfile && typeof categoryProfile[category] === 'object'
                      ? (categoryProfile[category] as Record<string, unknown>)
                      : null)
                  }
                />
              </div>
              {category === 'games' && !isReadOnly ? (
                <div className="mt-9 md:mt-11">
                  <AiGamingIdentitySection />
                </div>
              ) : null}
              <div className="mt-11 md:mt-14">
                <MediaSuggestions
                  suggestions={sections[category]?.mediaSuggestions ?? []}
                  category={CATEGORY_TITLES[category]}
                  hideWhenEmpty={isReadOnly}
                />
              </div>
              <div className="mt-11 md:mt-14">
                <CategoryInsightsGrid
                  category={category}
                  insights={
                    sections[category]?.insights ?? {
                      statusCounts: { planned: 0, current: 0, completed: 0, dropped: 0 },
                      completionRate: 0,
                      completionNumerator: 0,
                      completionDenominator: 0,
                      updatedLast7Days: 0,
                      updatedLast30Days: 0,
                    }
                  }
                  rhythmEntries={sections[category]?.rhythmEntries ?? []}
                  platformInsight={sections[category]?.platformInsight ?? null}
                />
              </div>
            </div>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
