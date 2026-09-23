import type { Metadata } from 'next';
import type { ComponentProps } from 'react';
import NewsPageClient from '@/app/(main)/articles/NewsPageClient';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import { CATEGORY_LABELS, CATEGORY_SUBTITLES, TOPIC_LABELS } from '@/app/(main)/articles/constants';
import type { ArticleCategory } from '@/types/database';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_URL } from '@/config/site';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { getArticlesWithFilters } from '@/lib/supabase/queries';

export const revalidate = 300;

type NewsPageProps = {
  searchParams: Promise<{ category?: string; topic?: string; tag?: string }>;
};

type NewsClientInitialArticles = NonNullable<ComponentProps<typeof NewsPageClient>['initialArticles']>;

const DEFAULT_HEADING = 'Articles';
const DEFAULT_DESCRIPTION =
  'Discover thoughtful articles, practical guides, and community stories across every hobby.';

export async function generateMetadata({ searchParams }: NewsPageProps): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const rawCategory = resolvedSearchParams.category;
  const category =
    rawCategory && CATEGORY_LABELS[rawCategory as ArticleCategory]
      ? (rawCategory as ArticleCategory)
      : undefined;
  const rawTopic = resolvedSearchParams.topic as keyof typeof TOPIC_LABELS | undefined;
  const topic = rawTopic === 'articles' ? undefined : rawTopic;
  const categoryLabel = category ? CATEGORY_LABELS[category] : undefined;
  const topicLabel = topic ? TOPIC_LABELS[topic] : undefined;
  const heading = topicLabel ?? DEFAULT_HEADING;

  const title = categoryLabel
    ? `${heading} for ${categoryLabel} | Hobbistas`
    : `${heading} | Hobbistas`;

  const description =
    category && categoryLabel
      ? (CATEGORY_SUBTITLES[category] ?? DEFAULT_DESCRIPTION)
      : DEFAULT_DESCRIPTION;

  const params = new URLSearchParams();
  if (category) {
    params.set('category', category);
  }
  if (topic) {
    params.set('topic', topic);
  }

  const path = params.toString() ? `/articles?${params.toString()}` : '/articles';

  return buildMetadata({
    title,
    description,
    path,
  });
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawCategory = resolvedSearchParams.category;
  const tag = resolvedSearchParams.tag || null;
  const category =
    rawCategory && CATEGORY_LABELS[rawCategory as ArticleCategory]
      ? (rawCategory as ArticleCategory)
      : undefined;
  const rawTopic = resolvedSearchParams.topic as keyof typeof TOPIC_LABELS | undefined;
  const topic = rawTopic === 'articles' ? undefined : rawTopic;
  const categoryLabel = category ? CATEGORY_LABELS[category] : undefined;
  const topicLabel = topic ? TOPIC_LABELS[topic] : undefined;
  const heading = topicLabel ?? DEFAULT_HEADING;
  const breadcrumb = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Articles', url: `${SITE_URL}/articles` },
  ];

  if (categoryLabel) {
    const label = topicLabel ? `${heading} - ${categoryLabel}` : categoryLabel;
    breadcrumb.push({ name: label, url: `${SITE_URL}/articles?category=${category}` });
  }

  let initialArticles: NewsClientInitialArticles = [];
  let initialTotal = 0;

  try {
    const supabase = await createRouteHandlerClient(undefined, { ignoreCookies: true });
    const { data, count } = await getArticlesWithFilters(supabase, {
      category: category ?? null,
      topic: topic ?? null,
      status: 'published',
      tag,
      limit: 20,
      offset: 0,
    });
    initialArticles = ((data ?? []) as NewsClientInitialArticles).filter(
      article => article.topic !== 'reviews',
    );
    initialTotal = topic ? (count ?? initialArticles.length) : initialArticles.length;
  } catch (error) {
    console.error('Failed to prefetch articles for SSR:', error);
  }

  return (
    <>
      <StructuredData data={getBreadcrumbStructuredData(breadcrumb)} />
      <NewsPageClient
        initialArticles={initialArticles}
        initialTotal={initialTotal}
        initialCategory={category ?? null}
        initialTag={tag}
      />
    </>
  );
}
