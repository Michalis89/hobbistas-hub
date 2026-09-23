/**
 * Identifiers for the anime AI features.
 *
 * The category string keys every `ai_taste_profiles` row; the log scope prefixes every warning.
 * Pinned here for the same reason games pins its own: a literal that drifts between the cache key
 * and the eligibility gate reads as a cache that never hits rather than as a bug.
 */

export const ANIME_AI_CATEGORY = 'anime';

export const ANIME_TASTE_LOG_SCOPE = 'anime-ai-taste';

/**
 * Log scope for anime reranking.
 *
 * Separate from the taste scope on purpose: the two features fail for different reasons and are
 * rolled out independently, so a grep for one must not surface the other's warnings.
 */
export const ANIME_RERANK_LOG_SCOPE = 'anime-ai-rerank';
