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

export const BOOKS_AI_TASTE_PROMPT_VERSION = 'books-ai-taste-prompt-v1';
export const BOOKS_AI_TASTE_SCHEMA_VERSION = 1;
export const BOOKS_AI_EVIDENCE_PREPROCESSING_VERSION = 'books-evidence-v1';
export const DEFAULT_GEMINI_BOOKS_TASTE_MODEL = 'gemini-3.6-flash';

export type BooksAiStrengthBand = TasteStrengthBand;
export type BooksAiDataSufficiency = TasteDataSufficiency;

/**
 * The evidence ladder for books.
 *
 * Abandonment sits higher here than anywhere else, and that is not generosity. A reader who puts a
 * novel down at page 200 has given it more hours than a whole film, so the act says less about the
 * book than walking out of a cinema does — it is frequently life getting in the way. The negative
 * channel still records it; the weight simply does not treat it as near-zero.
 */
export const BOOKS_AI_EVIDENCE_WEIGHTS: EvidenceWeightTable = {
  completedFavoriteTopScore: 12,
  completedFavorite: 10,
  completedScore9: 9,
  completedScore8: 7,
  completedScore7: 5,
  completedScore5: 2.5,
  completedScore4OrLower: 1.5,
  completedUnrated: 4.5,
  currentDeep: 3.5,
  currentPartial: 2,
  currentEarly: 1,
  droppedLate: 1.5,
  droppedEarly: 0.6,
};

/** Library counts above which a book library is "rich" rather than merely adequate. */
export const BOOKS_RICH_TITLE_COUNT = 14;
export const BOOKS_RICH_RATED_RATIO = 0.4;

export type BooksAiEvidenceEntry = TasteEvidenceEntryCore & {
  /**
   * Authors, from `media_items.tags`.
   *
   * The column name is wrong and the data is right: the Google Books importer writes author names
   * into `tags`, which is also where `recomputeCategoryProfiles` reads them from to derive
   * `favorite_authors`. Books are the only category here with a real *per-entry* authorship signal
   * — movies and tv can only quote a library-wide derived list — and it is the single most useful
   * field in this document.
   */
  authors: string[];
  /** Total pages, from `media_items.page_count`. Null when the source did not supply one. */
  pageCount: number | null;
  /** Publication year. Null when absent. */
  publicationYear: number | null;
  /** How far through the book the reader got. Null when no page count is known. */
  readRatio: number | null;
};

export type BooksAiDataQuality = TasteDataQualityCore & {
  /**
   * Share of entries with a known page count.
   *
   * Surfaced because both the drop-depth reasoning and any claim about preferred book length
   * degrade when it is low, and the model should know its evidence is thin rather than assume it is
   * complete.
   */
  pageDataRatio: number;
  /** Share of entries with at least one author recorded. */
  authorDataRatio: number;
  /** Distinct authors across the library, after collapse. */
  distinctAuthorCount: number;
};

export type BooksAiEvidenceDocument = {
  schemaVersion: 1;
  preprocessingVersion: typeof BOOKS_AI_EVIDENCE_PREPROCESSING_VERSION;
  category: 'books';
  entries: BooksAiEvidenceEntry[];
  dataQuality: BooksAiDataQuality;
};

export const BOOKS_AI_TASTE_TEXT_LIMITS = {
  identityLabel: 48,
  name: 80,
  description: 360,
  summary: 320,
  openQuestion: 140,
} as const;

export const BOOKS_AI_TASTE_LIST_LIMITS = {
  pillarsMin: 2,
  pillarsMax: 4,
  pillarEvidenceMin: 2,
  negativeEvidenceMin: 1,
  evidenceMax: 5,
  negativeSignalsMax: 3,
  openQuestionsMax: 2,
} as const;

/**
 * The books taste contract.
 *
 * `content | form`, like the other reading and watching categories. Prose style, structure and
 * narration are form; subject and setting are content.
 */
export const BOOKS_AI_TASTE_CONTRACT: TasteProfileContractConfig = {
  schemaVersion: BOOKS_AI_TASTE_SCHEMA_VERSION,
  pillarKinds: ['content', 'form'],
  textLimits: BOOKS_AI_TASTE_TEXT_LIMITS,
  listLimits: BOOKS_AI_TASTE_LIST_LIMITS,
};

export const AiBooksTasteProfileSchema = buildTasteProfileSchema(BOOKS_AI_TASTE_CONTRACT);

export const GEMINI_BOOKS_TASTE_RESPONSE_SCHEMA = buildGeminiTasteResponseSchema(
  BOOKS_AI_TASTE_CONTRACT,
);

export type AiBooksTasteProfile = ReturnType<typeof AiBooksTasteProfileSchema.parse>;

export type AiBooksTastePillar = AiBooksTasteProfile['pillars'][number] & {
  strengthBand: BooksAiStrengthBand;
};

export type EnrichedAiBooksTasteProfile = Omit<AiBooksTasteProfile, 'pillars'> & {
  pillars: AiBooksTastePillar[];
  dataQuality: BooksAiDataQuality;
  source: 'ai' | 'deterministic';
  model: string;
  inputHash: string;
};
