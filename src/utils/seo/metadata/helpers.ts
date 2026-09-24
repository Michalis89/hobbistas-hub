import type { Metadata } from 'next';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
} from '@/config/site';

type MetadataInput = {
  title: string;
  description?: string;
  path: string;
  images?: Array<{ url: string; alt?: string; width?: number; height?: number }>;
  openGraphType?: 'website' | 'article';
  publishedTime?: string;
  authors?: string[];
  modifiedTime?: string;
  noindex?: boolean;
  /**
   * hreflang map, `tag -> path`, emitted as `<link rel="alternate">`. Include
   * this page's own tag: Google needs the annotations to be reciprocal.
   */
  languages?: Record<string, string>;
  /** `og:locale` for this page, in Open Graph's `en_US` underscore form. */
  ogLocale?: string;
  /** Other languages this page exists in, as `og:locale:alternate`. */
  ogAlternateLocales?: string[];
};

const toAbsoluteUrl = (path: string) => new URL(path, SITE_URL).toString();
const trimText = (value: string, maxLength = 160) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

const normalizeCanonicalPath = (value: string) => {
  const url = new URL(value, SITE_URL);
  const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  // The query survives normalization because a translated article is
  // addressed as `?lang=el`, and a canonical that dropped it would point
  // every language at the English page. Callers pass literal paths, so
  // nothing else reaches this with a query string.
  return `${pathname || '/'}${url.search}`;
};

const SITE_TITLE_SUFFIX = `| ${SITE_NAME}`;
const SITE_TITLE_DASH_SUFFIX = `- ${SITE_NAME}`;

const normalizeTitle = (title: string) => {
  const trimmed = title.trim();
  if (trimmed.endsWith(SITE_TITLE_SUFFIX)) {
    return trimmed.slice(0, -SITE_TITLE_SUFFIX.length).trim();
  }
  if (trimmed.endsWith(SITE_TITLE_DASH_SUFFIX)) {
    return trimmed.slice(0, -SITE_TITLE_DASH_SUFFIX.length).trim();
  }
  return trimmed;
};

const buildImages = (
  images?: Array<{ url: string; alt?: string; width?: number; height?: number }>,
) => {
  if (images && images.length > 0) {
    return images.map(image => ({
      url: image.url.startsWith('http') ? image.url : toAbsoluteUrl(image.url),
      alt: image.alt || DEFAULT_OG_IMAGE_ALT,
      width: image.width,
      height: image.height,
    }));
  }
  return [
    {
      url: toAbsoluteUrl(DEFAULT_OG_IMAGE),
      alt: DEFAULT_OG_IMAGE_ALT,
      width: 1200,
      height: 630,
    },
  ];
};

export const buildMetadata = (input: MetadataInput): Metadata => {
  const resolvedTitle = normalizeTitle(input.title);
  const resolvedDescription = trimText(input.description ?? DEFAULT_DESCRIPTION);

  const canonicalPath = normalizeCanonicalPath(input.path);
  const canonicalUrl = new URL(canonicalPath, SITE_URL);
  const url = canonicalUrl.toString();

  const ogImages = buildImages(input.images);

  const isArticle = input.openGraphType === 'article';

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    alternates: {
      canonical: canonicalUrl,
      ...(input.languages ? { languages: input.languages } : {}),
    },
    openGraph: {
      title: resolvedTitle,
      description: resolvedDescription,
      url,
      siteName: SITE_NAME,
      // Open Graph spells locales `en_US`, not `en-US`; SITE_LOCALE is the
      // hreflang-shaped constant, so it is converted rather than passed on.
      locale: input.ogLocale ?? SITE_LOCALE.replace('-', '_'),
      ...(input.ogAlternateLocales?.length
        ? { alternateLocale: input.ogAlternateLocales }
        : {}),
      type: input.openGraphType ?? 'website',
      images: ogImages,
      ...(isArticle && input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(isArticle && input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
      ...(isArticle && input.authors ? { authors: input.authors } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedTitle,
      description: resolvedDescription,
      images: ogImages.map(i => i.url),
    },
    ...(input.noindex
      ? {
          robots: { index: false, follow: false },
        }
      : {}),
  };
};
