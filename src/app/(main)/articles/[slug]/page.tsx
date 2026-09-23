import type { ArticleDetailPageOptions } from '@/app/(main)/pages/_shared/ArticleDetailPage';
import ArticleDetailPage, {
  buildArticleDetailMetadata,
} from '@/app/(main)/pages/_shared/ArticleDetailPage';

const ARTICLE_DETAIL_OPTIONS: ArticleDetailPageOptions = {
  basePath: '/articles',
  breadcrumbLabel: 'Articles',
};

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string; lang?: string }>;
}) {
  return buildArticleDetailMetadata({
    params,
    searchParams,
    options: ARTICLE_DETAIL_OPTIONS,
  });
}

export default function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string; lang?: string }>;
}) {
  return (
    <ArticleDetailPage
      params={params}
      searchParams={searchParams}
      basePath={ARTICLE_DETAIL_OPTIONS.basePath}
      breadcrumbLabel={ARTICLE_DETAIL_OPTIONS.breadcrumbLabel}
    />
  );
}
