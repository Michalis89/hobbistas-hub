import {
  Layers,
  Download,
  Sparkles,
  NotebookPen,
  WifiOff,
  ListTodo,
  Star,
  BarChart3,
  StickyNote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
  featured?: boolean;
};

const features: Feature[] = [
  {
    title: 'All Hobbies, One Library',
    description:
      'Games, anime, manga, books, movies and TV shows live side by side — with a single backlog, a single history, and one place to look when you want to know what you are on.',
    icon: Layers,
    featured: true,
  },
  {
    title: 'Steam Import',
    description:
      'Connect Steam and import your full game library with playtime. Your backlog appears in seconds.',
    icon: Download,
  },
  {
    title: 'Smart Recommendations',
    description:
      'Suggestions built from your actual taste — the genres, themes and ratings you have already given, read across every hobby at once.',
    icon: Sparkles,
  },
  {
    title: 'Private Diary',
    description:
      'A personal journal encrypted on your own device before it ever leaves it. Not even we can read it.',
    icon: NotebookPen,
  },
  {
    title: 'Works Offline',
    description:
      'Install Hobbistas on your phone or desktop and keep tracking with no connection. It syncs when you are back.',
    icon: WifiOff,
  },
];

const essentials: { label: string; icon: LucideIcon }[] = [
  { label: 'Progress tracking', icon: ListTodo },
  { label: 'Ratings & notes', icon: Star },
  { label: 'Planned / Current / Completed', icon: StickyNote },
  { label: 'Personal statistics', icon: BarChart3 },
];

export function HomeFeatures() {
  return (
    <section className="px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-10 text-center md:mb-12">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-foreground/80">
            Everything you need
          </p>
          <h2 className="mb-4 text-3xl font-semibold text-foreground md:text-4xl">
            One app, every hobby
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Track what you are on, remember what you finished, and find what to start next.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(feature => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`group rounded-lg border p-6 transition-[transform,box-shadow,border-color,background-color] duration-200 hover:border-primary/30 hover:bg-card/60 hover:shadow-md ${
                  feature.featured
                    ? 'border-border bg-card/40 sm:col-span-2'
                    : 'border-transparent bg-transparent'
                }`}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-primary transition-colors group-hover:bg-primary/10">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mb-2 text-base font-semibold tracking-[-0.01em] text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-8 flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-lg border border-border bg-card/40 px-6 py-4">
          {essentials.map(item => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Icon className="h-4 w-4 text-primary/70" aria-hidden />
                {item.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
