/**
 * Reading languages for articles and reviews.
 *
 * `en` is the source language: it lives on the `articles` row itself. Every
 * other locale is a row in `article_translations`, so adding one here plus the
 * matching check constraint is the whole change.
 */
import { SITE_NAME } from '@/config/site';

export const ARTICLE_LOCALES = ['en', 'el'] as const;

export type ArticleLocale = (typeof ARTICLE_LOCALES)[number];

/** The locale stored on `articles` rather than in `article_translations`. */
export const SOURCE_ARTICLE_LOCALE: ArticleLocale = 'en';

export const ARTICLE_LOCALE_LABELS: Record<ArticleLocale, string> = {
  en: 'English',
  el: 'Ελληνικά',
};

/** Short form for the switcher, where space is tight. */
export const ARTICLE_LOCALE_SHORT_LABELS: Record<ArticleLocale, string> = {
  en: 'EN',
  el: 'ΕΛ',
};

export function isArticleLocale(value: unknown): value is ArticleLocale {
  return typeof value === 'string' && (ARTICLE_LOCALES as readonly string[]).includes(value);
}

/** Narrows anything to a locale, falling back to the source language. */
export function toArticleLocale(value: unknown): ArticleLocale {
  return isArticleLocale(value) ? value : SOURCE_ARTICLE_LOCALE;
}

/**
 * Reads a locale out of an `Accept-Language` header.
 *
 * Quality values are deliberately ignored: with two languages, the first
 * recognised tag is the answer, and parsing `q=` would add a parser for no
 * behavioural difference.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): ArticleLocale | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    if (!tag) {
      continue;
    }
    const base = tag.split('-')[0];
    if (isArticleLocale(base)) {
      return base;
    }
  }
  return null;
}

/**
 * Decides which language to render in.
 *
 * Order matters and is deliberate:
 *  1. An explicit `?lang=` wins - somebody just clicked the switcher, and it
 *     has to beat their stored preference or the button would appear broken.
 *  2. The reader's saved preference.
 *  3. What their browser asks for.
 *  4. The source language.
 *
 * The result is then narrowed to what this article actually has, so a reader
 * whose preference is Greek still sees an untranslated piece rather than a
 * blank one.
 */
export function resolveArticleLocale({
  requested,
  userPreference,
  acceptLanguage,
  available,
}: {
  requested?: unknown;
  userPreference?: unknown;
  acceptLanguage?: string | null;
  available?: readonly ArticleLocale[];
}): ArticleLocale {
  const preferred =
    (isArticleLocale(requested) ? requested : null) ??
    (isArticleLocale(userPreference) ? userPreference : null) ??
    localeFromAcceptLanguage(acceptLanguage) ??
    SOURCE_ARTICLE_LOCALE;

  if (!available || available.length === 0) {
    return SOURCE_ARTICLE_LOCALE;
  }
  return available.includes(preferred) ? preferred : SOURCE_ARTICLE_LOCALE;
}

/** The translatable half of an article. */
export type ArticleTranslationFields = {
  title: string;
  description: string | null;
  // `unknown`, matching ArticleRow: the document is parsed by
  // `parseArticleDoc` at the point of use, not trusted at the type level.
  content_rich: unknown;
  content_html: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export type ArticleTranslationRow = ArticleTranslationFields & {
  article_id: number;
  locale: string;
};

/**
 * Lists the languages an article can be read in.
 *
 * The source language is always present - the article row is itself the
 * English version - and a translation only counts once it has a title, so a
 * half-started row in the studio does not light up the switcher.
 */
export function availableLocales(
  translations: readonly Pick<ArticleTranslationRow, 'locale' | 'title'>[] | null | undefined,
): ArticleLocale[] {
  const found = new Set<ArticleLocale>([SOURCE_ARTICLE_LOCALE]);
  for (const row of translations ?? []) {
    if (isArticleLocale(row.locale) && row.title.trim() !== '') {
      found.add(row.locale);
    }
  }
  return ARTICLE_LOCALES.filter(locale => found.has(locale));
}

/**
 * Overlays a translation onto an article.
 *
 * Empty fields fall through to the source rather than rendering blank: a
 * translator who filled in the title and body but left the meta description
 * alone should get the English one, not nothing.
 *
 * The `meta_*` fields here are raw per-field fallbacks. Do not build page
 * metadata from them: a translated title must beat the English meta title.
 * Use `resolveArticleSeo` for the <title>, description, Open Graph, Twitter
 * and structured data.
 */
export function applyArticleTranslation<T extends ArticleTranslationFields>(
  article: T,
  translation: ArticleTranslationFields | null | undefined,
): T {
  if (!translation) {
    return article;
  }

  const text = (translated: string | null, source: string | null) =>
    translated && translated.trim() !== '' ? translated : source;

  // Loose `!= null` on purpose: `content_rich` is `unknown`, so a row that
  // simply omits the field arrives as undefined, and a strict `!== null` would
  // read that as "has a body" and blank the article out.
  const hasBody =
    translation.content_rich != null ||
    (translation.content_html != null && translation.content_html.trim() !== '');

  return {
    ...article,
    title: translation.title.trim() !== '' ? translation.title : article.title,
    description: text(translation.description, article.description),
    // Body parts move together: mixing a Greek `content_rich` with an English
    // `content_html` fallback would render one language and cache the other.
    content_rich: hasBody ? translation.content_rich : article.content_rich,
    content_html: hasBody ? translation.content_html : article.content_html,
    meta_title: text(translation.meta_title, article.meta_title),
    meta_description: text(translation.meta_description, article.meta_description),
  };
}

/** Picks the row for one locale out of a fetched set. */
/** Where a resolved SEO value came from, for the Studio preview. */
export type ArticleSeoSource =
  'translation-meta' | 'translation-content' | 'source-meta' | 'source-content' | 'fallback';

export type ArticleSeoFields = {
  title: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export type ResolvedArticleSeo = {
  title: string;
  description: string;
  titleSource: ArticleSeoSource;
  descriptionSource: ArticleSeoSource;
};

const filled = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * The description used when an article has neither a meta description nor a
 * standfirst in any language: neutral, in the page's language, and specific
 * to the article.
 */
export function articleFallbackDescription(title: string, locale: ArticleLocale): string {
  const name = title.trim();
  if (locale === 'el') {
    return name ? `Διαβάστε «${name}» στο ${SITE_NAME}.` : `Διαβάστε το άρθρο στο ${SITE_NAME}.`;
  }
  return name ? `Read “${name}” on ${SITE_NAME}.` : `Read this article on ${SITE_NAME}.`;
}

/**
 * The title and description an article page publishes for one language, used
 * for the HTML <title> and description, Open Graph, Twitter and structured
 * data alike.
 *
 * Content in the page's language always wins over the source language:
 *   title:       translated meta title → translated title
 *                → source meta title → source title
 *   description: translated meta description → translated standfirst
 *                → source meta description → source standfirst
 *                → a neutral sentence in the page's language
 *
 * For the source language the translation is ignored. Blank and
 * whitespace-only values count as empty.
 */
export function resolveArticleSeo(
  source: ArticleSeoFields,
  translation: ArticleSeoFields | null | undefined,
  locale: ArticleLocale,
): ResolvedArticleSeo {
  const tr = locale === SOURCE_ARTICLE_LOCALE ? null : (translation ?? null);

  const pick = (candidates: Array<[ArticleSeoSource, string | null | undefined]>) => {
    for (const [from, value] of candidates) {
      const text = filled(value);
      if (text) {
        return { value: text, from };
      }
    }
    return null;
  };

  const title = pick([
    ['translation-meta', tr?.meta_title],
    ['translation-content', tr?.title],
    ['source-meta', source.meta_title],
    ['source-content', source.title],
  ]);
  const description = pick([
    ['translation-meta', tr?.meta_description],
    ['translation-content', tr?.description],
    ['source-meta', source.meta_description],
    ['source-content', source.description],
  ]);
  // The fallback names the article as readers see it in this language.
  const articleTitle = filled(tr?.title) ?? filled(source.title) ?? '';

  return {
    title: title?.value ?? '',
    titleSource: title?.from ?? 'fallback',
    description: description?.value ?? articleFallbackDescription(articleTitle, locale),
    descriptionSource: description?.from ?? 'fallback',
  };
}

export function findTranslation(
  translations: readonly ArticleTranslationRow[] | null | undefined,
  locale: ArticleLocale,
): ArticleTranslationRow | null {
  if (locale === SOURCE_ARTICLE_LOCALE) {
    return null;
  }
  return (translations ?? []).find(row => row.locale === locale) ?? null;
}

/**
 * `og:locale` form of each reading language.
 *
 * Open Graph wants `language_TERRITORY` with an underscore, which is not the
 * same shape as an hreflang tag, so the two are kept as separate maps rather
 * than derived from one another.
 */
export const ARTICLE_OG_LOCALES: Record<ArticleLocale, string> = {
  en: 'en_US',
  el: 'el_GR',
};

/**
 * The addressable URL of one language of an article.
 *
 * The source language keeps the bare path, so every English URL the site has
 * ever published stays exactly as it was; a translation is that same path
 * plus `?lang=`, which is what the switcher already links to.
 */
export function articleLocalePath(
  basePath: string,
  slug: string,
  locale: ArticleLocale,
): string {
  const path = `${basePath}/${slug}`;
  return locale === SOURCE_ARTICLE_LOCALE ? path : `${path}?lang=${locale}`;
}

/**
 * The hreflang map for one article.
 *
 * Every version lists every version, itself included: Google only treats a set
 * of pages as one translation cluster when the annotations are reciprocal, and
 * drops the lot when they are not. `x-default` points at the source language,
 * which is the version a reader of any other language should land on.
 *
 * Returns null for a single-language article — one self-referencing hreflang
 * says nothing, and emitting it would only add noise to the head.
 */
export function articleLocaleAlternates(
  basePath: string,
  slug: string,
  available: readonly ArticleLocale[],
): Record<string, string> | null {
  if (available.length < 2) {
    return null;
  }

  const languages: Record<string, string> = {};
  for (const locale of available) {
    languages[locale] = articleLocalePath(basePath, slug, locale);
  }
  languages['x-default'] = articleLocalePath(basePath, slug, SOURCE_ARTICLE_LOCALE);
  return languages;
}
