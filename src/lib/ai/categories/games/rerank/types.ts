import {
  buildRankingResultSchema,
  type RankingContractConfig,
} from '@/lib/ai/shared/rank/contract';
import type { RerankRequestPayload } from '@/lib/ai/shared/rank/rerank-payload';
import type { RerankRanking } from '@/lib/ai/shared/rank/rerank-validation';
import type { RerankTastePayload } from '@/lib/ai/shared/rank/taste-payload';

export const GAME_RERANK_PROMPT_VERSION = 'games-ai-rerank-prompt-v2';
export const GAME_RERANK_SCHEMA_VERSION = 1;
export const GAME_RERANK_PAYLOAD_VERSION = 'games-rerank-payload-v1';
export const GAME_RERANK_SHUFFLE_SEED_VERSION = 'games-rerank-shuffle-v1';
export const GAME_RERANK_BLEND_VERSION = 'games-rerank-blend-v1';
export const DEFAULT_GEMINI_RERANK_MODEL = 'gemini-3.6-flash';

/**
 * Smallest shortlist worth sending.
 *
 * Below three candidates there is almost nothing to rank: with two, the model's only choices are
 * "agree" or "swap", which produces a shadow signal dominated by noise while costing a full
 * request. Three is the point at which an ordering carries more information than a coin flip, and
 * it is also roughly where the deterministic engine stops being able to fill its discovery slots
 * from distinct franchises anyway.
 */
export const GAME_RERANK_MIN_SHORTLIST = 3;

/** Hard ceiling on what is sent, matching the engine's own shortlist cap. */
export const GAME_RERANK_MAX_SHORTLIST = 20;

/**
 * How many candidates are actually sent, by default.
 *
 * Back at the ceiling. Dropping this to twelve to buy latency moved a live run by seven
 * milliseconds — the cost is reasoning time, which barely scales with list length — so the
 * narrower funnel was paying for nothing. Kept configurable via
 * `GAMES_RERANK_SHORTLIST_SIZE` because it is still the right lever if the constraint ever
 * becomes output size rather than reasoning.
 */
export const DEFAULT_GAME_RERANK_SHORTLIST_SIZE = GAME_RERANK_MAX_SHORTLIST;

/**
 * Bounds shared by the Zod contract and the Gemini `responseSchema`. Keep both sides in step.
 *
 * The rationale cap is a latency control as much as a formatting one. Output generation dominates
 * this call: twenty entries under constrained decoding with a per-item enum is roughly a thousand
 * tokens at 160 characters, which overran a 12s budget on the first live run. Eighty characters
 * still holds one comparative clause — which is all a debug-only rationale needs — and cuts the
 * output roughly in half.
 */
export const GAME_RERANK_TEXT_LIMITS = {
  rationale: 80,
} as const;

/** Candidate summaries are truncated before they are sent; free text is the bulk of the payload. */
export const GAME_RERANK_SUMMARY_MAX_CHARS = 300;

/** The games binding of the shared ranking contract. Drives Zod and Gemini alike. */
export const GAME_RERANK_CONTRACT: RankingContractConfig = {
  schemaVersion: GAME_RERANK_SCHEMA_VERSION,
  minItems: GAME_RERANK_MIN_SHORTLIST,
  maxItems: GAME_RERANK_MAX_SHORTLIST,
  rationaleMaxChars: GAME_RERANK_TEXT_LIMITS.rationale,
};

/** Opaque per-run identifier for a candidate: `c01`..`c20`. Real media ids never leave the app. */
export type GameRerankToken = string;

/**
 * What the model is told about one candidate.
 *
 * The genuinely games-specific part of the payload — modes and perspectives describe what a player
 * *does*, which is the axis the prompt asks the model to rank on. A category with a different
 * shape of experience declares its own.
 */
export type GameRerankCandidatePayload = {
  token: GameRerankToken;
  title: string;
  genres: string[];
  themes: string[];
  gameModes: string[];
  playerPerspectives: string[];
  developer: string | null;
  releaseYear: number | null;
  summary: string | null;
};

/** Structural across categories — see `shared/rank/taste-payload.ts`. */
export type GameRerankTastePayload = RerankTastePayload;

export type GameRerankRequestPayload = RerankRequestPayload<GameRerankCandidatePayload>;

export const AiGameRerankResultSchema = buildRankingResultSchema(GAME_RERANK_CONTRACT);

export type AiGameRerankResult = ReturnType<typeof AiGameRerankResultSchema.parse>;

/** A validated ranking, resolved back to real media ids. */
export type GameRerankRanking = RerankRanking;
