/**
 * Identifiers shared by the two games AI features.
 *
 * The category string is what every `ai_*` table row is keyed by, and the log scopes are what
 * every warning is prefixed with. Both are pinned here rather than repeated as literals so that
 * "games" cannot drift between the cache key, the shadow observation and the eligibility gate —
 * a mismatch there reads as a cache that never hits rather than as a bug.
 */

export const GAMES_AI_CATEGORY = 'games';

export const GAMES_TASTE_LOG_SCOPE = 'gaming-ai-taste';

export const GAMES_RERANK_LOG_SCOPE = 'gaming-rerank';
