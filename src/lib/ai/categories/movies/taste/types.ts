import {
  buildGeminiTasteResponseSchema,
  buildTasteProfileSchema,
  type TasteProfileContractConfig,
} from '@/lib/ai/shared/taste/profile-contract';
import type {
  EvidenceWeightTable,
  TasteDataQualityCore,
  TasteDataSufficiency,
  TasteEvidenceEntryCore,
  TasteStrengthBand,
} from '@/lib/ai/shared/taste/evidence-core';

export const MOVIES_AI_TASTE_PROMPT_VERSION = 'movies-ai-taste-prompt-v1';
export const MOVIES_AI_TASTE_SCHEMA_VERSION = 1;
export const MOVIES_AI_EVIDENCE_PREPROCESSING_VERSION = 'movies-evidence-v1';
export const DEFAULT_GEMINI_MOVIES_TASTE_MODEL = 'gemini-3.6-flash';

export type MoviesAiStrengthBand = TasteStrengthBand;
export type MoviesAiDataSufficiency = TasteDataSufficiency;

/**
 * The evidence ladder for films.
 *
 * Tuned differently from the serialised categories in one respect that matters: an abandoned film
 * scores lower than an abandoned series does. Stopping a 110-minute film is a decisive rejection —
 * nobody stalls on a film the way they stall on a twelve-volume manga — so the weight gap between
 * "finished it" and "walked out" is wider here than anywhere else.
 */
export const MOVIES_AI_EVIDENCE_WEIGHTS: EvidenceWeightTable = {
  completedFavoriteTopScore: 12,
  completedFavorite: 10,
  completedScore9: 9,
  completedScore8: 7,
  completedScore7: 5,
  completedScore5: 2.5,
  completedScore4OrLower: 1.5,
  completedUnrated: 4,
  currentDeep: 3,
  currentPartial: 1.5,
  currentEarly: 0.75,
  droppedLate: 1,
  droppedEarly: 0.4,
};

/** Library counts above which a film library is "rich" rather than merely adequate. */
export const MOVIES_RICH_TITLE_COUNT = 20;
export const MOVIES_RICH_RATED_RATIO = 0.4;

export type MoviesAiEvidenceEntry = TasteEvidenceEntryCore & {
  /** Minutes, from `media_items.runtime`. Null when the source did not supply one. */
  runtime: number | null;
  /** Release year, from `release_date`. Null when absent. */
  releaseYear: number | null;
  /**
   * Share of the film actually watched, where the library recorded progress.
   *
   * Films are the one category where progress is usually absent — people mark a film watched, they
   * do not track minutes — so this is null far more often than not, and the prompt says so.
   */
  watchedRatio: number | null;
};

/**
 * Authorship, derived elsewhere and quoted here.
 *
 * The single most valuable signal a film library carries, and the one the deterministic recommender
 * cannot use: `media_items` holds no credits for movies, so directors and actors exist only in
 * `user_category_profiles`, computed from TMDB credits with franchise dedup already applied and —
 * for actors — a two-family breadth gate. That gate is why an actor here means "this person's work,
 * across unrelated films" rather than "this person was in a trilogy I liked".
 *
 * Document-level rather than per-entry because that is how it is stored: a ranked list over the
 * whole library, not a credit list per row. The model is told to read it as corroboration for a
 * pillar, never as a title it may cite.
 */
export type MoviesAiAuthorship = {
  directors: string[];
  actors: string[];
};

export type MoviesAiDataQuality = TasteDataQualityCore & {
  /**
   * Share of entries with a known runtime.
   *
   * Surfaced because any claim about preferred film length degrades when it is low, and the model
   * should know its evidence about pacing is thin rather than assume it is complete.
   */
  runtimeDataRatio: number;
  /** Whether the derived authorship lists had anything in them. */
  hasAuthorship: boolean;
};

export type MoviesAiEvidenceDocument = {
  schemaVersion: 1;
  preprocessingVersion: typeof MOVIES_AI_EVIDENCE_PREPROCESSING_VERSION;
  category: 'movies';
  entries: MoviesAiEvidenceEntry[];
  authorship: MoviesAiAuthorship;
  dataQuality: MoviesAiDataQuality;
};

/**
 * Character bounds shared by the Zod contract and the Gemini `responseSchema`.
 *
 * Both sides MUST agree: a bound Zod enforces but the provider schema omits is a bound the decoder
 * never applies, so the model overruns it and the whole generation is discarded.
 */
export const MOVIES_AI_TASTE_TEXT_LIMITS = {
  identityLabel: 48,
  name: 80,
  description: 360,
  summary: 320,
  openQuestion: 140,
} as const;

export const MOVIES_AI_TASTE_LIST_LIMITS = {
  pillarsMin: 2,
  pillarsMax: 4,
  pillarEvidenceMin: 2,
  negativeEvidenceMin: 1,
  evidenceMax: 5,
  negativeSignalsMax: 3,
  openQuestionsMax: 2,
} as const;

/**
 * The movies taste contract.
 *
 * `content | form` rather than the games `content | behavior`: a viewer does not *do* anything, and
 * what films differ in beyond subject matter is form — structure, pacing, how a story is told, how
 * much is withheld.
 */
export const MOVIES_AI_TASTE_CONTRACT: TasteProfileContractConfig = {
  schemaVersion: MOVIES_AI_TASTE_SCHEMA_VERSION,
  pillarKinds: ['content', 'form'],
  textLimits: MOVIES_AI_TASTE_TEXT_LIMITS,
  listLimits: MOVIES_AI_TASTE_LIST_LIMITS,
};

export const AiMoviesTasteProfileSchema = buildTasteProfileSchema(MOVIES_AI_TASTE_CONTRACT);

export const GEMINI_MOVIES_TASTE_RESPONSE_SCHEMA = buildGeminiTasteResponseSchema(
  MOVIES_AI_TASTE_CONTRACT,
);

export type AiMoviesTasteProfile = ReturnType<typeof AiMoviesTasteProfileSchema.parse>;

export type AiMoviesTastePillar = AiMoviesTasteProfile['pillars'][number] & {
  strengthBand: MoviesAiStrengthBand;
};

/**
 * What is cached and returned to the client.
 *
 * Every number on it is produced by deterministic code — the strength band from evidence mass, the
 * data-quality figures from the library. The model contributes only prose and the titles it cites.
 */
export type EnrichedAiMoviesTasteProfile = Omit<AiMoviesTasteProfile, 'pillars'> & {
  pillars: AiMoviesTastePillar[];
  dataQuality: MoviesAiDataQuality;
  source: 'ai' | 'deterministic';
  model: string;
  inputHash: string;
};
