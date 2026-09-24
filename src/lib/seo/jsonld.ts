import {
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_URL,
} from '@/config/site';
import type { ArticleCategory } from '@/types/database';
import type { MediaCategory } from '@/app/components/backlog/types';

type Person = {
  '@type': 'Person';
  name: string;
};

type Organization = {
  '@type': 'Organization';
  name: string;
  url: string;
};

const publisher: Organization = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
};

const toAbsoluteUrl = (value: string) => {
  if (!value) {
    return new URL(DEFAULT_OG_IMAGE, SITE_URL).toString();
  }
  return value.startsWith('http') ? value : new URL(value, SITE_URL).toString();
};

const trimText = (value: string, maxLength = 160) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

type ArticleJsonLdInput = {
  title: string;
  description?: string | null;
  url: string;
  image?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  authorName?: string | null;
  tags?: string[] | null;
  /** Reading language of this version, as a BCP-47 tag. */
  locale?: string | null;
};

type ReviewJsonLdInput = {
  title: string;
  description?: string | null;
  url: string;
  image?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  authorName?: string | null;
  category?: ArticleCategory | null;
  tags?: string[] | null;
  score?: number | null;
  /** Reading language of this version, as a BCP-47 tag. */
  locale?: string | null;
};

type MediaJsonLdInput = {
  title: string;
  description?: string | null;
  url: string;
  image?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  category?: MediaCategory | null;
};

const categoryToItemType: Record<ArticleCategory, string> = {
  games: 'VideoGame',
  anime: 'TVSeries',
  manga: 'Book',
  books: 'Book',
  movies: 'Movie',
  tv: 'TVSeries',
  coding: 'SoftwareApplication',
  pet: 'Product',
  vape: 'Product',
};

export function buildArticleJsonLd({
  title,
  description,
  url,
  image,
  publishedAt,
  updatedAt,
  authorName,
  tags,
  locale,
}: ArticleJsonLdInput) {
  const author: Person = {
    '@type': 'Person',
    name: authorName?.trim() || SITE_NAME,
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: trimText(description || ''),
    image: [toAbsoluteUrl(image || DEFAULT_OG_IMAGE)],
    datePublished: publishedAt ?? undefined,
    dateModified: updatedAt ?? publishedAt ?? undefined,
    author,
    publisher,
    // Tells Google which translation this markup describes; without it every
    // language of an article claims to be the site default.
    inLanguage: locale || SITE_LANGUAGE,
    keywords: tags?.length ? tags.join(', ') : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': toAbsoluteUrl(url),
    },
  };
}

export function buildReviewJsonLd({
  title,
  description,
  url,
  image,
  publishedAt,
  updatedAt,
  authorName,
  category,
  tags,
  score,
  locale,
}: ReviewJsonLdInput) {
  const author: Person = {
    '@type': 'Person',
    name: authorName?.trim() || SITE_NAME,
  };
  const itemType = (category && categoryToItemType[category]) || 'CreativeWork';

  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    name: title,
    reviewBody: description || '',
    datePublished: publishedAt ?? undefined,
    dateModified: updatedAt ?? publishedAt ?? undefined,
    author,
    publisher,
    inLanguage: locale || SITE_LANGUAGE,
    image: [toAbsoluteUrl(image || DEFAULT_OG_IMAGE)],
    reviewRating:
      score != null
        ? {
            '@type': 'Rating',
            ratingValue: score,
            bestRating: 10,
            worstRating: 1,
          }
        : undefined,
    itemReviewed: {
      '@type': itemType,
      name: title,
      image: toAbsoluteUrl(image || DEFAULT_OG_IMAGE),
      genre: tags?.length ? tags : undefined,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': toAbsoluteUrl(url),
    },
  };
}

const mediaCategoryToItemType: Record<MediaCategory, string> = {
  games: 'VideoGame',
  anime: 'TVSeries',
  movies: 'Movie',
  books: 'Book',
  manga: 'Book',
  tv: 'TVSeries',
};

export function buildMediaJsonLd({
  title,
  description,
  url,
  image,
  publishedAt,
  updatedAt,
  category,
}: MediaJsonLdInput) {
  const itemType = (category && mediaCategoryToItemType[category]) || 'CreativeWork';

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: toAbsoluteUrl(url),
    name: title,
    description: trimText(description || ''),
    inLanguage: SITE_LANGUAGE,
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: toAbsoluteUrl(image || DEFAULT_OG_IMAGE),
    },
    datePublished: publishedAt ?? undefined,
    dateModified: updatedAt ?? publishedAt ?? undefined,
    publisher,
    mainEntity: {
      '@type': itemType,
      name: title,
      url: toAbsoluteUrl(url),
      description: trimText(description || ''),
      image: toAbsoluteUrl(image || DEFAULT_OG_IMAGE),
      datePublished: publishedAt ?? undefined,
      dateModified: updatedAt ?? publishedAt ?? undefined,
    },
  };
}

export { DEFAULT_OG_IMAGE_ALT };
