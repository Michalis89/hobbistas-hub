'use client';

import { Gamepad2, Sparkles, BookOpen, Film, Tv, Code, PawPrint, Cloud } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type CategoryMeta = {
  title: string;
  desc: string;
  icon: ReactNode;
  href: string;
};

const categoryMeta: Record<string, CategoryMeta> = {
  games: {
    title: 'Games',
    desc: 'Backlog, progress, reviews',
    icon: <Gamepad2 className="h-4 w-4" />,
    href: '/backlog?category=games',
  },
  anime: {
    title: 'Anime',
    desc: 'Episodes, status, reviews',
    icon: <Sparkles className="h-4 w-4" />,
    href: '/backlog?category=anime',
  },
  manga: {
    title: 'Manga',
    desc: 'Chapters, status, reviews',
    icon: <BookOpen className="h-4 w-4" />,
    href: '/backlog?category=manga',
  },
  books: {
    title: 'Books',
    desc: 'Pages, status, reviews',
    icon: <BookOpen className="h-4 w-4" />,
    href: '/backlog?category=books',
  },
  movies: {
    title: 'Movies',
    desc: 'Watchlist, status, reviews',
    icon: <Film className="h-4 w-4" />,
    href: '/backlog?category=movies',
  },
  tv: {
    title: 'TV Series',
    desc: 'Episodes, status, reviews',
    icon: <Tv className="h-4 w-4" />,
    href: '/backlog?category=tv',
  },
  coding: {
    title: 'Coding',
    desc: 'Tutorials, tips, updates',
    icon: <Code className="h-4 w-4" />,
    href: '/articles?category=coding',
  },
  pet: {
    title: 'Pet',
    desc: 'Care tips, experiences',
    icon: <PawPrint className="h-4 w-4" />,
    href: '/articles?category=pet',
  },
  vape: {
    title: 'Vape',
    desc: 'Devices, liquids, experiences',
    icon: <Cloud className="h-4 w-4" />,
    href: '/articles?category=vape',
  },
};

type ProfileCategoriesProps = {
  categories: string[];
  activeCategory: string | null;
  onCategoryChange: (category: string) => void;
};

export function ProfileCategories({
  categories,
  activeCategory,
  onCategoryChange,
}: Readonly<ProfileCategoriesProps>) {
  if (categories.length === 0) {
    return null;
  }

  const actionCategory =
    activeCategory && categoryMeta[activeCategory] ? activeCategory : (categories[0] ?? null);

  return (
    <section className="px-4 py-12 md:px-6 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center md:mb-10">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            What I Love
          </p>
          <h2 className="text-2xl font-semibold md:text-3xl">The categories I keep close</h2>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 p-2 sm:p-3">
          {categories.map(cat => {
            const meta = categoryMeta[cat];
            if (!meta) {
              return null;
            }

            const isActive = activeCategory === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(cat)}
                aria-pressed={isActive}
                className={[
                  'group inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                  'hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary/40 bg-card text-foreground shadow-sm'
                    : 'border-border/60 bg-card/70 text-muted-foreground hover:border-border hover:text-foreground',
                ].join(' ')}
              >
                <span
                  className={[
                    'transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  ].join(' ')}
                >
                  {meta.icon}
                </span>
                <span>{meta.title}</span>
              </button>
            );
          })}
        </div>

        {actionCategory && categoryMeta[actionCategory] && (
          <div className="mt-5 flex justify-center">
            <Button
              href={categoryMeta[actionCategory].href}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              Go to Library
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

export { categoryMeta };
