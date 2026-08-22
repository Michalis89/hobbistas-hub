import type { ArticleDetailPageOptions } from '@/app/(main)/pages/_shared/ArticleDetailPage';
import ArticleDetailPage, {
  buildArticleDetailMetadata,
} from '@/app/(main)/pages/_shared/ArticleDetailPage';

const REVIEW_DETAIL_OPTIONS: ArticleDetailPageOptions = {
  basePath: '/review',
  breadcrumbLabel: 'Reviews',
  topicFilter: 'reviews',
};

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  return buildArticleDetailMetadata({
    params,
    searchParams,
    options: REVIEW_DETAIL_OPTIONS,
  });
}

export default function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  return (
    <ArticleDetailPage
      params={params}
      searchParams={searchParams}
      basePath={REVIEW_DETAIL_OPTIONS.basePath}
      breadcrumbLabel={REVIEW_DETAIL_OPTIONS.breadcrumbLabel}
      topicFilter={REVIEW_DETAIL_OPTIONS.topicFilter}
    />
  );
}
