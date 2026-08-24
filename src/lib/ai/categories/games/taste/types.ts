import { z } from 'zod';

export const GAME_AI_EVIDENCE_PREPROCESSING_VERSION = 'games-evidence-v2';
export const GAME_AI_TASTE_PROMPT_VERSION = 'games-ai-taste-prompt-v1.2';
export const GAME_AI_TASTE_SCHEMA_VERSION = 1;
export const DEFAULT_GEMINI_TASTE_MODEL = 'gemini-3.6-flash';

export const GAME_AI_EVIDENCE_WEIGHTS = {
  completedFavoriteScore9: 10,
  completedFavorite: 8,
  completedScore9: 7,
  completedScore8: 5,
  completedScore7: 2.5,
  completedScore5: 0.5,
  completedScore4OrLower: -1.5,
  completedUnrated: 1.5,
  currentProgressOver25: 2.5,
  currentProgressLowOrUnknown: 1.5,
  droppedScore5OrLower: -7,
  droppedScoreOver5: -3,
  droppedNoScoreProgressOver40: -5,
  droppedNoScoreProgressLowOrUnknown: -2,
} as const;

/**
 * How many of the strongest positive evidence entries form the strength-band denominator.
 *
 * A pillar cites at most 5 titles, so dividing by the whole library's positive mass made the
 * share shrink as the library grew — `Strong` and `Defining` were unreachable past ~140 mass.
 * Comparing the cited titles against the user's strongest signals instead keeps the scale
 * bounded and independent of how many weak positives sit below it.
 */
export const GAME_AI_STRENGTH_REFERENCE_ENTRY_COUNT = 12;

/**
 * Weight applied to a franchise's repeat completions beyond its representative entry.
 *
 * Franchise collapse keeps one entry per family, so a family's extra completions previously
 * vanished from the mass entirely. Re-adding them at half weight keeps repeated engagement
 * audible without letting one series count as several independent signals.
 */
export const GAME_AI_FRANCHISE_REPEAT_DAMPING = 0.5;

export type GameAiProgressBucket = 'unknown' | '0-25' | '26-40' | '41-75' | '76-100';
export type GameAiEvidenceStatus = 'completed' | 'current' | 'dropped';
export type GameAiStrengthBand = 'Defining' | 'Strong' | 'Present' | 'Emerging';
export type GameAiDataSufficiency = 'sparse' | 'adequate' | 'rich';

export type GameAiEvidenceEntry = {
  identityKey: string;
  franchiseKey: string;
  representativeTitle: string;
  titles: string[];
  status: GameAiEvidenceStatus;
  score: number | null;
  favorite: boolean;
  progressBucket: GameAiProgressBucket;
  genres: string[];
  themes: string[];
  studios: string[];
  weight: number;
};

export type GameAiFranchiseEvidence = {
  franchiseKey: string;
  representativeTitle: string;
  titles: string[];
  completionCount: number;
  favoriteCount: number;
  positiveMass: number;
  negativeMass: number;
  genres: string[];
  themes: string[];
  studios: string[];
};

export type GameAiEvidenceDocument = {
  schemaVersion: 1;
  preprocessingVersion: typeof GAME_AI_EVIDENCE_PREPROCESSING_VERSION;
  category: 'games';
  entries: GameAiEvidenceEntry[];
  franchises: GameAiFranchiseEvidence[];
  dataQuality: {
    titleCount: number;
    ratedRatio: number;
    favoriteCount: number;
    sufficiency: GameAiDataSufficiency;
  };
};

/**
 * Character bounds shared by the Zod contract and the Gemini `responseSchema`.
 *
 * Both sides MUST agree: a bound Zod enforces but the provider schema omits is a bound the
 * decoder never applies, so the model overruns it and the whole generation is discarded.
 */
export const GAME_AI_TASTE_TEXT_LIMITS = {
  identityLabel: 48,
  name: 80,
  description: 360,
  summary: 320,
  openQuestion: 140,
} as const;

/** Item-count bounds shared by the Zod contract and the Gemini `responseSchema`. */
export const GAME_AI_TASTE_LIST_LIMITS = {
  pillarsMin: 2,
  pillarsMax: 4,
  pillarEvidenceMin: 2,
  negativeEvidenceMin: 1,
  evidenceMax: 5,
  negativeSignalsMax: 3,
  openQuestionsMax: 2,
} as const;

export const AiGamingTasteProfileSchema = z.object({
  schemaVersion: z.literal(GAME_AI_TASTE_SCHEMA_VERSION),
  identity: z.object({
    label: z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.identityLabel),
    description: z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.description),
  }),
  pillars: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.name),
        kind: z.enum(['content', 'behavior']),
        description: z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.description),
        evidenceTitles: z
          .array(z.string().trim().min(1))
          .min(GAME_AI_TASTE_LIST_LIMITS.pillarEvidenceMin)
          .max(GAME_AI_TASTE_LIST_LIMITS.evidenceMax),
      }),
    )
    .min(GAME_AI_TASTE_LIST_LIMITS.pillarsMin)
    .max(GAME_AI_TASTE_LIST_LIMITS.pillarsMax),
  negativeSignals: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.name),
        description: z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.description),
        evidenceTitles: z
          .array(z.string().trim().min(1))
          .min(GAME_AI_TASTE_LIST_LIMITS.negativeEvidenceMin)
          .max(GAME_AI_TASTE_LIST_LIMITS.evidenceMax),
      }),
    )
    .max(GAME_AI_TASTE_LIST_LIMITS.negativeSignalsMax),
  summary: z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.summary),
  openQuestions: z
    .array(z.string().trim().min(1).max(GAME_AI_TASTE_TEXT_LIMITS.openQuestion))
    .max(GAME_AI_TASTE_LIST_LIMITS.openQuestionsMax),
});

export type AiGamingTasteProfile = z.infer<typeof AiGamingTasteProfileSchema>;

export type AiGamingTastePillar = AiGamingTasteProfile['pillars'][number] & {
  strengthBand: GameAiStrengthBand;
};

export type EnrichedAiGamingTasteProfile = Omit<AiGamingTasteProfile, 'pillars'> & {
  pillars: AiGamingTastePillar[];
  dataQuality: GameAiEvidenceDocument['dataQuality'];
  source: 'ai' | 'deterministic';
  model: string;
  inputHash: string;
};
