/**
 * Cache Tags and Revalidation Utilities
 *
 * Centralized cache tag definitions for Next.js cache invalidation.
 * Use these tags with `unstable_cache` for fetching and call
 * revalidation helpers after mutations.
 *
 * Strategy:
 * - Public data (games, articles) uses tag-based caching
 * - User-specific data (backlog) uses user-scoped tags
 * - Mutations trigger targeted revalidation
 */
import { revalidateTag, revalidatePath } from 'next/cache';

/**
 * Cache tag constants - use these for consistent tag naming
 */
export const CACHE_TAGS = {
  // Article-related tags
  ARTICLES: 'articles',
  ARTICLE: (id: number | string) => `article-${id}`,
  ARTICLE_COMMENTS: (articleId: number | string) => `article-${articleId}-comments`,
  ARTICLE_LIKES: (articleId: number | string) => `article-${articleId}-likes`,

  // Game-related tags
  GAMES: 'games',
  GAME: (id: number | string) => `game-${id}`,
  GAME_BY_SLUG: (slug: string) => `game-slug-${slug}`,
  GAME_TROPHIES: (gameId: number | string) => `game-${gameId}-trophies`,

  // User-specific tags (scoped to userId)
  USER_BACKLOG: (userId: string) => `user-${userId}-backlog`,
  USER_PROFILE: (userId: string) => `user-${userId}-profile`,
  USER_ACTIVITY: (userId: string) => `user-${userId}-activity`,

  // Library tags (anime, books, movies)
  USER_ANIME_LIBRARY: (userId: string) => `user-${userId}-anime`,
  USER_BOOKS_LIBRARY: (userId: string) => `user-${userId}-books`,
  USER_MOVIES_LIBRARY: (userId: string) => `user-${userId}-movies`,

  // Global tags
  ACTIVITY_FEED: 'activity-feed',
  ANALYTICS: 'analytics',
  PUBLIC_STATS: 'public-stats',
} as const;

/**
 * Structured cache tag helpers for new code.
 * Keep CACHE_TAGS for backward compatibility.
 */
export const cacheTags = {
  articles: {
    all: () => CACHE_TAGS.ARTICLES,
    byId: (id: number | string) => CACHE_TAGS.ARTICLE(id),
    comments: (id: number | string) => CACHE_TAGS.ARTICLE_COMMENTS(id),
    likes: (id: number | string) => CACHE_TAGS.ARTICLE_LIKES(id),
  },
  users: {
    backlog: (userId: string) => CACHE_TAGS.USER_BACKLOG(userId),
    profile: (userId: string) => CACHE_TAGS.USER_PROFILE(userId),
    activity: (userId: string) => CACHE_TAGS.USER_ACTIVITY(userId),
  },
  public: {
    stats: () => CACHE_TAGS.PUBLIC_STATS,
    activityFeed: () => CACHE_TAGS.ACTIVITY_FEED,
  },
} as const;

/**
 * Revalidation helpers - call after mutations
 */
export const revalidateCache = {
  /**
   * Revalidate article caches after create/update/delete
   */
  article(articleId?: number | string) {
    revalidateTag(CACHE_TAGS.ARTICLES, 'max');
    if (articleId) {
      revalidateTag(CACHE_TAGS.ARTICLE(articleId), 'max');
      revalidateTag(CACHE_TAGS.ARTICLE_COMMENTS(articleId), 'max');
      revalidateTag(CACHE_TAGS.ARTICLE_LIKES(articleId), 'max');
    }
    revalidateTag(CACHE_TAGS.ACTIVITY_FEED, 'max');
    revalidateTag(CACHE_TAGS.PUBLIC_STATS, 'max');
    revalidatePath('/sitemap.xml');
  },

  /**
   * Revalidate article comments after add/delete
   */
  articleComment(articleId: number | string) {
    revalidateTag(CACHE_TAGS.ARTICLE_COMMENTS(articleId), 'max');
    revalidateTag(CACHE_TAGS.ARTICLE(articleId), 'max'); // Comment count may change
    revalidateTag(CACHE_TAGS.ACTIVITY_FEED, 'max');
  },

  /**
   * Revalidate article likes after toggle
   */
  articleLike(articleId: number | string) {
    revalidateTag(CACHE_TAGS.ARTICLES, 'max');
    revalidateTag(CACHE_TAGS.ARTICLE_LIKES(articleId), 'max');
    revalidateTag(CACHE_TAGS.ARTICLE(articleId), 'max'); // Like count may change
  },

  /**
   * Revalidate game caches after update
   */
  game(gameId?: number | string, slug?: string) {
    revalidateTag(CACHE_TAGS.GAMES, 'max');
    if (gameId) {
      revalidateTag(CACHE_TAGS.GAME(gameId), 'max');
      revalidateTag(CACHE_TAGS.GAME_TROPHIES(gameId), 'max');
    }
    if (slug) {
      revalidateTag(CACHE_TAGS.GAME_BY_SLUG(slug), 'max');
    }
  },

  /**
   * Revalidate user backlog after add/update/remove
   */
  userBacklog(userId: string) {
    revalidateTag(CACHE_TAGS.USER_BACKLOG(userId), 'max');
    revalidateTag(CACHE_TAGS.USER_ACTIVITY(userId), 'max');
    revalidateTag(CACHE_TAGS.ACTIVITY_FEED, 'max');
  },

  /**
   * Revalidate user profile after update
   */
  userProfile(userId: string) {
    revalidateTag(CACHE_TAGS.USER_PROFILE(userId), 'max');
    revalidateTag(CACHE_TAGS.USER_ACTIVITY(userId), 'max');
  },

  /**
   * Revalidate user library (anime/books/movies) after add/update/remove
   */
  userLibrary(userId: string, type: 'anime' | 'books' | 'movies') {
    switch (type) {
      case 'anime':
        revalidateTag(CACHE_TAGS.USER_ANIME_LIBRARY(userId), 'max');
        break;
      case 'books':
        revalidateTag(CACHE_TAGS.USER_BOOKS_LIBRARY(userId), 'max');
        break;
      case 'movies':
        revalidateTag(CACHE_TAGS.USER_MOVIES_LIBRARY(userId), 'max');
        break;
    }
    revalidateTag(CACHE_TAGS.USER_ACTIVITY(userId), 'max');
    revalidateTag(CACHE_TAGS.ACTIVITY_FEED, 'max');
  },

  /**
   * Revalidate specific paths (use for page-level invalidation)
   */
  path(path: string, type: 'page' | 'layout' = 'page') {
    revalidatePath(path, type);
  },

  /**
   * Revalidate all articles pages (list + individual)
   */
  allArticlePages() {
    revalidatePath('/articles', 'layout');
  },

  /**
   * Revalidate all games pages (list + individual)
   */
  allGamePages() {
    revalidatePath('/games', 'layout');
  },

  /**
   * Revalidate global public stats endpoint/cache.
   */
  publicStats() {
    revalidateTag(CACHE_TAGS.PUBLIC_STATS, 'max');
  },
};

/**
 * Default cache configuration options
 */
export const CACHE_CONFIG = {
  // Public data - longer cache duration
  PUBLIC_DATA: {
    revalidate: 60 * 5, // 5 minutes
  },
  // User-specific data - shorter cache, rely on on-demand revalidation
  USER_DATA: {
    revalidate: 60, // 1 minute
  },
  // Real-time data - no cache
  REALTIME: {
    revalidate: 0,
  },
} as const;
