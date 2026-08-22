'use client';

import { memo, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CoverThumbImage, IMAGE_SIZES } from '@/components/ui/cover-image';
import { Calendar, Clock, Eye, FileText, Heart, Tag, User } from 'lucide-react';
import type { ArticleCategory, ArticleRow } from '@/types/database';
import { PageContainer } from '@/app/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty';
import { ErrorAlert } from '@/components/ui/alert';
import { CATEGORY_LABELS, CATEGORY_SUBTITLES, TOPIC_LABELS } from '@/app/(main)/articles/constants';
import { normalizeSlug } from '@/utils/slugify';
import { getVisibleCategories } from '@/app/(main)/pages/_shared/categories';
import { FormattedDate } from '@/utils/components/FormattedDate';
import {
  CONTENT_PUBLISHED_EVENT,
  type ContentPublishedEventDetail,
} from '@/app/constants/contentEvents';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '@/store/slices/authSlice';

interface ArticleWithAuthor extends ArticleRow {
  users?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

type NewsPageClientProps = {
  initialArticles?: ArticleWithAuthor[];
  initialTotal?: number;
  initialCategory?: ArticleCategory | null;
  initialTag?: string | null;
};

const PRIMARY_CATEGORIES: ArticleCategory[] = [
  'games',
  'anime',
  'manga',
  'movies',
  'tv',
  'books',
  'coding',
  'pet',
  'vape',
];

const SKELETON_COUNT = 6;

const ArticleCard = memo(function ArticleCard({
  article,
  priority = false,
  showEngagementMetrics = true,
}: {
  article: ArticleWithAuthor;
  priority?: boolean;
  showEngagementMetrics?: boolean;
}) {
  const normalizedSlug = normalizeSlug(article.slug);
  const readTimeLabel = article.reading_time_minutes
    ? `${article.reading_time_minutes} min read`
    : null;

  return (
    <Card className="animate-fade-in-up group rounded-lg border bg-card shadow-md focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background">
      <Link href={`/articles/${normalizedSlug}`} className="block">
        <div className="relative aspect-[16/10] bg-muted">
          {article.cover_image ? (
            <CoverThumbImage
              src={article.cover_image}
              alt={article.title}
              sizes={IMAGE_SIZES.grid3}
              priority={priority}
              className="object-cover transition duration-300 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.015]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted">
              <FileText size={42} className="text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
            <span className="rounded-full border border-white/20 bg-black/65 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
              {CATEGORY_LABELS[article.category] ?? article.category}
            </span>
            <span className="rounded-full border border-white/20 bg-black/65 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
              {TOPIC_LABELS[article.topic]}
            </span>
          </div>
        </div>
      </Link>

      <CardHeader className="p-4 pb-1">
        <Link href={`/articles/${normalizedSlug}`}>
          <CardTitle className="text-[19px] leading-tight text-foreground transition-colors duration-300 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:text-primary group-hover:text-primary">
            {article.title}
          </CardTitle>
        </Link>
        {article.description ? (
          <CardDescription className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">
            {article.description}
          </CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="p-4 pt-2">
        {article.tags && article.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {article.tags.slice(0, 3).map(tag => (
              <Link
                key={tag}
                href={`/articles?tag=${encodeURIComponent(tag)}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Tag size={10} />
                {tag}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {article.users ? (
            <div className="inline-flex items-center gap-1">
              <User size={12} />
              <span>{article.users.display_name || article.users.username}</span>
            </div>
          ) : null}

          {article.published_at ? (
            <div className="inline-flex items-center gap-1">
              <Calendar size={12} />
              <FormattedDate date={article.published_at} className="text-[11px]" fallback="" />
            </div>
          ) : null}

          {readTimeLabel ? (
            <div className="inline-flex items-center gap-1">
              <Clock size={12} />
              <span>{readTimeLabel}</span>
            </div>
          ) : null}

          {showEngagementMetrics ? (
            <div className="ml-auto inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Eye size={12} />
                {article.views ?? 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart size={12} />
                {article.likes ?? 0}
              </span>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
});
ArticleCard.displayName = 'ArticleCard';

const ArticleCardSkeleton = () => (
  <div className="min-h-[320px] rounded-lg border bg-card">
    <div className="aspect-[16/10] animate-pulse bg-muted" />
    <div className="space-y-3 p-4">
      <div className="h-4 w-3/4 animate-pulse rounded-full bg-muted" />
      <div className="h-3 animate-pulse rounded-full bg-muted" />
      <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
    </div>
  </div>
);

function NewsSkeletonGrid({ count = SKELETON_COUNT }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <ArticleCardSkeleton key={`news-skeleton-${index}`} />
      ))}
    </div>
  );
}

function buildHref({ category, tag }: { category: ArticleCategory | null; tag: string | null }) {
  const params = new URLSearchParams();
  if (category) {
    params.set('category', category);
  }
  if (tag) {
    params.set('tag', tag);
  }
  const query = params.toString();
  return query ? `/articles?${query}` : '/articles';
}

function FilterSegment({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-2 text-[13px] font-medium transition ${
        isActive
          ? 'bg-primary text-white'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

export default function NewsPageClient({
  initialArticles = [],
  initialTotal = 0,
  initialCategory = null,
  initialTag = null,
}: NewsPageClientProps) {
  return (
    <NewsPageContent
      initialArticles={initialArticles}
      initialTotal={initialTotal}
      initialCategory={initialCategory}
      initialTag={initialTag}
    />
  );
}

function NewsPageContent({
  initialArticles,
  initialTotal,
  initialCategory,
  initialTag,
}: Required<NewsPageClientProps>) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const availableCategories = getVisibleCategories({ scope: 'news' });
  const category =
    initialCategory && availableCategories.includes(initialCategory) ? initialCategory : null;
  const tag = initialTag || null;
  const skipInitialFetchRef = useRef(true);

  const [articles, setArticles] = useState<ArticleWithAuthor[]>(initialArticles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(initialTotal);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setArticles(initialArticles);
    setTotal(initialTotal);
    setError(null);
    setLoading(false);
    skipInitialFetchRef.current = true;
  }, [initialArticles, initialTotal, initialCategory, initialTag]);

  useEffect(() => {
    let isMounted = true;

    if (skipInitialFetchRef.current && refreshSignal === 0) {
      skipInitialFetchRef.current = false;
      return () => {
        isMounted = false;
      };
    }

    const fetchArticles = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (category) {
          params.set('category', category);
        }
        if (tag) {
          params.set('tag', tag);
        }
        params.set('status', 'published');
        params.set('limit', '20');

        const response = await fetch(`/api/articles?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to fetch articles');
        }

        const data = await response.json();
        const filtered = (data.data || []).filter(
          (article: ArticleWithAuthor) => article.topic !== 'reviews',
        );

        startTransition(() => {
          if (!isMounted) {
            return;
          }
          setArticles(filtered);
          setTotal(filtered.length);
          setLoading(false);
        });
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setLoading(false);
      }
    };

    fetchArticles();
    return () => {
      isMounted = false;
    };
  }, [category, tag, refreshSignal]);

  useEffect(() => {
    const handleContentPublished = (event: Event) => {
      const customEvent = event as CustomEvent<ContentPublishedEventDetail>;
      if (customEvent.detail?.type === 'article') {
        setRefreshSignal(current => current + 1);
      }
    };

    window.addEventListener(CONTENT_PUBLISHED_EVENT, handleContentPublished);
    return () => {
      window.removeEventListener(CONTENT_PUBLISHED_EVENT, handleContentPublished);
    };
  }, []);

  const categoryLabel = category ? (CATEGORY_LABELS[category] ?? null) : null;
  const pageTitle = categoryLabel ? categoryLabel : 'Articles';
  const subtitle = category
    ? (CATEGORY_SUBTITLES[category] ?? 'Community-written articles and stories, clearly organized.')
    : 'Discover community-written articles and stories across all hobbies.';
  const articleCountLabel = `${total} article${total === 1 ? '' : 's'}`;
  const metaLine = tag ? `${articleCountLabel} - ${tag}` : articleCountLabel;
  const emptyDescription = categoryLabel
    ? `No articles were found for the "${categoryLabel}" category.`
    : 'No published articles are available yet.';

  const shouldShowSkeleton = loading || isPending;
  const categoryFilters = [
    null,
    ...PRIMARY_CATEGORIES.filter(item => availableCategories.includes(item)),
  ];

  return (
    <PageContainer size="lg" className="py-10 sm:py-12">
      <div className="rounded-lg p-3 sm:p-4">
        <section className="animate-fade-in-up relative mb-6 overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.28),transparent_70%)]" />
            <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.18),transparent_70%)]" />
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary sm:h-20 sm:w-20">
                <FileText className="h-8 w-8" />
              </div>
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground sm:text-xs">
                  Editorial Desk
                </p>
                <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
                  {pageTitle}
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {metaLine}
            </span>
          </div>

          <div className="my-5" />

          <div className="space-y-4">
            <div className="flex flex-col items-center">
              <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Categories
              </p>
              <div className="flex w-full max-w-5xl justify-start gap-1 overflow-x-auto p-1 sm:justify-center">
                {categoryFilters.map(item => (
                  <FilterSegment
                    key={item ?? 'all'}
                    href={buildHref({ category: item, tag })}
                    label={item ? (CATEGORY_LABELS[item] ?? item) : 'All'}
                    isActive={item === category || (!item && !category)}
                  />
                ))}
              </div>
            </div>

            {tag ? (
              <div className="flex items-center justify-between border bg-muted px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Tag size={12} />
                  Tag: <span className="font-semibold text-foreground">{tag}</span>
                </span>
                <Link
                  href={buildHref({ category, tag: null })}
                  className="text-xs font-medium text-primary"
                >
                  Clear
                </Link>
              </div>
            ) : null}
          </div>
        </section>

        {shouldShowSkeleton ? (
          <NewsSkeletonGrid />
        ) : error ? (
          <ErrorAlert message={error} />
        ) : articles.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-16 w-16 text-muted-foreground" />}
            title="No articles yet"
            description={emptyDescription}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article, idx) => (
              <ArticleCard
                key={article.id}
                article={article}
                priority={idx < 2}
                showEngagementMetrics={isAuthenticated}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
