/**
 * Reading languages for articles and reviews.
 *
 * `en` is the source language: it lives on the `articles` row itself. Every
 * other locale is a row in `article_translations`, so adding one here plus the
 * matching check constraint is the whole change.
 */
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
export function findTranslation(
  translations: readonly ArticleTranslationRow[] | null | undefined,
  locale: ArticleLocale,
): ArticleTranslationRow | null {
  if (locale === SOURCE_ARTICLE_LOCALE) {
    return null;
  }
  return (translations ?? []).find(row => row.locale === locale) ?? null;
}
