import { z } from 'zod';

export const GAME_RERANK_PROMPT_VERSION = 'games-ai-rerank-prompt-v1';
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

/** Upper bound on what is sent, matching the engine's own shortlist cap. */
export const GAME_RERANK_MAX_SHORTLIST = 20;

/** Bounds shared by the Zod contract and the Gemini `responseSchema`. Keep both sides in step. */
export const GAME_RERANK_TEXT_LIMITS = {
  rationale: 160,
} as const;

/** Candidate summaries are truncated before they are sent; free text is the bulk of the payload. */
export const GAME_RERANK_SUMMARY_MAX_CHARS = 300;

/** Opaque per-run identifier for a candidate: `c01`..`c20`. Real media ids never leave the app. */
export type GameRerankToken = string;

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

export type GameRerankTastePayload = {
  identity: { label: string; description: string };
  pillars: Array<{
    name: string;
    kind: 'content' | 'behavior';
    description: string;
    strengthBand: string;
  }>;
  negativeSignals: Array<{ name: string; description: string }>;
  summary: string;
  sufficiency: string;
};

export type GameRerankRequestPayload = {
  payloadVersion: typeof GAME_RERANK_PAYLOAD_VERSION;
  taste: GameRerankTastePayload;
  /** Shuffled, so list position cannot leak the deterministic ordering. */
  candidates: GameRerankCandidatePayload[];
};

export const AiGameRerankResultSchema = z.object({
  schemaVersion: z.literal(GAME_RERANK_SCHEMA_VERSION),
  ranking: z
    .array(
      z.object({
        candidateId: z.string().trim().min(1),
        rank: z.number().int().min(1),
        rationale: z.string().trim().min(1).max(GAME_RERANK_TEXT_LIMITS.rationale),
      }),
    )
    .min(GAME_RERANK_MIN_SHORTLIST)
    .max(GAME_RERANK_MAX_SHORTLIST),
});

export type AiGameRerankResult = z.infer<typeof AiGameRerankResultSchema>;

/** A validated ranking, resolved back to real media ids. */
export type GameRerankRanking = {
  /** Media ids in AI-preferred order, best first. */
  order: number[];
  /** mediaId → one-line reason. Model text about the user's taste: never logged. */
  rationales: Record<number, string>;
};
