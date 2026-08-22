'use client';

import { CoverHeroImage } from '@/components/ui/cover-image';
import useSWR from 'swr';
import {
  ArrowRight,
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Sparkles,
  Tv,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { CarouselApi } from '@/components/ui/carousel';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';

type ContinueSlide = {
  category: string;
  entry_id: number;
  media_id: number;
  status: string;
  progress: number | null;
  score: string | null;
  updated_at: string;
  created_at: string;
  title: string | null;
  season_year: number | null;
  release_date: string | null;
  cover_image_large: string | null;
  cover_image_medium: string | null;
};

type CountBucket = {
  total: number;
  planned: number;
  current: number;
  completed: number;
  dropped: number;
};

export type ContinuePayload = {
  enabledCategories: string[];
  slides: ContinueSlide[];
  countsByCategory: Record<string, CountBucket>;
};

type CategoryConfig = {
  label: string;
  icon: ReactNode;
  verb: (count: number) => string;
  route: string;
};

type SlideItem = {
  slide: ContinueSlide;
  config: CategoryConfig;
  currentCount: number;
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(res => res.json());

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  games: {
    label: 'Games',
    icon: <Gamepad2 className="h-4 w-4" />,
    verb: count => `In progress: ${count} games`,
    route: '/backlog?category=games',
  },
  anime: {
    label: 'Anime',
    icon: <Sparkles className="h-4 w-4" />,
    verb: count => `In progress: ${count} anime`,
    route: '/backlog?category=anime',
  },
  manga: {
    label: 'Manga',
    icon: <BookOpen className="h-4 w-4" />,
    verb: count => `In progress: ${count} manga`,
    route: '/backlog?category=manga',
  },
  tv: {
    label: 'TV shows',
    icon: <Tv className="h-4 w-4" />,
    verb: count => `In progress: ${count} TV shows`,
    route: '/backlog?category=tv',
  },
  books: {
    label: 'Books',
    icon: <BookText className="h-4 w-4" />,
    verb: count => `In progress: ${count} books`,
    route: '/backlog?category=books',
  },
};

const CATEGORY_ROUTES = {
  games: '/backlog?category=games&status=current',
  anime: '/backlog?category=anime&status=current',
  manga: '/backlog?category=manga&status=current',
  tv: '/backlog?category=tv&status=current',
  books: '/backlog?category=books&status=current',
};

const appendSearchParam = (route: string, search?: string | null) => {
  const trimmed = search?.trim();
  if (!trimmed) {
    return route;
  }

  const url = new URL(route, 'https://hobbistas.local');
  url.searchParams.set('search', trimmed);
  return `${url.pathname}${url.search}`;
};

const formatTimeAgo = (value: string) => {
  const normalized = value.replace(' ', 'T') + 'Z';
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return 'just now';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return 'a few seconds';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }

  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'}`;
};

function RelativeTimeDisplay({ date }: { date: string }) {
  const [formattedTime, setFormattedTime] = useState<string | null>(null);

  useEffect(() => {
    setFormattedTime(formatTimeAgo(date));
  }, [date]);

  return <span suppressHydrationWarning>{formattedTime ?? '...'}</span>;
}

const getSlideImage = (slide: ContinueSlide) =>
  slide.cover_image_large ?? slide.cover_image_medium ?? null;

const getCategoryRoute = (category: string, search?: string | null) =>
  appendSearchParam(
    CATEGORY_ROUTES[category as keyof typeof CATEGORY_ROUTES] ?? '/backlog',
    search,
  );

const getProgressLabel = (category: string, progress: number | null) => {
  if (!progress || progress <= 0) {
    return null;
  }
  if (category === 'games') {
    return null;
  }
  if (category === 'anime' || category === 'tv') {
    return `Episode ${progress}`;
  }
  if (category === 'manga') {
    const plural = progress === 1 ? 'Volume' : 'Volumes';
    return `${plural} ${progress}`;
  }
  if (category === 'books') {
    return `Page ${progress}`;
  }
  return null;
};

const HeroSurface = ({ children, className = '' }: { children: ReactNode; className?: string }) => {
  return (
    <div className={`relative bg-background ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

const SlideCard = ({ item, isActive }: { item: SlideItem; isActive: boolean }) => {
  const imageUrl = getSlideImage(item.slide);
  const progressLabel = getProgressLabel(item.slide.category, item.slide.progress);

  return (
    <div className="group relative isolate flex flex-col gap-6 motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 md:grid md:grid-cols-[1.14fr,0.86fr] md:items-center md:gap-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(42%_58%_at_76%_52%,rgba(167,139,250,0.12),transparent_76%)] md:block"
      />
      <div className="w-full min-w-0 md:order-2 md:flex md:justify-end">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-2xl border border-white/15 bg-muted/10 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.7)] md:mx-0 md:w-[436px] md:max-w-none">
          {imageUrl ? (
            <>
              <div className="absolute inset-0 md:transition-transform md:duration-500 md:ease-out md:[transform:perspective(1100px)_rotateY(-4deg)_scale(1.02)] md:group-hover:[transform:perspective(1100px)_rotateY(-4deg)_scale(1.05)]">
                <CoverHeroImage
                  src={imageUrl}
                  alt={item.slide.title ?? 'Title'}
                  sizes="(max-width: 768px) 85vw, 436px"
                  className="absolute inset-0 rounded-2xl object-cover"
                  priority={isActive}
                />
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-white/20 via-transparent to-transparent dark:from-black/45" />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_62%)] dark:bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_62%)]">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-background/70">
                {item.config.icon}
              </span>
              <p className="text-xs font-medium tracking-[0.06em] text-muted-foreground">
                No image
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-5 md:order-1 md:space-y-7 md:pl-4 lg:pl-8">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          <span>{item.config.icon}</span>
          {item.config.label}
        </div>

        <p className="text-muted-foreground/78 text-sm">{item.config.verb(item.currentCount)}</p>

        <div className="space-y-2.5">
          <h2 className="text-balance break-words text-[2.16rem] font-semibold tracking-tight text-foreground md:text-[2.68rem]">
            Pick up where you left off
          </h2>
          <p className="text-balance break-words text-[1.72rem] font-semibold tracking-tight text-foreground md:text-[2.05rem]">
            {item.slide.title ?? 'Untitled'}
          </p>
          <p className="text-muted-foreground/62 text-sm md:text-[15px]">
            {progressLabel ? (
              <span>
                {progressLabel} <span aria-hidden="true">&bull;</span>{' '}
              </span>
            ) : null}
            Updated <RelativeTimeDisplay date={item.slide.updated_at} /> ago
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 pt-1.5">
          <Button
            variant="primary"
            href={getCategoryRoute(item.slide.category, item.slide.title)}
            className="min-h-11 w-full justify-center rounded-[20px] bg-violet-600 px-5 py-3 text-[13px] font-semibold tracking-[-0.01em] text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 sm:w-auto"
          >
            Continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            href={getCategoryRoute(item.slide.category)}
            className="min-h-11 w-full justify-center rounded-[20px] border border-black/10 px-5 py-3 text-[13px] font-medium tracking-[-0.01em] focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 dark:border-white/10 sm:w-auto"
          >
            All {item.config.label} in progress
          </Button>
        </div>
      </div>
    </div>
  );
};

type ContinueHeroProps = {
  fallbackData?: ContinuePayload;
};

export function ContinueHero({ fallbackData }: ContinueHeroProps = {}) {
  const { data: response, isLoading } = useSWR<ContinuePayload | { data: ContinuePayload }>(
    '/api/user/continue',
    fetcher,
    {
      fallbackData,
      refreshInterval: 0,
      revalidateOnFocus: true,
      revalidateOnMount: !fallbackData,
      dedupingInterval: 2000, // Prevent excessive revalidation
    },
  );

  const payload = (response && 'data' in response ? response.data : response) as
    | ContinuePayload
    | undefined;
  const isInitialLoading = isLoading && !response;

  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const slides = useMemo(() => payload?.slides ?? [], [payload]);
  const countsByCategory = useMemo(() => payload?.countsByCategory ?? {}, [payload]);

  const slideItems = useMemo(
    () =>
      slides
        .map<SlideItem | null>(slide => {
          const config = CATEGORY_CONFIG[slide.category];
          if (!config) {
            return null;
          }
          return {
            slide,
            config,
            currentCount: countsByCategory[slide.category]?.current ?? 0,
          };
        })
        .filter((item): item is SlideItem => Boolean(item)),
    [slides, countsByCategory],
  );

  useEffect(() => {
    if (!carouselApi) {
      return;
    }

    const onSelect = () => {
      setSelectedIndex(carouselApi.selectedScrollSnap());
    };

    onSelect();
    carouselApi.on('select', onSelect);
    carouselApi.on('reInit', onSelect);

    return () => {
      carouselApi.off('select', onSelect);
      carouselApi.off('reInit', onSelect);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi || slideItems.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      carouselApi.scrollNext();
    }, 8500);

    return () => window.clearInterval(intervalId);
  }, [carouselApi, slideItems.length]);

  if (isInitialLoading) {
    return (
      <section className="relative w-full overflow-hidden">
        <HeroSurface>
          <div className="relative mx-auto flex min-h-[468px] max-w-7xl items-center px-6 py-9 md:py-12">
            <div className="grid min-h-[300px] w-full items-center gap-8 md:grid-cols-[1.14fr,0.86fr] md:gap-14">
              <div className="animate-pulse space-y-4">
                <div className="h-4 w-24 rounded bg-card/50" />
                <div className="h-10 w-3/4 rounded bg-card/60" />
                <div className="h-5 w-1/2 rounded bg-card/40" />
                <div className="flex gap-3 pt-4">
                  <div className="h-12 w-32 rounded-full bg-card/60" />
                  <div className="h-12 w-48 rounded-full bg-card/40" />
                </div>
              </div>
              <div className="aspect-[4/5] w-full max-w-[320px] rounded-2xl border border-white/15 bg-card/30 md:w-[436px] md:max-w-none md:justify-self-end" />
            </div>
          </div>
        </HeroSurface>
      </section>
    );
  }

  // Nothing in progress: render nothing rather than a 468px-tall hero inviting
  // the user to "pick up where you left off" — which reads as broken for someone
  // who has never started anything. DashboardEmptyState covers this case with a
  // panel that explains the emptiness and links into each chosen category.
  if (slideItems.length === 0) {
    return null;
  }

  return (
    <section className="relative w-full overflow-hidden">
      <HeroSurface>
        <div className="relative mx-auto flex min-h-[468px] w-full max-w-7xl flex-col justify-center px-6 py-9 md:py-12">
          <Carousel
            setApi={setCarouselApi}
            opts={{
              align: 'start',
              loop: slideItems.length > 1,
              containScroll: 'trimSnaps',
            }}
            className="w-full"
          >
            <CarouselContent className="w-full gap-12">
              {slideItems.map((item, index) => (
                <CarouselItem
                  key={`slide-${item.slide.entry_id}`}
                  className="min-w-0 shrink-0 grow-0 basis-full pl-0"
                >
                  <SlideCard item={item} isActive={index === selectedIndex} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {slideItems.length > 1 && (
            <div className="mt-6 flex w-full justify-center md:justify-end">
              <div className="flex w-full max-w-[420px] items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  type="button"
                  aria-label="Previous slide"
                  className="h-10 w-10 rounded-full focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 md:h-8 md:w-8"
                  onClick={() => carouselApi?.scrollPrev()}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {slideItems.map((_, index) => {
                  const isActive = index === selectedIndex;
                  return (
                    <button
                      key={`dot-${index}`}
                      type="button"
                      onClick={() => carouselApi?.scrollTo(index)}
                      aria-label={`Go to slide ${index + 1}`}
                      className={`h-2.5 w-2.5 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${
                        isActive ? 'border-foreground bg-foreground' : 'border-input bg-card'
                      }`}
                    />
                  );
                })}

                <Button
                  variant="secondary"
                  size="icon"
                  type="button"
                  aria-label="Next slide"
                  className="h-10 w-10 rounded-full focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 md:h-8 md:w-8"
                  onClick={() => carouselApi?.scrollNext()}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </HeroSurface>
    </section>
  );
}
