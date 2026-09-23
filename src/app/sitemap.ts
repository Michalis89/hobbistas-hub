import type { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { SITE_URL } from '@/config/site';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { normalizeSlug } from '@/utils/slugify';

export const revalidate = 3600;

type SitemapArticleRow = {
  slug: string | null;
  topic: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
};

const SITE_ORIGIN = SITE_URL.replace(/\/$/, '');

const STATIC_PUBLIC_PAGES: MetadataRoute.Sitemap = [
  { url: `${SITE_ORIGIN}/`, changeFrequency: 'daily', priority: 1 },
  { url: `${SITE_ORIGIN}/about`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_ORIGIN}/articles`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${SITE_ORIGIN}/review`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${SITE_ORIGIN}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${SITE_ORIGIN}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
];

function toValidDate(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getLastModified(article: SitemapArticleRow): Date | undefined {
  return (
    toValidDate(article.updated_at) ??
    toValidDate(article.published_at) ??
    toValidDate(article.created_at)
  );
}

export const getPublishedArticleSitemapEntries = unstable_cache(
  async (): Promise<MetadataRoute.Sitemap> => {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('articles')
      .select('slug, topic, updated_at, published_at, created_at')
      .eq('status', 'published')
      .or(`published_at.is.null,published_at.lte.${now}`)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to build sitemap from Supabase articles', {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      throw new Error('Failed to build sitemap from published articles');
    }

    const entries = new Map<string, MetadataRoute.Sitemap[number]>();

    for (const article of (data ?? []) as SitemapArticleRow[]) {
      if (!article.slug) {
        continue;
      }

      const slug = normalizeSlug(article.slug);
      if (!slug || slug === '-' || slug.includes('/')) {
        continue;
      }

      const basePath = article.topic === 'reviews' ? '/review' : '/articles';
      const url = `${SITE_ORIGIN}${basePath}/${slug}`;

      if (entries.has(url)) {
        continue;
      }

      entries.set(url, {
        url,
        lastModified: getLastModified(article),
        changeFrequency: article.topic === 'reviews' ? 'monthly' : 'weekly',
        priority: 0.8,
      });
    }

    return Array.from(entries.values());
  },
  ['published-article-sitemap'],
  {
    revalidate: 3600,
    tags: [CACHE_TAGS.ARTICLES],
  },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...STATIC_PUBLIC_PAGES, ...(await getPublishedArticleSitemapEntries())];
}
