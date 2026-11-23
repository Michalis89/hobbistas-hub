import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeriesDatabase } from './seriesDatabase';
import getSupabaseServer from '@/lib/supabase-server';
import { articleLocalePath, type ArticleLocale } from './locales';
import { normalizeSlug } from '@/utils/slugify';

export type PublicChapter = {
  id: number;
  slug: string;
  title: string;
  topic: string;
  published_at: string | null;
  title_el?: string;
};
export type PublicSeries = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  translation: { title: string; description: string | null } | null;
  chapters: PublicChapter[];
};

// One lookup per request. generateMetadata and the page both ask for the same
// series, so the cache is keyed by primitives, not by the key object.
const publicSeriesBySlug = cache((slug: string) => loadPublicSeries({ slug }));
const publicSeriesByArticle = cache((articleId: number) => loadPublicSeries({ articleId }));

/**
 * The public view of a series: only when the series is published and has at
 * least one published chapter, and only its published chapters, numbered
 * consecutively. Draft chapters' ids, titles, positions and counts never leave
 * this function.
 */
export function getPublicSeries(
  key: { slug: string } | { articleId: number },
): Promise<PublicSeries | null> {
  return 'slug' in key ? publicSeriesBySlug(key.slug) : publicSeriesByArticle(key.articleId);
}

/** The service-role client bypasses RLS: all public reads below filter visibility explicitly. */
async function loadPublicSeries(
  key: { slug: string } | { articleId: number },
): Promise<PublicSeries | null> {
  const db = getSupabaseServer() as unknown as SupabaseClient<SeriesDatabase>;
  let seriesId: number | undefined;
  if ('articleId' in key) {
    const { data, error } = await db
      .from('article_series_chapters')
      .select('series_id')
      .eq('article_id', key.articleId)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    seriesId = data.series_id;
  }
  let query = db
    .from('article_series')
    .select('id,slug,title,description,cover_image')
    .eq('status', 'published');
  if ('slug' in key) {
    query = query.eq('slug', key.slug);
  } else if (seriesId !== undefined) {
    query = query.eq('id', seriesId);
  } else {
    return null;
  }
  const { data: series, error: seriesError } = await query.maybeSingle();
  if (seriesError || !series) {
    return null;
  }
  const [{ data: memberships, error: chaptersError }, { data: translation }] = await Promise.all([
    db
      .from('article_series_chapters')
      .select('article_id,position')
      .eq('series_id', series.id)
      .order('position'),
    db
      .from('article_series_translations')
      .select('title,description')
      .eq('series_id', series.id)
      .eq('locale', 'el')
      .maybeSingle(),
  ]);
  if (chaptersError || !memberships?.length) {
    return null;
  }
  const ids = memberships.map(row => row.article_id as number);
  const { data: articles, error: articleError } = await db
    .from('articles')
    .select('id,slug,title,topic,published_at')
    .in('id', ids)
    .eq('status', 'published')
    .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`);
  if (articleError || !articles?.length) {
    return null;
  }
  const byId = new Map(articles.map(article => [article.id, article as PublicChapter]));
  const chapters = ids.flatMap(id => {
    const article = byId.get(id);
    return article ? [article] : [];
  });
  if (
    !chapters.length ||
    ('articleId' in key && !chapters.some(chapter => chapter.id === key.articleId))
  ) {
    return null;
  }
  const { data: translations } = await db
    .from('article_translations')
    .select('article_id,title')
    .eq('locale', 'el')
    .in(
      'article_id',
      chapters.map(chapter => chapter.id),
    );
  const titles = new Map((translations ?? []).map(row => [row.article_id, row.title]));
  for (const chapter of chapters) {
    chapter.title_el = titles.get(chapter.id) || undefined;
  }
  return { ...series, translation: translation ?? null, chapters } as PublicSeries;
}

export function chapterPath(chapter: PublicChapter, locale: ArticleLocale): string {
  const path = articleLocalePath(
    chapter.topic === 'reviews' ? '/review' : '/articles',
    normalizeSlug(chapter.slug),
    locale,
  );
  // Explicit English avoids an article's preference-driven language selection.
  return locale === 'en' ? `${path}?lang=en` : path;
}

export function seriesPath(slug: string, locale: ArticleLocale): string {
  return articleLocalePath('/series', slug, locale);
}
