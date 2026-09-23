import type { ArticleCategory, ArticleTopic } from '@/types/database';
import type { ContentPublicationType } from '@/app/constants/contentEvents';

export type ContentType = ContentPublicationType;

export type CategoryConfig = {
  label: string;
  topics: { value: ArticleTopic; label: string }[];
};

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'review', label: 'Review' },
];

/** Categories that can carry a review, i.e. the ones backed by media items. */
export const REVIEW_CATEGORIES: ArticleCategory[] = [
  'games',
  'anime',
  'manga',
  'books',
  'movies',
  'tv',
  'vape',
];

export const CATEGORIES: Record<ArticleCategory, CategoryConfig> = {
  games: { label: 'Games', topics: [{ value: 'articles', label: 'Articles' }] },
  anime: { label: 'Anime', topics: [{ value: 'articles', label: 'Articles' }] },
  manga: { label: 'Manga', topics: [{ value: 'articles', label: 'Articles' }] },
  books: { label: 'Books', topics: [{ value: 'articles', label: 'Articles' }] },
  movies: { label: 'Movies', topics: [{ value: 'articles', label: 'Articles' }] },
  tv: { label: 'TV Series', topics: [{ value: 'articles', label: 'Articles' }] },
  coding: {
    label: 'Coding',
    topics: [
      { value: 'articles', label: 'Articles' },
      { value: 'tutorials', label: 'Tutorials' },
      { value: 'weird-cases', label: 'Weird Cases' },
    ],
  },
  pet: {
    label: 'Pet',
    topics: [
      { value: 'articles', label: 'Articles' },
      { value: 'care', label: 'Care' },
      { value: 'experiences', label: 'Experiences' },
      { value: 'health', label: 'Health' },
    ],
  },
  vape: {
    label: 'Vape',
    topics: [
      { value: 'articles', label: 'Articles' },
      { value: 'devices', label: 'Vapes/Devices' },
      { value: 'liquids', label: 'Liquids' },
      { value: 'experiences', label: 'Experiences' },
    ],
  },
};

/** Search endpoints used to attach a media item to an article. */
export const MEDIA_LINKABLE: Partial<Record<ArticleCategory, string>> = {
  anime: '/api/anime/search?category=anime',
  manga: '/api/anime/search?category=manga',
  games: '/api/games/search',
  movies: '/api/movies/search?category=movies',
  tv: '/api/movies/search?category=tv',
  books: '/api/books/search',
};

export type MediaSearchItem = {
  mediaId: number;
  title: string;
  cover: string;
  source: string;
};

/** TipTap emits an empty paragraph for a blank document; drop those. */
export const stripEmptyParagraphs = (html: string): string =>
  html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');

export function availableTopicsFor(
  category: ArticleCategory | '',
  contentType: ContentType,
): { value: ArticleTopic; label: string }[] {
  if (!category) {
    return [];
  }
  if (contentType === 'review') {
    return [{ value: 'reviews', label: 'Reviews' }];
  }
  return CATEGORIES[category].topics;
}

export function availableCategoriesFor(contentType: ContentType): ArticleCategory[] {
  return contentType === 'review'
    ? REVIEW_CATEGORIES
    : (Object.keys(CATEGORIES) as ArticleCategory[]);
}

export function mediaSearchEndpointFor(category: ArticleCategory | ''): string | null {
  return category ? (MEDIA_LINKABLE[category] ?? null) : null;
}
