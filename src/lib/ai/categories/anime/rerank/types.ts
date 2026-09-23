import {
  buildRankingResultSchema,
  type RankingContractConfig,
} from '@/lib/ai/shared/rank/contract';
import type { RerankRequestPayload } from '@/lib/ai/shared/rank/rerank-payload';
import type { RerankRanking } from '@/lib/ai/shared/rank/rerank-validation';
import type { RerankTastePayload } from '@/lib/ai/shared/rank/taste-payload';

export const ANIME_RERANK_PROMPT_VERSION = 'anime-ai-rerank-prompt-v1';
export const ANIME_RERANK_SCHEMA_VERSION = 1;
export const ANIME_RERANK_PAYLOAD_VERSION = 'anime-rerank-payload-v1';
export const ANIME_RERANK_SHUFFLE_SEED_VERSION = 'anime-rerank-shuffle-v1';
export const ANIME_RERANK_BLEND_VERSION = 'anime-rerank-blend-v1';
export const DEFAULT_GEMINI_ANIME_RERANK_MODEL = 'gemini-3.6-flash';

/**
 * Smallest shortlist worth sending.
 *
 * Three, the same figure games settled on and for the same reason: with two candidates the model's
 * only choices are "agree" or "swap", which costs a full request to produce a signal dominated by
 * noise.
 */
export const ANIME_RERANK_MIN_SHORTLIST = 3;

/** Hard ceiling on what is sent, matching the engine's own shortlist cap. */
export const ANIME_RERANK_MAX_SHORTLIST = 20;

export const DEFAULT_ANIME_RERANK_SHORTLIST_SIZE = ANIME_RERANK_MAX_SHORTLIST;

/**
 * Bounds shared by the Zod contract and the Gemini `responseSchema`. Keep both sides in step.
 *
 * Eighty characters, as games learned the hard way: output generation dominates this call, and a
 * rationale long enough for a full sentence roughly doubles the token count for no gain in a field
 * nothing but the evaluator reads.
 */
export const ANIME_RERANK_TEXT_LIMITS = {
  rationale: 80,
} as const;

/** Synopses are truncated before they are sent; free text is the bulk of the payload. */
export const ANIME_RERANK_SYNOPSIS_MAX_CHARS = 300;

export const ANIME_RERANK_CONTRACT: RankingContractConfig = {
  schemaVersion: ANIME_RERANK_SCHEMA_VERSION,
  minItems: ANIME_RERANK_MIN_SHORTLIST,
  maxItems: ANIME_RERANK_MAX_SHORTLIST,
  rationaleMaxChars: ANIME_RERANK_TEXT_LIMITS.rationale,
};

/**
 * What the model is told about one anime.
 *
 * Deliberately not the games shape with different words. `format` and `episodes` together are the
 * load-bearing pair here: they say whether a candidate is a twelve-episode cour, a fifty-episode
 * run or a film, which is a commitment decision the viewer makes before any question of genre —
 * and it is the axis the deterministic scorer has no access to at all.
 *
 * Absent on purpose: studios and tags. The anime importer writes no studios, and `media_items.tags`
 * holds alternative titles rather than themes, so both would send empty arrays or noise dressed as
 * signal. See the anime taste layer, which reaches the same conclusion from the same rows.
 */
export type AnimeRerankCandidatePayload = {
  token: string;
  title: string;
  genres: string[];
  format: string | null;
  episodes: number | null;
  seasonYear: number | null;
  synopsis: string | null;
};

export type AnimeRerankTastePayload = RerankTastePayload;

export type AnimeRerankRequestPayload = RerankRequestPayload<AnimeRerankCandidatePayload>;

export const AiAnimeRerankResultSchema = buildRankingResultSchema(ANIME_RERANK_CONTRACT);

export type AiAnimeRerankResult = ReturnType<typeof AiAnimeRerankResultSchema.parse>;

export type AnimeRerankRanking = RerankRanking;
