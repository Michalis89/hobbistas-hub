/**
 * Identifiers for the movies AI features.
 *
 * The category string keys every `ai_taste_profiles` row; the log scope prefixes every warning.
 * Pinned here for the same reason the other categories pin their own: a literal that drifts
 * between the cache key and the eligibility gate reads as a cache that never hits rather than as
 * a bug.
 */

export const MOVIES_AI_CATEGORY = 'movies';

export const MOVIES_TASTE_LOG_SCOPE = 'movies-ai-taste';
