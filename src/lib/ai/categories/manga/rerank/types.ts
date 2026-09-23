import {
  buildRankingResultSchema,
  type RankingContractConfig,
} from '@/lib/ai/shared/rank/contract';
import type { RerankRequestPayload } from '@/lib/ai/shared/rank/rerank-payload';
import type { RerankRanking } from '@/lib/ai/shared/rank/rerank-validation';
import type { RerankTastePayload } from '@/lib/ai/shared/rank/taste-payload';

export const MANGA_RERANK_PROMPT_VERSION = 'manga-ai-rerank-prompt-v1';
export const MANGA_RERANK_SCHEMA_VERSION = 1;
export const MANGA_RERANK_PAYLOAD_VERSION = 'manga-rerank-payload-v1';
export const MANGA_RERANK_SHUFFLE_SEED_VERSION = 'manga-rerank-shuffle-v1';
export const MANGA_RERANK_BLEND_VERSION = 'manga-rerank-blend-v1';
export const DEFAULT_GEMINI_MANGA_RERANK_MODEL = 'gemini-3.6-flash';

/** Below three, the model's only choices are "agree" or "swap". See the games note. */
export const MANGA_RERANK_MIN_SHORTLIST = 3;

export const MANGA_RERANK_MAX_SHORTLIST = 20;

export const DEFAULT_MANGA_RERANK_SHORTLIST_SIZE = MANGA_RERANK_MAX_SHORTLIST;

export const MANGA_RERANK_TEXT_LIMITS = {
  rationale: 80,
} as const;

export const MANGA_RERANK_SYNOPSIS_MAX_CHARS = 300;

export const MANGA_RERANK_CONTRACT: RankingContractConfig = {
  schemaVersion: MANGA_RERANK_SCHEMA_VERSION,
  minItems: MANGA_RERANK_MIN_SHORTLIST,
  maxItems: MANGA_RERANK_MAX_SHORTLIST,
  rationaleMaxChars: MANGA_RERANK_TEXT_LIMITS.rationale,
};

/**
 * What the model is told about one manga.
 *
 * Two fields carry the category's own hard-won caveats.
 *
 * *`labels`, not `genres`.* MAL returns one flat list per title that mixes genre, theme and
 * demographic bracket together — "Action", "Psychological" and "Shounen" arrive as peers. Calling
 * the field `genres` would invite the model to treat a magazine's target readership as a taste
 * signal, which is exactly the confusion the manga taste layer refuses at validation time.
 *
 * *`totalChapters` may legitimately be null even when the column is populated.* On rows written by
 * the OAuth sync, `media_items.chapters` holds somebody's bookmark rather than a series total.
 * `resolveChapterTotal` is the single rule that decides, and it is deliberately biased toward a
 * missing total over a fictional one — a null here means "unknown", never "short".
 */
export type MangaRerankCandidatePayload = {
  token: string;
  title: string;
  labels: string[];
  format: string | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  publicationStatus: string | null;
  startYear: number | null;
  synopsis: string | null;
};

export type MangaRerankTastePayload = RerankTastePayload;

export type MangaRerankRequestPayload = RerankRequestPayload<MangaRerankCandidatePayload>;

export const AiMangaRerankResultSchema = buildRankingResultSchema(MANGA_RERANK_CONTRACT);

export type AiMangaRerankResult = ReturnType<typeof AiMangaRerankResultSchema.parse>;

export type MangaRerankRanking = RerankRanking;
