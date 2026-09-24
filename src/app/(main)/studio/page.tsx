import Link from 'next/link';
import { FileText, Pencil, Plus } from 'lucide-react';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireStudioAccess } from '@/lib/articles/studioAccess';
import { PageContainer } from '@/app/components/layout';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/ui/empty';
import { FormattedDate } from '@/utils/components/FormattedDate';
import { CATEGORIES } from '@/lib/articles/composerConfig';
import DeleteArticleButton from '@/app/components/studio/DeleteArticleButton.client';
import type { ArticleCategory } from '@/types/database';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  published: 'border-success/40 bg-success/10 text-success',
  scheduled: 'border-primary/40 bg-primary/10 text-primary',
  draft: 'border-border bg-muted/50 text-muted-foreground',
  archived: 'border-border bg-muted/30 text-muted-foreground',
};

const STATUS_ORDER = ['scheduled', 'draft', 'published', 'archived'];

type StudioRow = {
  id: number;
  title: string;
  slug: string;
  status: string | null;
  topic: string | null;
  category: string;
  updated_at: string | null;
  published_at: string | null;
  scheduled_for: string | null;
};

/**
 * Shows when a scheduled article goes live, and flags one whose time has passed
 * without being published - which means the database publisher is not running.
 */
function ScheduledLabel({ scheduledFor, isOverdue }: { scheduledFor: string; isOverdue: boolean }) {
  const due = new Date(scheduledFor);

  return (
    <span
      className={`hidden text-xs md:inline ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}
      title={isOverdue ? 'Past due and still not published - check the publisher job.' : undefined}
    >
      {isOverdue ? 'Overdue: ' : 'Goes live '}
      {due.toLocaleString()}
    </span>
  );
}

export default async function StudioPage() {
  const { session, canManageAllContent } = await requireStudioAccess();
  const supabase = await createRouteHandlerClient();

  let query = supabase
    .from('articles')
    .select('id, title, slug, status, topic, category, updated_at, published_at, scheduled_for')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (!canManageAllContent) {
    query = query.eq('author_id', session.user.id);
  }

  const { data } = await query;
  const rows = (data ?? []) as StudioRow[];
  // This is a force-dynamic server component: it renders once per request and
  // never re-renders, so reading the clock here is stable by construction. The
  // purity rule is aimed at client re-renders, which do not apply.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const now = Date.now();

  const grouped = STATUS_ORDER.map(status => ({
    status,
    items: rows.filter(row => (row.status ?? 'draft') === status),
  })).filter(group => group.items.length > 0);

  return (
    <PageContainer size="lg" className="space-y-8">
      <PageHeader
        title="Studio"
        description={
          canManageAllContent
            ? 'Every article and review on the site.'
            : 'Your articles and reviews.'
        }
        eyebrow="Write"
        align="left"
        actions={
          <Button asChild>
            <Link href="/studio/new">
              <Plus size={16} />
              New
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8">
          <EmptyState
            title="Nothing written yet"
            description="Start a draft and it will be saved automatically as you write."
          />
        </div>
      ) : (
        grouped.map(group => (
          <section key={group.status} className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.status} ({group.items.length})
            </h2>

            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {group.items.map(row => {
                const isReview = row.topic === 'reviews';
                const publicHref = `${isReview ? '/review' : '/articles'}/${row.slug}`;
                const categoryLabel =
                  CATEGORIES[row.category as ArticleCategory]?.label ?? row.category;

                return (
                  <li
                    key={row.id}
                    className="hover:bg-surface-hover flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <FileText size={16} className="shrink-0 text-muted-foreground" />

                    <Link
                      href={`/studio/${row.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-primary"
                    >
                      {row.title || 'Untitled draft'}
                    </Link>

                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                        STATUS_STYLES[row.status ?? 'draft'] ?? STATUS_STYLES.draft
                      }`}
                    >
                      {row.status ?? 'draft'}
                    </span>

                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {isReview ? 'Review' : 'Article'} · {categoryLabel}
                    </span>

                    {row.status === 'scheduled' && row.scheduled_for ? (
                      <ScheduledLabel
                        scheduledFor={row.scheduled_for}
                        isOverdue={new Date(row.scheduled_for).getTime() < now}
                      />
                    ) : (
                      <FormattedDate
                        date={row.updated_at ?? row.published_at ?? ''}
                        className="hidden text-xs text-muted-foreground md:inline"
                        fallback=""
                      />
                    )}

                    <span className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" iconOnly asChild title="Edit">
                        <Link href={`/studio/${row.id}`} aria-label={`Edit ${row.title}`}>
                          <Pencil size={14} />
                        </Link>
                      </Button>
                      {row.status === 'published' && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={publicHref} target="_blank">
                            View
                          </Link>
                        </Button>
                      )}
                      <DeleteArticleButton
                        articleId={row.id}
                        title={row.title}
                        isPublished={row.status === 'published'}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </PageContainer>
  );
}
