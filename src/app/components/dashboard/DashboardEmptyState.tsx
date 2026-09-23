// Server Component — no 'use client'

/**
 * Shown when a user has categories enabled but has not tracked anything yet.
 *
 * The regular dashboard renders honestly for an empty library — six zero
 * counters, "No favorites yet", and four "No data yet" panels — which reads as a
 * broken page rather than a new one. This replaces that with an explanation of
 * *why* it is empty and a direct route into each category the user picked.
 */

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Gamepad2,
  Library,
  Plus,
  Sparkles,
  Tv,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DashboardCategoryKey } from '@/lib/dashboard/category-data';

type CategoryPresentation = {
  label: string;
  /** What the user adds, phrased for "Add your first ___". */
  noun: string;
  href: string;
  icon: LucideIcon;
};

const CATEGORY_PRESENTATION: Record<DashboardCategoryKey, CategoryPresentation> = {
  games: { label: 'Games', noun: 'game', href: '/backlog?category=games', icon: Gamepad2 },
  anime: { label: 'Anime', noun: 'series', href: '/backlog?category=anime', icon: Sparkles },
  manga: { label: 'Manga', noun: 'manga', href: '/backlog?category=manga', icon: Library },
  movies: { label: 'Movies', noun: 'movie', href: '/backlog?category=movies', icon: Clapperboard },
  tv: { label: 'TV Series', noun: 'show', href: '/backlog?category=tv', icon: Tv },
  books: { label: 'Books', noun: 'book', href: '/backlog?category=books', icon: BookOpen },
};

type DashboardEmptyStateProps = {
  categories: DashboardCategoryKey[];
};

export default function DashboardEmptyState({ categories }: DashboardEmptyStateProps) {
  const visible = categories.filter(category => CATEGORY_PRESENTATION[category]);

  if (visible.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="dashboard-empty-heading" className="mt-10 md:mt-12">
      <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-6">
        <div className="rounded-[var(--radius-xl)] border border-border bg-card p-6 md:p-8">
          <div className="max-w-[60ch] space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-primary">Nothing tracked yet</p>
            <h2
              id="dashboard-empty-heading"
              className="text-2xl font-black tracking-tight text-foreground md:text-3xl"
            >
              Your dashboard fills up as you add titles
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Progress, stats, and recommendations are all built from your own library — so
              everything reads zero until there is something in it. Add a title to one of the
              categories you picked and this page comes to life.
            </p>
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(category => {
              const { label, noun, href, icon: Icon } = CATEGORY_PRESENTATION[category];

              return (
                <li key={category}>
                  <Link
                    href={href}
                    className={[
                      'group flex items-center gap-3 rounded-[var(--radius-lg)] border border-border',
                      'bg-background/30 px-4 py-3.5 transition-colors duration-150',
                      'hover:border-primary/35 hover:bg-background/50',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      'focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    ].join(' ')}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{label}</span>
                      <span className="block text-sm text-muted-foreground">
                        Add your first {noun}
                      </span>
                    </span>

                    <Plus
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Tracking something that is not listed here?
            </p>
            <Button asChild variant="outline" className="h-10 whitespace-nowrap">
              <Link href="/profile/edit#categories">
                Change your categories
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
