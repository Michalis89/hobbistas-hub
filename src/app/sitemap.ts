import type { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { SITE_URL } from '@/config/site';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { normalizeSlug } from '@/utils/slugify';
import {
  articleLocalePath,
  availableLocales,
  isArticleLocale,
  type ArticleLocale,
} from '@/lib/articles/locales';

export const revalidate = 3600;

type SitemapArticleRow = {
  id: number;
  slug: string | null;
  topic: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
};

type SitemapTranslationRow = {
  article_id: number;
  locale: string;
  title: string;
};

const SITE_ORIGIN = SITE_URL.replace(/\/$/, '');

const STATIC_PUBLIC_PAGES: MetadataRoute.Sitemap = [
  { url: `${SITE_ORIGIN}/`, changeFrequency: 'daily', priority: 1 },
  { url: `${SITE_ORIGIN}/about`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_ORIGIN}/hobbies`, changeFrequency: 'weekly', priority: 0.7 },
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

/**
 * Which languages each article can be read in.
 *
 * A failed read degrades to "no translations" rather than throwing: the
 * English sitemap is still correct without the hreflang annotations, and a
 * missing table must not take the whole sitemap down.
 */
async function fetchTranslatedLocales(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<Map<number, ArticleLocale[]>> {
  const byArticle = new Map<number, ArticleLocale[]>();

  const { data, error } = await supabase
    .from('article_translations')
    .select('article_id, locale, title');

  if (error) {
    console.warn('Could not load article translations for sitemap:', error.message);
    return byArticle;
  }

  const grouped = new Map<number, SitemapTranslationRow[]>();
  for (const row of (data ?? []) as SitemapTranslationRow[]) {
    if (!isArticleLocale(row.locale)) {
      continue;
    }
    const rows = grouped.get(row.article_id) ?? [];
    rows.push(row);
    grouped.set(row.article_id, rows);
  }

  for (const [articleId, rows] of grouped) {
    // `availableLocales` applies the same "a translation needs a title" rule
    // the reader-facing switcher uses, so the sitemap never advertises a
    // language the article does not actually render in.
    const locales = availableLocales(rows);
    if (locales.length > 1) {
      byArticle.set(articleId, locales);
    }
  }

  return byArticle;
}

export const getPublishedArticleSitemapEntries = unstable_cache(
  async (): Promise<MetadataRoute.Sitemap> => {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('articles')
      .select('id, slug, topic, updated_at, published_at, created_at')
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

    const translatedLocales = await fetchTranslatedLocales(supabase);
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

      // Translations are announced as xhtml:link alternates on the English
      // entry rather than as separate <url> entries, which is how Google
      // wants a translation set expressed in a sitemap.
      const locales = translatedLocales.get(article.id);
      const languages = locales
        ? Object.fromEntries(
            locales.map(locale => [
              locale,
              `${SITE_ORIGIN}${articleLocalePath(basePath, slug, locale)}`,
            ]),
          )
        : null;

      entries.set(url, {
        url,
        lastModified: getLastModified(article),
        changeFrequency: article.topic === 'reviews' ? 'monthly' : 'weekly',
        priority: 0.8,
        ...(languages ? { alternates: { languages } } : {}),
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
