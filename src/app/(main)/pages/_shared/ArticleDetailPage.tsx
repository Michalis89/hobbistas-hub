import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { ArticleCategory, ArticleRow, ArticleTopic } from '@/types/database';
import ReadingProgress from '@/app/components/article/ReadingProgress.client';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_URL } from '@/config/site';
import { CATEGORY_LABELS, TOPIC_LABELS } from '@/app/(main)/articles/constants';
import { sanitizeHtmlContent } from '@/utils/security/sanitizeHtml';
import getSupabaseServer from '@/lib/supabase-server';
import { normalizeSlug } from '@/utils/slugify';
import { buildArticleJsonLd, buildReviewJsonLd } from '@/lib/seo/jsonld';
import TrackArticleView from '@/app/components/article/TrackArticleView.client';
import { parseArticleDoc } from '@/components/article/ArticleBody';
import { tocFromDoc, tocFromHtml } from '@/lib/articles/toc';
import ArticleToc from '@/components/article/ArticleToc.client';
import { verifyPreviewToken } from '@/lib/articles/previewToken';
import {
  applyArticleTranslation,
  articleLocaleAlternates,
  articleLocalePath,
  availableLocales,
  findTranslation,
  isArticleLocale,
  resolveArticleLocale,
  ARTICLE_OG_LOCALES,
  type ArticleLocale,
  type ArticleTranslationRow,
} from '@/lib/articles/locales';
import ArticleLanguageSwitcher from '@/app/components/article/ArticleLanguageSwitcher';
import {
  ArticleBodySection,
  ArticleHeroSection,
  RelatedArticlesSection,
  type RelatedArticleCard,
} from './ArticleDetailPage.sections';

type MaybePromise<T> = T | Promise<T>;

interface ArticleWithAuthor extends ArticleRow {
  users?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

type ArticleMetadataRow = Pick<
  ArticleRow,
  | 'id'
  | 'status'
  | 'slug'
  | 'title'
  | 'description'
  | 'meta_title'
  | 'meta_description'
  | 'cover_image'
  | 'published_at'
  | 'updated_at'
  | 'topic'
  | 'tags'
  | 'category'
> & {
  users?: {
    username: string;
    display_name: string | null;
  } | null;
};

export interface ArticleDetailPageOptions {
  basePath: `/${string}`;
  breadcrumbLabel: string;
  topicFilter?: ArticleTopic;
}

export interface ArticleDetailPageProps extends ArticleDetailPageOptions {
  params: MaybePromise<{ slug: string }>;
  searchParams?: MaybePromise<{ preview?: string; lang?: string }>;
}

interface ArticleMetadataArgs {
  params: MaybePromise<{ slug: string }>;
  searchParams?: MaybePromise<{ preview?: string; lang?: string }>;
  options: ArticleDetailPageOptions;
}

const buildSlugCandidates = (value: string) => {
  const normalized = normalizeSlug(value);
  return Array.from(
    new Set(
      [value, normalized, `-${normalized}`, `${normalized}-`, `-${normalized}-`].filter(
        candidate => candidate && candidate !== '-',
      ),
    ),
  );
};

const HEADING_REGEX = /<h2([^>]*)>(.*?)<\/h2>/gi;
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

const truncateForMeta = (value: string, maxLength = 160) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

function enrichContentHeadings(html: string) {
  const slugCounts = new Map<string, number>();

  const enriched = html.replace(HEADING_REGEX, (match, attrs, inner) => {
    const textContent = inner.replace(/<[^>]+>/g, '').trim();
    if (!textContent) {
      return match;
    }

    const normalizedAttrs = attrs;
    const existingIdMatch = normalizedAttrs.match(/id\s*=\s*["']([^"']+)["']/i);
    let headingId = existingIdMatch?.[1];

    const decodedTitle = textContent.replace(/&amp;+/gi, '&');
    const baseId = normalizeSlug(decodedTitle) || 'section';
    const occurrence = slugCounts.get(baseId) ?? 0;
    const slugId = occurrence === 0 ? baseId : `${baseId}-${occurrence}`;
    slugCounts.set(baseId, occurrence + 1);

    if (!headingId) {
      headingId = slugId;
    } else {
      headingId = slugId;
    }

    const attrsWithoutId = normalizedAttrs.replace(/id\s*=\s*["'][^"']+["']/i, '').trim();
    const attrWithId = attrsWithoutId ? `${attrsWithoutId} id="${headingId}"` : `id="${headingId}"`;
    const normalizedAttrString = ` ${attrWithId.trim()}`;

    return `<h2${normalizedAttrString}>${inner}</h2>`;
  });

  return enriched;
}

async function fetchRelatedArticles(
  article: ArticleWithAuthor,
  limit = 3,
): Promise<RelatedArticleCard[]> {
  const supabase = getSupabaseServer();
  const buildQuery = (filters: { topic?: ArticleTopic | null; category?: string | null }) => {
    let query = supabase
      .from('articles')
      .select(
        'id, slug, title, description, cover_image, category, topic, published_at, views, likes',
      )
      .eq('status', 'published')
      .neq('id', article.id)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (filters.topic) {
      query = query.eq('topic', filters.topic);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    return query;
  };

  const execute = async (filters: { topic?: ArticleTopic | null; category?: string | null }) => {
    const { data, error } = await buildQuery(filters);
    if (error) {
      console.error('Related articles fetch error:', error);
      return null;
    }
    return (data ?? []) as RelatedArticleCard[];
  };

  const byTopicAndCategory = await execute({ topic: article.topic, category: article.category });
  if (byTopicAndCategory && byTopicAndCategory.length > 0) {
    return byTopicAndCategory;
  }

  const byCategoryOnly = await execute({ category: article.category });
  if (byCategoryOnly && byCategoryOnly.length > 0) {
    return byCategoryOnly;
  }

  return [];
}

async function fetchArticle(
  slug: string,
  topicFilter?: ArticleTopic,
  previewToken?: string,
): Promise<ArticleWithAuthor | null> {
  const supabase = getSupabaseServer();
  const slugCandidates = buildSlugCandidates(slug);

  let query = supabase
    .from('articles')
    .select('*, users!author_id(username, display_name, avatar_url)')
    .in('slug', slugCandidates);

  // The status filter is dropped only when a preview token is supplied, and the
  // token is then checked against the article that was actually found - so a
  // token for one draft cannot reveal another.
  if (!previewToken) {
    query = query.eq('status', 'published');
  }

  if (topicFilter) {
    query = query.eq('topic', topicFilter);
  }

  const { data: article, error } = await query.limit(1).single<ArticleWithAuthor>();
  if (error || !article) {
    return null;
  }

  // Only the preview path can surface an unpublished row; without a token the
  // query above already restricted the result to published articles.
  if (
    previewToken &&
    article.status !== 'published' &&
    !verifyPreviewToken(previewToken, article.id)
  ) {
    return null;
  }

  // Use live likes count from the relation table so UI stays accurate even if
  // the denormalized `articles.likes` column is stale.
  const { count: liveLikesCount } = await supabase
    .from('article_likes')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', article.id);

  if (typeof liveLikesCount === 'number') {
    article.likes = liveLikesCount;
  }

  return article;
}

/**
 * Every translation this article has.
 *
 * Fetched in full rather than filtered to one locale: the switcher needs to
 * know which languages exist, and at two rows per article that is cheaper than
 * a second round trip.
 */
async function fetchArticleTranslations(articleId: number): Promise<ArticleTranslationRow[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('article_translations')
    .select(
      'article_id, locale, title, description, content_rich, content_html, meta_title, meta_description',
    )
    .eq('article_id', articleId);

  if (error) {
    // A missing translation table or a failed read must not take the article
    // down with it - English is always on the article row itself.
    console.warn('Could not load article translations:', error.message);
    return [];
  }
  return data ?? [];
}

/** The reader's saved reading language, if they have one. */
async function fetchReaderLocale(userId: string | null): Promise<ArticleLocale | null> {
  if (!userId) {
    return null;
  }
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from('users')
    .select('language_preference')
    .eq('id', userId)
    .maybeSingle();

  const preference = (data as { language_preference?: unknown } | null)?.language_preference;
  return isArticleLocale(preference) ? preference : null;
}

async function fetchArticleMetadata(
  slug: string,
  topicFilter?: ArticleTopic,
  previewToken?: string,
): Promise<ArticleMetadataRow | null> {
  const supabase = getSupabaseServer();
  const slugCandidates = buildSlugCandidates(slug);

  let query = supabase
    .from('articles')
    .select(
      'id, status, slug, title, description, meta_title, meta_description, cover_image, published_at, updated_at, topic, tags, category, users!author_id(username, display_name)',
    )
    .in('slug', slugCandidates);

  if (!previewToken) {
    query = query.eq('status', 'published');
  }

  if (topicFilter) {
    query = query.eq('topic', topicFilter);
  }

  const { data: article, error } = await query.limit(1).single<ArticleMetadataRow>();
  if (error || !article) {
    return null;
  }

  // Only the preview path can surface an unpublished row; without a token the
  // query above already restricted the result to published articles.
  if (
    previewToken &&
    article.status !== 'published' &&
    !verifyPreviewToken(previewToken, article.id)
  ) {
    return null;
  }

  return article;
}

export async function buildArticleDetailMetadata({
  params,
  searchParams,
  options: { basePath, topicFilter },
}: ArticleMetadataArgs) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const previewToken = resolvedSearchParams?.preview;
  const sourceArticle = await fetchArticleMetadata(slug, topicFilter, previewToken);

  if (!sourceArticle) {
    notFound();
  }

  // The tab title, the OG card and the page body have to agree. Resolved the
  // same way as the page itself, minus the reader's saved preference: metadata
  // is cached per URL, so it can only depend on the URL.
  const translations = await fetchArticleTranslations(sourceArticle.id);
  const metadataLocale = resolveArticleLocale({
    requested: resolvedSearchParams?.lang,
    available: availableLocales(translations),
  });
  const article = applyArticleTranslation(
    { ...sourceArticle, content_rich: null, content_html: null },
    findTranslation(translations, metadataLocale),
  );

  const authorName = article.users?.display_name || article.users?.username || 'Hobbistas';
  const coverImage = article.cover_image ?? undefined;
  const metaTitle = article.meta_title || article.title;
  const rawMetaDescription =
    article.meta_description ||
    article.description ||
    'Stay tuned for updates or explore another story while we resolve this.';
  const metaDescription = truncateForMeta(rawMetaDescription);
  const normalizedSlug = normalizeSlug(article.slug);
  const localeOptions = availableLocales(translations);
  // Each language is its own indexable URL, so the canonical is the URL of
  // the language actually being rendered. Pointing a translation at the bare
  // English path told Google it was a duplicate of the English article and
  // kept it out of the index entirely.
  const canonicalPath = articleLocalePath(basePath, normalizedSlug, metadataLocale);
  const languages = articleLocaleAlternates(basePath, normalizedSlug, localeOptions);
  const modifiedTime = article.updated_at ?? article.published_at ?? undefined;

  return buildMetadata({
    title: metaTitle,
    description: metaDescription,
    path: canonicalPath,
    openGraphType: 'article',
    ...(languages ? { languages } : {}),
    ogLocale: ARTICLE_OG_LOCALES[metadataLocale],
    ogAlternateLocales: localeOptions
      .filter(locale => locale !== metadataLocale)
      .map(locale => ARTICLE_OG_LOCALES[locale]),
    // A preview link must never end up in an index.
    noindex: article.status !== 'published',
    publishedTime: article.published_at ?? undefined,
    modifiedTime,
    authors: [authorName],
    images: coverImage
      ? [{ url: coverImage, alt: article.title, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }]
      : undefined,
  });
}

export default async function ArticleDetailPage({
  params,
  searchParams,
  basePath,
  breadcrumbLabel,
  topicFilter,
}: ArticleDetailPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const previewToken = resolvedSearchParams?.preview;
  const requestedLocale = resolvedSearchParams?.lang;
  const isPublicReviewPage = basePath === '/review';
  let currentUserId: string | null = null;
  let showSocialLayerSections = false;
  try {
    const { createRouteHandlerClient } = await import('@/lib/supabase-route-handler');
    const sessionClient = await createRouteHandlerClient();
    const {
      data: { session },
    } = await sessionClient.auth.getSession();
    currentUserId = session?.user.id ?? null;

    if (currentUserId) {
      const { getUserSettings } = await import('@/lib/settings');
      const settings = await getUserSettings(currentUserId, { supabase: sessionClient });
      showSocialLayerSections = settings.social_enabled;
    }
  } catch {
    // Public rendering should not fail when auth cookies are stale/expired
    // or settings fetch fails.
    currentUserId = null;
    showSocialLayerSections = false;
  }
  const showEngagementUi = Boolean(currentUserId) && showSocialLayerSections;
  const sourceArticle = await fetchArticle(slug, topicFilter, previewToken);

  if (!sourceArticle) {
    notFound();
  }

  // Language is resolved before anything is derived from the article, so the
  // title, the metadata, the table of contents and the structured data all
  // describe the same version the reader is looking at.
  const translations = await fetchArticleTranslations(sourceArticle.id);
  const localeOptions = availableLocales(translations);
  const [readerLocale, requestHeaders] = await Promise.all([
    fetchReaderLocale(currentUserId),
    headers(),
  ]);
  const activeLocale: ArticleLocale = resolveArticleLocale({
    requested: requestedLocale,
    userPreference: readerLocale,
    acceptLanguage: requestHeaders.get('accept-language'),
    available: localeOptions,
  });
  const article = applyArticleTranslation(
    sourceArticle,
    findTranslation(translations, activeLocale),
  );

  const hasCategory = Boolean(article.category);
  const ARTICLE_HEADER_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  const readTime = article.reading_time_minutes ? `${article.reading_time_minutes} min read` : null;
  const articleSlug = normalizeSlug(article.slug);
  const articlePath = `${basePath}/${articleSlug}`;
  // `articlePath` stays bare - the language switcher appends its own `?lang=`.
  // JSON-LD and the breadcrumb point at the language on screen, so their
  // URLs agree with the canonical the head declares for this render.
  const articleLocaleUrl = `${SITE_URL}${articleLocalePath(basePath, articleSlug, activeLocale)}`;
  const sanitizedContentHtml = sanitizeHtmlContent(article.content_html).trim();
  const contentWithHeadingIds = enrichContentHeadings(sanitizedContentHtml);
  // Rich documents carry heading structure directly; legacy HTML is read back
  // from the ids that enrichContentHeadings just injected.
  const richDoc = parseArticleDoc(article.content_rich);
  const tocEntries = richDoc ? tocFromDoc(richDoc) : tocFromHtml(contentWithHeadingIds);
  const relatedArticles = await fetchRelatedArticles(article);
  const relatedContentLabel = article.topic === 'reviews' ? 'reviews' : 'articles';
  const categoryLabel = CATEGORY_LABELS[article.category] ?? article.category;
  const uiBreadcrumbs = [
    { label: 'Home', href: '/dashboard' },
    { label: breadcrumbLabel, href: basePath },
    ...(hasCategory
      ? [{ label: categoryLabel, href: `${basePath}?category=${article.category}` }]
      : []),
    { label: article.title },
  ];

  const breadcrumbItems = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: breadcrumbLabel, url: `${SITE_URL}${basePath}` },
    { name: categoryLabel, url: `${SITE_URL}${basePath}?category=${article.category}` },
    { name: article.title, url: articleLocaleUrl },
  ];
  const articleDescription =
    article.meta_description || article.description || 'Explore this entry on Hobbistas.';
  const NON_REVIEW_SCHEMA_CATEGORIES: ArticleCategory[] = ['coding'];
  const useReviewSchema =
    article.topic === 'reviews' && !NON_REVIEW_SCHEMA_CATEGORIES.includes(article.category);
  const jsonLd = useReviewSchema
    ? buildReviewJsonLd({
        title: article.title,
        description: articleDescription,
        url: articleLocaleUrl,
        image: article.cover_image,
        publishedAt: article.published_at,
        updatedAt: article.updated_at,
        authorName: article.users?.display_name || article.users?.username || null,
        locale: activeLocale,
        category: article.category,
        tags: article.tags,
        score: article.score,
      })
    : buildArticleJsonLd({
        title: article.title,
        description: articleDescription,
        url: articleLocaleUrl,
        image: article.cover_image,
        publishedAt: article.published_at,
        updatedAt: article.updated_at,
        authorName: article.users?.display_name || article.users?.username || null,
        locale: activeLocale,
        tags: article.tags,
      });
  const jsonLdMarkup = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {isPublicReviewPage && currentUserId !== article.author_id ? (
        <TrackArticleView articleId={article.id} />
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdMarkup }} />
      <StructuredData data={getBreadcrumbStructuredData(breadcrumbItems)} />
      <ReadingProgress />
      {article.status !== 'published' && (
        <div className="sticky top-0 z-40 border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm font-medium text-foreground">
          Preview of an unpublished {article.status} article. This link is private and expires.
        </div>
      )}
      <ArticleHeroSection title={article.title} coverImage={article.cover_image} />
      {/*
        Three columns so the article card stays optically centred on the page,
        exactly as it renders in production, while the table of contents lives
        in the right-hand gutter instead of pushing the card off-centre.
      */}
      <div className="relative mx-auto -mt-14 max-w-[92rem] px-3 pb-16 sm:px-4 md:-mt-20">
        <div className="xl:grid xl:grid-cols-[1fr_minmax(0,64rem)_1fr] xl:gap-8">
          <div aria-hidden className="hidden xl:block" />

          {/*
            `lang` on the element, not just the page: it is what tells a screen
            reader which voice to use and the browser how to hyphenate, and it
            is the one thing that actually differs between the two versions.
          */}
          <article
            lang={activeLocale}
            className="rounded-3xl border border-border bg-card p-4 shadow-2xl sm:p-6 md:p-10"
          >
            {localeOptions.length > 1 ? (
              <div className="mb-4 flex justify-end">
                <ArticleLanguageSwitcher
                  available={localeOptions}
                  active={activeLocale}
                  articlePath={articlePath}
                  previewToken={previewToken}
                />
              </div>
            ) : null}
            <ArticleBodySection
              uiBreadcrumbs={uiBreadcrumbs}
              categoryLabel={categoryLabel}
              topicLabel={TOPIC_LABELS[article.topic]}
              isReview={article.topic === 'reviews'}
              score={article.score}
              title={article.title}
              description={article.description}
              article={article}
              readTime={readTime}
              dateOptions={ARTICLE_HEADER_DATE_OPTIONS}
              showEngagementUi={showEngagementUi}
              contentWithHeadingIds={contentWithHeadingIds}
              contentRich={article.content_rich}
            />
            <RelatedArticlesSection
              relatedArticles={relatedArticles}
              relatedContentLabel={relatedContentLabel}
              basePath={basePath}
              showEngagementUi={showEngagementUi}
            />
          </article>

          <div className="hidden xl:block">
            <ArticleToc entries={tocEntries} />
          </div>
        </div>
      </div>
    </div>
  );
}
