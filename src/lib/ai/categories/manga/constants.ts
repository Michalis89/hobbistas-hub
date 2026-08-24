/**
 * Identifiers for the manga AI features.
 *
 * The category string keys every `ai_taste_profiles` row; the log scope prefixes every warning.
 * Pinned here for the same reason games and anime pin their own: a literal that drifts between
 * the cache key and the eligibility gate reads as a cache that never hits rather than as a bug.
 */

export const MANGA_AI_CATEGORY = 'manga';

export const MANGA_TASTE_LOG_SCOPE = 'manga-ai-taste';
