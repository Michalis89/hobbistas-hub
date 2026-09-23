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

export const TV_AI_TASTE_PROMPT_VERSION = 'tv-ai-taste-prompt-v1';
export const TV_AI_TASTE_SCHEMA_VERSION = 1;
export const TV_AI_EVIDENCE_PREPROCESSING_VERSION = 'tv-evidence-v1';
export const DEFAULT_GEMINI_TV_TASTE_MODEL = 'gemini-3.6-flash';

export type TvAiStrengthBand = TasteStrengthBand;
export type TvAiDataSufficiency = TasteDataSufficiency;

/**
 * The evidence ladder for television.
 *
 * The rung that differs from every other category is `currentDeep`. Someone four seasons into a
 * running show has committed more hours than most people give a finished film, and the show is not
 * over — so being deep in progress is near-completion evidence here, not a half-signal. The gap
 * between `currentDeep` and `completedUnrated` is deliberately small.
 */
export const TV_AI_EVIDENCE_WEIGHTS: EvidenceWeightTable = {
  completedFavoriteTopScore: 12,
  completedFavorite: 10,
  completedScore9: 9,
  completedScore8: 7,
  completedScore7: 5,
  completedScore5: 2.5,
  completedScore4OrLower: 1.5,
  completedUnrated: 4.5,
  currentDeep: 4,
  currentPartial: 2,
  currentEarly: 0.75,
  droppedLate: 1.5,
  droppedEarly: 0.5,
};

/** Library counts above which a series library is "rich" rather than merely adequate. */
export const TV_RICH_TITLE_COUNT = 15;
export const TV_RICH_RATED_RATIO = 0.4;

export type TvAiEvidenceEntry = TasteEvidenceEntryCore & {
  /** Episodes watched, summed across the seasons that collapsed into this entry. */
  episodesWatched: number | null;
  /** Total episodes across the series, from `media_items.number_of_episodes`. */
  totalEpisodes: number | null;
  /** Seasons the series ran, from `media_items.number_of_seasons`. */
  totalSeasons: number | null;
  /** First air year. Null when absent. */
  firstAirYear: number | null;
  /** How far through the series the viewer got. Null when no episode total is known. */
  watchedRatio: number | null;
  /** How many library rows collapsed into this series — usually the seasons tracked separately. */
  collapsedRowCount: number;
};

/**
 * Authorship, derived elsewhere and quoted here.
 *
 * The same TMDB-credit lists movies use, computed per category, so "directors" for a series means
 * its credited creators and directors. Document-level because that is how it is stored: a ranked
 * list over the whole library, not a credit list per row.
 */
export type TvAiAuthorship = {
  directors: string[];
  actors: string[];
};

export type TvAiDataQuality = TasteDataQualityCore & {
  /**
   * Share of entries with a known episode total.
   *
   * Surfaced because the drop-depth reasoning degrades when it is low: without a total, "abandoned
   * after six episodes" could be a sixth of the show or nearly all of it.
   */
  episodeDataRatio: number;
  hasAuthorship: boolean;
};

export type TvAiEvidenceDocument = {
  schemaVersion: 1;
  preprocessingVersion: typeof TV_AI_EVIDENCE_PREPROCESSING_VERSION;
  category: 'tv';
  entries: TvAiEvidenceEntry[];
  authorship: TvAiAuthorship;
  dataQuality: TvAiDataQuality;
};

export const TV_AI_TASTE_TEXT_LIMITS = {
  identityLabel: 48,
  name: 80,
  description: 360,
  summary: 320,
  openQuestion: 140,
} as const;

export const TV_AI_TASTE_LIST_LIMITS = {
  pillarsMin: 2,
  pillarsMax: 4,
  pillarEvidenceMin: 2,
  negativeEvidenceMin: 1,
  evidenceMax: 5,
  negativeSignalsMax: 3,
  openQuestionsMax: 2,
} as const;

export const TV_AI_TASTE_CONTRACT: TasteProfileContractConfig = {
  schemaVersion: TV_AI_TASTE_SCHEMA_VERSION,
  pillarKinds: ['content', 'form'],
  textLimits: TV_AI_TASTE_TEXT_LIMITS,
  listLimits: TV_AI_TASTE_LIST_LIMITS,
};

export const AiTvTasteProfileSchema = buildTasteProfileSchema(TV_AI_TASTE_CONTRACT);

export const GEMINI_TV_TASTE_RESPONSE_SCHEMA = buildGeminiTasteResponseSchema(TV_AI_TASTE_CONTRACT);

export type AiTvTasteProfile = ReturnType<typeof AiTvTasteProfileSchema.parse>;

export type AiTvTastePillar = AiTvTasteProfile['pillars'][number] & {
  strengthBand: TvAiStrengthBand;
};

export type EnrichedAiTvTasteProfile = Omit<AiTvTasteProfile, 'pillars'> & {
  pillars: AiTvTastePillar[];
  dataQuality: TvAiDataQuality;
  source: 'ai' | 'deterministic';
  model: string;
  inputHash: string;
};
