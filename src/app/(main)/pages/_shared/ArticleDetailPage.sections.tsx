import { CoverHeroImage, CoverThumbImage } from '@/components/ui/cover-image';
import Link from 'next/link';
import { Calendar, Eye, FileText, Heart } from 'lucide-react';
import type { ArticleRow } from '@/types/database';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import Breadcrumbs from '@/components/ui/breadcrumbs';
import EmptyState from '@/components/ui/empty';
import ArticleComments from '@/app/components/article/ArticleComments.client';
import ArticleAuthHint from '@/app/components/article/ArticleAuthHint.client';
import { FormattedDate } from '@/utils/components/FormattedDate';
import MetaActionsBar from '@/app/components/article/MetaActionsBar';
import { ArticleBody } from '@/components/article/ArticleBody';
import { ARTICLE_SUBTITLE, ARTICLE_TITLE } from '@/components/article/typography';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export type RelatedArticleCard = Pick<
  ArticleRow,
  | 'id'
  | 'slug'
  | 'title'
  | 'description'
  | 'cover_image'
  | 'category'
  | 'topic'
  | 'published_at'
  | 'views'
  | 'likes'
>;

interface HeroSectionProps {
  title: string;
  coverImage: string | null;
}

interface ArticleBodySectionProps {
  uiBreadcrumbs: BreadcrumbItem[];
  categoryLabel: string;
  topicLabel: string;
  isReview: boolean;
  score: number | null;
  title: string;
  description: string | null;
  article: ArticleRow;
  readTime: string | null;
  dateOptions: Intl.DateTimeFormatOptions;
  showEngagementUi: boolean;
  contentWithHeadingIds: string;
  contentRich: unknown;
}

interface RelatedArticlesSectionProps {
  relatedArticles: RelatedArticleCard[];
  relatedContentLabel: string;
  basePath: string;
  showEngagementUi: boolean;
}

export function ArticleHeroSection({ title, coverImage }: HeroSectionProps) {
  return (
    <div className="relative h-[clamp(280px,45vh,480px)] w-full">
      {coverImage ? (
        <CoverHeroImage
          src={coverImage}
          alt={title}
          priority
          sizes="(min-width: 1280px) 1120px, 100vw"
          className="object-cover object-[center_35%]"
        />
      ) : (
        <div className="h-full w-full bg-card" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
    </div>
  );
}

export function ArticleBodySection({
  uiBreadcrumbs,
  categoryLabel,
  topicLabel,
  isReview,
  score,
  title,
  description,
  article,
  readTime,
  dateOptions,
  showEngagementUi,
  contentWithHeadingIds,
  contentRich,
}: ArticleBodySectionProps) {
  return (
    <div className="mx-auto w-full max-w-[76ch]">
      <header>
        <Breadcrumbs items={uiBreadcrumbs} className="mb-4" />

        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="rounded-full border border-border bg-card/80 px-3 py-1">
            {categoryLabel}
          </span>
          <span className="rounded-full border border-border bg-card/80 px-3 py-1">
            {topicLabel}
          </span>
          {isReview && score != null && (
            <span className="rounded-full border border-border bg-card/80 px-3 py-1">
              &#11088; {score} / 10
            </span>
          )}
        </div>

        <h1 className={ARTICLE_TITLE}>{title}</h1>

        {description && <p className={ARTICLE_SUBTITLE}>{description}</p>}
      </header>

      <div className="mt-8">
        <MetaActionsBar
          article={article}
          readTime={readTime}
          dateOptions={dateOptions}
          showEngagementMetrics={showEngagementUi}
          showActions={showEngagementUi}
        />

        {showEngagementUi && (
          <section className="mt-3 space-y-3">
            <ArticleAuthHint />
          </section>
        )}

        <ArticleBody contentRich={contentRich} contentHtml={contentWithHeadingIds} />
        {showEngagementUi && <ArticleComments articleId={article.id} />}
      </div>
    </div>
  );
}

export function RelatedArticlesSection({
  relatedArticles,
  relatedContentLabel,
  basePath,
  showEngagementUi,
}: RelatedArticlesSectionProps) {
  return (
    <div className="mt-12 border-t border-border pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {`Related ${relatedContentLabel}`}
        </h2>
        <Link
          href={basePath}
          className="text-sm font-semibold text-primary underline-offset-4 transition hover:underline"
        >
          See all
        </Link>
      </div>
      {relatedArticles.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {relatedArticles.map(related => {
            const relatedHref = `${basePath}/${related.slug}`;

            return (
              <Card
                key={related.id}
                className="group rounded-3xl border border-border bg-card shadow-md transition hover:shadow-lg"
              >
                <Link href={relatedHref} className="block">
                  <div className="relative h-36 w-full bg-muted">
                    {related.cover_image ? (
                      <CoverThumbImage
                        src={related.cover_image}
                        alt={related.title}
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-primary/20">
                        <FileText size={32} className="text-primary" />
                      </div>
                    )}
                  </div>
                </Link>
                <CardContent className="px-4 pb-4 pt-3">
                  <Link href={relatedHref}>
                    <CardTitle className="text-[16px] leading-snug text-foreground transition-colors group-hover:text-primary">
                      {related.title}
                    </CardTitle>
                  </Link>
                  {related.description && (
                    <CardDescription className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {related.description}
                    </CardDescription>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {related.published_at && (
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <FormattedDate
                          date={related.published_at}
                          className="text-[10px]"
                          fallback=""
                        />
                      </div>
                    )}
                    {showEngagementUi ? (
                      <>
                        <div className="flex items-center gap-1">
                          <Eye size={12} />
                          <span>{related.views ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Heart size={12} />
                          <span>{related.likes ?? 0}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-border bg-card p-6">
          <EmptyState
            title={`No related ${relatedContentLabel} yet`}
            description="Try refreshing the page or explore a different topic."
          />
        </div>
      )}
    </div>
  );
}
