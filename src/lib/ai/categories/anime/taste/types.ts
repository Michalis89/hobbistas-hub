import { z } from 'zod';
import type { AnimeAiAversionEvidence } from './negative-evidence';

export const ANIME_AI_EVIDENCE_PREPROCESSING_VERSION = 'anime-evidence-v3';
export const ANIME_AI_TASTE_PROMPT_VERSION = 'anime-ai-taste-prompt-v3';
export const ANIME_AI_TASTE_SCHEMA_VERSION = 1;
export const DEFAULT_GEMINI_ANIME_TASTE_MODEL = 'gemini-3.6-flash';

/**
 * How strongly one library entry counts as evidence.
 *
 * Anime numbers, not inherited games numbers, though the positive side lands close because the
 * underlying question — "how much does finishing and rating something tell us?" — is the same.
 * The two sides that genuinely differ are `current` and `dropped`, both because anime progress is
 * an episode count against a known total rather than a percentage.
 */
export const ANIME_AI_EVIDENCE_WEIGHTS = {
  completedFavoriteScore9: 10,
  completedFavorite: 8,
  completedScore9: 7,
  completedScore8: 5,
  completedScore7: 2.5,
  completedScore5: 0.5,
  completedScore4OrLower: -1.5,
  completedUnrated: 1.5,

  /**
   * In-progress, banded by how far in the viewer has got.
   *
   * Sticking with a show past the halfway mark is a real endorsement — anime is watched weekly and
   * abandoning is cheap — so it counts for more than a game left installed at 30%.
   */
  currentPastHalf: 3,
  currentPastQuarter: 2,
  currentEarly: 1,

  /**
   * Dropped with a score. A stated rating overrides where the viewer stopped: someone who rated
   * it 3 has told us the verdict, whether they quit at episode 2 or episode 20.
   */
  droppedScore4OrLower: -7,
  droppedScore5Or6: -4,
  droppedScore7OrHigher: -1,

  /**
   * Dropped without a score, banded by drop point. See `ANIME_DROP_BANDS` for why this ordering
   * is the reverse of the games one.
   */
  droppedUnratedBailed: -6,
  droppedUnratedMidway: -4,
  droppedUnratedLate: -1.5,
  droppedUnratedUnknownProgress: -2,
} as const;

/**
 * Where a viewer stopped, relative to the whole.
 *
 * The bands, and the weights attached to them, encode a claim specific to episodic television:
 * **an early drop is stronger aversion evidence than a late one.** Anime has a three-episode
 * convention precisely because the first act is where viewers decide, so bailing at 2/12 is a
 * clean rejection of premise, tone or style. Quitting at 40/50 is the opposite kind of event —
 * the show worked for forty episodes; stopping near the end is far more often a stall, a hiatus,
 * or one bad arc than a statement about taste.
 *
 * This is deliberately inverted from the games model, where progress is a completion percentage
 * and abandoning late means a game wore out its welcome.
 */
export const ANIME_DROP_BANDS = {
  /** Watched a quarter or less of a known total. */
  bailedMaxRatio: 0.25,
  /** Watched more than a quarter but not more than 60%. */
  midwayMaxRatio: 0.6,
  /**
   * Absolute episode fallbacks used when the total is unknown.
   *
   * No completion percentage is fabricated: without a total, the only honest reading of "stopped
   * after 2 episodes" is the raw count, and a three-episode bail is recognisable on its own.
   */
  unknownTotalBailedMaxEpisodes: 3,
  unknownTotalMidwayMaxEpisodes: 12,
} as const;

/**
 * How many of the strongest positive entries form the strength-band denominator.
 *
 * Twelve, chosen for reachability rather than by analogy with games. A pillar cites at most five
 * titles, so an all-equal library caps a pillar's share at 5/12 ≈ 0.42 — inside `Strong`, short of
 * `Defining`. `Defining` is then reached only when the cited titles are genuinely heavier than the
 * library average (favourites and 9s against unrated completions), which is exactly what the band
 * is supposed to mean. A larger denominator would put `Defining` out of reach entirely.
 */
export const ANIME_AI_STRENGTH_REFERENCE_ENTRY_COUNT = 12;

/**
 * Weight applied to a franchise's repeat entries beyond its representative.
 *
 * Lower than the games equivalent, and capped, because anime franchises are structurally larger:
 * a single series routinely contributes five or six library entries once seasons, cours, OVAs and
 * films are counted, where a game series rarely exceeds three. At the games damping an
 * enthusiastically-watched long-runner could out-mass an entire varied library on its own, which
 * is the failure this whole collapse step exists to prevent.
 */
export const ANIME_AI_FRANCHISE_REPEAT_DAMPING = 0.4;

/**
 * Ceiling on repeat mass, as a multiple of the representative entry's weight.
 *
 * The damping factor alone is not enough: it scales a long franchise's contribution down but
 * still lets it grow without limit as seasons accumulate. This caps what any one family can
 * contribute at 2.5x its best entry, so a six-season commitment reads as a strong preference
 * rather than as the whole profile.
 */
export const ANIME_AI_FRANCHISE_REPEAT_CAP_MULTIPLE = 1.5;

/**
 * Weight multiplier for derivative entries — OVAs, ONAs, specials, recaps.
 *
 * Halved rather than dropped. A recap restates a season the viewer already watched, so it adds no
 * new information about taste, but a viewer who sought out the OVAs did choose to spend more time
 * with the series and that is worth something.
 */
export const ANIME_AI_DERIVATIVE_WEIGHT_FACTOR = 0.5;

export type AnimeAiEvidenceStatus = 'completed' | 'current' | 'dropped';

/** Where the viewer stopped, as it appears in the evidence document. */
export type AnimeAiProgressBand =
  | 'unknown'
  | 'bailed'
  | 'partial'
  | 'most'
  | 'complete';

export type AnimeAiStrengthBand = 'Defining' | 'Strong' | 'Present' | 'Emerging';
export type AnimeAiDataSufficiency = 'sparse' | 'adequate' | 'rich';

export type AnimeAiEvidenceEntry = {
  identityKey: string;
  franchiseKey: string;
  representativeTitle: string;
  titles: string[];
  status: AnimeAiEvidenceStatus;
  score: number | null;
  favorite: boolean;
  /** Episodes watched. Null when the library recorded none. */
  episodesWatched: number | null;
  /** Total episodes, from `media_items.episodes`. Null when the source did not supply one. */
  totalEpisodes: number | null;
  progressBand: AnimeAiProgressBand;
  /** MAL `media_type`, lowercased: tv, movie, ova, ona, special. Null when absent. */
  format: string | null;
  /** Broadcast year, from `season_year`. Null when absent. */
  seasonYear: number | null;
  genres: string[];
  /** True for OVAs, specials and recaps — entries derivative of a parent series. */
  derivative: boolean;
  /**
   * How much aversion evidence this entry carries: `none`, `weak` or `clear`.
   *
   * Deterministic, and sent to the model rather than left for it to infer from status, score and
   * favourite. Graded rather than boolean because "citable" and "sufficient" are different
   * questions, and conflating them produced signals built entirely from lukewarm ratings.
   */
  aversionEvidence: AnimeAiAversionEvidence;
  weight: number;
};

export type AnimeAiFranchiseEvidence = {
  franchiseKey: string;
  representativeTitle: string;
  titles: string[];
  /** How many instalments of this family the library holds, before collapse. */
  entryCount: number;
  completionCount: number;
  favoriteCount: number;
  positiveMass: number;
  negativeMass: number;
  genres: string[];
};

export type AnimeAiEvidenceDocument = {
  schemaVersion: 1;
  preprocessingVersion: typeof ANIME_AI_EVIDENCE_PREPROCESSING_VERSION;
  category: 'anime';
  entries: AnimeAiEvidenceEntry[];
  franchises: AnimeAiFranchiseEvidence[];
  dataQuality: {
    /** Collapsed franchise families, not raw library rows. */
    titleCount: number;
    ratedRatio: number;
    favoriteCount: number;
    /**
     * Share of entries with a known episode total.
     *
     * Surfaced because the drop-point reasoning degrades when it is low, and the model should
     * know when its evidence about abandonment is thin rather than assume it is complete.
     */
    episodeDataRatio: number;
    /**
     * Entries graded `clear` — those able to carry a negative signal on their own.
     *
     * Surfaced because a library can be rich and still contain no aversion evidence whatsoever: a
     * viewer who drops nothing and rates nothing below 7 has told us plenty about what they like
     * and nothing about what they avoid. When this is zero the model is instructed to claim no
     * aversion anywhere, prose included.
     */
    clearAversionCount: number;
    sufficiency: AnimeAiDataSufficiency;
  };
};

/**
 * Character bounds shared by the Zod contract and the Gemini `responseSchema`.
 *
 * Both sides MUST agree: a bound Zod enforces but the provider schema omits is a bound the
 * decoder never applies, so the model overruns it and the whole generation is discarded.
 */
export const ANIME_AI_TASTE_TEXT_LIMITS = {
  identityLabel: 48,
  name: 80,
  description: 360,
  summary: 320,
  openQuestion: 140,
} as const;

/** Item-count bounds shared by the Zod contract and the Gemini `responseSchema`. */
export const ANIME_AI_TASTE_LIST_LIMITS = {
  pillarsMin: 2,
  pillarsMax: 4,
  pillarEvidenceMin: 2,
  negativeEvidenceMin: 1,
  evidenceMax: 5,
  negativeSignalsMax: 3,
  openQuestionsMax: 2,
} as const;

/**
 * The anime taste contract.
 *
 * Structurally close to the games contract but deliberately its own, because one field carries
 * different meaning: a pillar's `kind` is `content | form`, not `content | behavior`. "Behaviour"
 * is a *player* concept — how someone plays — and a viewer has no equivalent. What anime has
 * instead is form: episodic versus serialised, ensemble versus protagonist-focused, pacing,
 * arc structure. Reusing the games enum would have forced every structural observation about
 * anime to be labelled as behaviour, which is not what it is.
 *
 * Sharing a schema for the sake of sharing would also have frozen both categories together: a
 * bound anime wants to move could not be moved without a games schema bump and a full cache
 * invalidation on the games side.
 */
export const AiAnimeTasteProfileSchema = z.object({
  schemaVersion: z.literal(ANIME_AI_TASTE_SCHEMA_VERSION),
  identity: z.object({
    label: z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.identityLabel),
    description: z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.description),
  }),
  pillars: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.name),
        kind: z.enum(['content', 'form']),
        description: z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.description),
        evidenceTitles: z
          .array(z.string().trim().min(1))
          .min(ANIME_AI_TASTE_LIST_LIMITS.pillarEvidenceMin)
          .max(ANIME_AI_TASTE_LIST_LIMITS.evidenceMax),
      }),
    )
    .min(ANIME_AI_TASTE_LIST_LIMITS.pillarsMin)
    .max(ANIME_AI_TASTE_LIST_LIMITS.pillarsMax),
  negativeSignals: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.name),
        description: z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.description),
        evidenceTitles: z
          .array(z.string().trim().min(1))
          .min(ANIME_AI_TASTE_LIST_LIMITS.negativeEvidenceMin)
          .max(ANIME_AI_TASTE_LIST_LIMITS.evidenceMax),
      }),
    )
    .max(ANIME_AI_TASTE_LIST_LIMITS.negativeSignalsMax),
  summary: z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.summary),
  openQuestions: z
    .array(z.string().trim().min(1).max(ANIME_AI_TASTE_TEXT_LIMITS.openQuestion))
    .max(ANIME_AI_TASTE_LIST_LIMITS.openQuestionsMax),
});

export type AiAnimeTasteProfile = z.infer<typeof AiAnimeTasteProfileSchema>;

export type AiAnimeTastePillar = AiAnimeTasteProfile['pillars'][number] & {
  strengthBand: AnimeAiStrengthBand;
};

/**
 * What is cached and returned to the client.
 *
 * Every number on it is produced by deterministic code — the strength band from evidence mass, the
 * data-quality figures from the library. The model contributes only prose and the titles it cites.
 */
export type EnrichedAiAnimeTasteProfile = Omit<AiAnimeTasteProfile, 'pillars'> & {
  pillars: AiAnimeTastePillar[];
  dataQuality: AnimeAiEvidenceDocument['dataQuality'];
  source: 'ai' | 'deterministic';
  model: string;
  inputHash: string;
};

export type { AnimeAiAversionEvidence };
