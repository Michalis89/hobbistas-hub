import Link from 'next/link';
import { FileText } from 'lucide-react';
import { CoverThumbImage } from '@/components/ui/cover-image';
import { FormattedDate } from '@/utils/components/FormattedDate';
import getSupabaseServer from '@/lib/supabase-server';
import { fetchArticlesForMedia } from '@/lib/articles/mediaLinks';

type MediaArticlesSectionProps = {
  readonly mediaId: number;
  readonly title: string;
};

/**
 * Articles and reviews written about this media item.
 *
 * Renders nothing when there are none, so the page is unchanged for the vast
 * majority of items that have never been written about.
 */
export default async function MediaArticlesSection({ mediaId, title }: MediaArticlesSectionProps) {
  const articles = await fetchArticlesForMedia(getSupabaseServer(), mediaId);

  if (articles.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-screen-2xl px-4 pb-12 sm:px-6">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">
        Written about {title}
      </h2>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map(article => {
          const href = `${article.topic === 'reviews' ? '/review' : '/articles'}/${article.slug}`;

          return (
            <li key={article.id}>
              <Link
                href={href}
                className="group flex h-full gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/50"
              >
                <span className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {article.cover_image ? (
                    <CoverThumbImage
                      src={article.cover_image}
                      alt={article.title}
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center">
                      <FileText size={16} className="text-muted-foreground" />
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {article.topic === 'reviews' ? 'Review' : 'Article'}
                    {article.role === 'subject' && (
                      <span className="rounded-full border border-primary/40 px-1.5 text-primary">
                        About this
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                    {article.title}
                  </span>
                  {article.published_at && (
                    <FormattedDate
                      date={article.published_at}
                      className="mt-1 block text-[11px] text-muted-foreground"
                      fallback=""
                    />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
