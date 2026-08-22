'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Pencil } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/context/LocaleContext';
import type { ArticleRow, ArticleStatus } from '@/types/database';
import { CONTENT_TOPIC_META } from './profileData';

const STATUS_TABS: ArticleStatus[] = ['published', 'draft', 'archived'];
const TYPE_FILTERS = ['all', 'articles', 'reviews', 'diary'] as const;
type ContentTypeFilter = (typeof TYPE_FILTERS)[number];

const STATUS_BADGE: Record<ArticleStatus, string> = {
  published: 'border-emerald-500/40 text-emerald-300',
  draft: 'border-amber-500/40 text-amber-300',
  scheduled: 'border-primary/40 text-primary',
  archived: 'border-border/60 text-muted-foreground',
};

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) {
    return 'Unpublished';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unpublished';
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function ContentList() {
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<ArticleStatus>('published');
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>('all');
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTab = (status: ArticleStatus) => {
    setLoading(true);
    fetch(`/api/articles?author_id=me&status=${status}&limit=30`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setArticles((data?.data as ArticleRow[]) || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      loadTab(activeTab);
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [activeTab]);

  const title = useMemo(() => {
    if (activeTab === 'published') {
      return 'Published content';
    }
    if (activeTab === 'draft') {
      return 'Draft workspace';
    }
    return 'Archived content';
  }, [activeTab]);

  const filteredArticles = useMemo(() => {
    if (typeFilter === 'all') {
      return articles;
    }
    if (typeFilter === 'diary') {
      return articles.filter(article =>
        ['diary', 'journal', 'entry'].some(keyword =>
          (article.category || '').toLowerCase().includes(keyword),
        ),
      );
    }
    return articles.filter(article => article.topic === typeFilter);
  }, [articles, typeFilter]);

  return (
    <section
      aria-labelledby="content-list-heading"
      className="rounded-3xl border border-border/60 bg-card/50 p-5 sm:p-6"
    >
      <header className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Publishing</p>
        <h2
          id="content-list-heading"
          className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
        >
          My Content
        </h2>
      </header>

      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Content status filters">
        {STATUS_TABS.map(status => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={activeTab === status}
            onClick={() => setActiveTab(status)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              activeTab === status
                ? 'border-primary/45 bg-primary/15 text-primary'
                : 'border-border/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map(filter => (
          <button
            key={filter}
            type="button"
            onClick={() => setTypeFilter(filter)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
              typeFilter === filter
                ? 'border-primary/45 bg-primary/15 text-primary'
                : 'border-border/60 bg-card/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {filter === 'all' ? 'All types' : filter}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">{title}</p>

      <div className="space-y-2">
        {loading ? (
          [1, 2, 3].map(item => <Skeleton key={item} className="h-16 w-full rounded-xl" />)
        ) : filteredArticles.length > 0 ? (
          filteredArticles.map(article => {
            const topicMeta = CONTENT_TOPIC_META[article.topic] || CONTENT_TOPIC_META.articles;
            const TopicIcon = topicMeta.icon;
            const hrefBase = article.topic === 'reviews' ? '/review' : '/articles';
            return (
              <article
                key={article.id}
                className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/65 p-3 transition-all duration-200 hover:border-primary/35 hover:bg-card/80"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <TopicIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-foreground">{article.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className={`border ${STATUS_BADGE[article.status]}`}>
                      {article.status}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="border border-border/60 text-muted-foreground"
                    >
                      {topicMeta.label}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{article.category}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(article.published_at, locale)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {article.status === 'published' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-8 w-8"
                      aria-label="View content"
                    >
                      <Link href={`${hrefBase}/${article.slug}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    asChild
                    aria-label="Edit content"
                  >
                    <Link href={`/studio/${article.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
            No {activeTab} content in this filter yet.
          </p>
        )}
      </div>

    </section>
  );
}
