import { z } from 'zod';
import type { MangaAiAversionEvidence } from './negative-evidence';
import type { MangaProgressBand } from './progress';

export const MANGA_AI_EVIDENCE_PREPROCESSING_VERSION = 'manga-evidence-v1';
export const MANGA_AI_TASTE_PROMPT_VERSION = 'manga-ai-taste-prompt-v1';
export const MANGA_AI_TASTE_SCHEMA_VERSION = 1;
export const DEFAULT_GEMINI_MANGA_TASTE_MODEL = 'gemini-3.6-flash';

/**
 * How strongly one library entry counts as evidence.
 *
 * Manga numbers. The completed side lands close to anime's because the question it answers —
 * "how much does finishing and rating something tell us?" — really is the same. Everything to do
 * with progress differs, and differs for one reason: reading a manga is a far larger commitment
 * per work than watching a cour, and abandoning one is far cheaper than abandoning a book.
 */
export const MANGA_AI_EVIDENCE_WEIGHTS = {
  completedFavoriteScore9: 10,
  completedFavorite: 8,
  completedScore9: 7,
  completedScore8: 5,
  completedScore7: 2.5,
  completedScore5: 0.5,
  completedScore4OrLower: -1.5,
  completedUnrated: 1.5,

  /**
   * In-progress, banded by depth.
   *
   * The deep band outweighs anime's equivalent, and deliberately. Anime is broadcast weekly and
   * a viewer half-way through a cour has spent four hours; a reader eighty chapters into a
   * serialised manga has spent considerably more and has actively chosen to keep going at every
   * one of those chapters. A long current run is the strongest thing a library can say about
   * taste without anyone ever entering a rating, and it is common for it to be the *only* thing —
   * long-running series are exactly the ones readers never mark complete.
   *
   * Note these are bands, not a scale. A reader four hundred chapters in scores the same as one
   * eighty chapters in. Depth changes how confident the evidence is, and past a point more of it
   * adds no confidence — which is what stops one enormous series from dominating a profile.
   */
  currentDeepRun: 4,
  currentSampled: 2,
  currentEarly: 0.75,
  currentUnknownProgress: 1,

  /**
   * Dropped with a score. A stated rating overrides where the reader stopped: someone who rated
   * it 3 has given their verdict, whether they quit at chapter 2 or chapter 200.
   */
  droppedScore4OrLower: -7,
  droppedScore5Or6: -4,
  droppedScore7OrHigher: -1,

  /**
   * Dropped without a score, banded by where they stopped.
   *
   * The ordering encodes the claim that matters most for this category: **an early drop is much
   * stronger aversion evidence than a late one.** Quitting in the opening chapters rejects
   * premise, art or tone outright. Quitting two hundred chapters in, after months of reading, is
   * overwhelmingly a stall, a hiatus, or one weak arc — a reader who disliked the series would
   * not have got there. `sampled` sits between them and is the case anime has no equivalent for:
   * a real stretch of reading that still never reached a third of a very long work.
   */
  droppedUnratedBailed: -6,
  droppedUnratedSampled: -3.5,
  droppedUnratedPartial: -2,
  droppedUnratedLate: -0.75,
  droppedUnratedUnknownProgress: -2,
} as const;

/**
 * How many of the strongest positive entries form the strength-band denominator.
 *
 * Ten, derived from manga's evidence density rather than inherited from anime's twelve. Two facts
 * about manga libraries set it.
 *
 * *They hold fewer entries than anime libraries at equal commitment.* A manga series is one row;
 * an anime series is a row per season, per cour and per OVA. Anime's twelve is measured after a
 * collapse that typically halves the library; manga's collapse barely changes the count. Keeping
 * twelve would mean the "reference" was routinely the entire library, at which point a pillar's
 * share stops describing prominence and just describes how many titles it happened to cite.
 *
 * *The bands must all be reachable.* A pillar cites at most five titles, so in a perfectly flat
 * library a pillar's ceiling is 5/10 = 0.5 — inside `Strong`, short of `Defining`. `Defining` is
 * then reached only when the cited titles are genuinely heavier than the library average
 * (favourites and 9s against unrated completions), which is exactly what the band should mean.
 * At twelve the ceiling would be 0.42 and `Defining` would need an even more extreme library;
 * at eight a flat library would reach 0.63 and `Defining` would mean nothing at all.
 */
export const MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT = 10;

/**
 * Weight applied to a family's repeat entries beyond its representative.
 *
 * Tighter than anime's 0.4, because manga families are shaped differently. An anime franchise's
 * repeats are mostly further seasons — genuine additional instalments of the same story, each a
 * real viewing decision. A manga family's repeats are more often side stories, gaiden and gag
 * spin-offs, which say much less. Damping harder reflects that the average repeat carries less
 * information here, not that the family matters less.
 */
export const MANGA_AI_FAMILY_REPEAT_DAMPING = 0.35;

/**
 * Ceiling on repeat mass, as a multiple of the representative entry's weight.
 *
 * Damping alone scales a family down but still lets it grow without limit as instalments
 * accumulate. This caps what any one family can contribute at 2.2x its best entry, so a reader
 * who has followed one long series through every sequel and side story reads as holding a strong
 * preference rather than as having only one.
 *
 * This is the second of the two defences against franchise dominance. The first is the collapse
 * to a single representative; the third is the validator's refusal of any pillar whose citations
 * all resolve to one family.
 */
export const MANGA_AI_FAMILY_REPEAT_CAP_MULTIPLE = 1.2;

/**
 * Weight multiplier for derivative entries — one-shots, gaiden, anthologies, 4-koma, doujinshi.
 *
 * Halved rather than dropped, for the same reason anime halves its OVAs: a side story adds little
 * independent information about taste, but the reader did choose to spend more time in that world
 * and that is worth something. Dropping them entirely would also make a library of one-shots
 * invisible rather than merely light, which misrepresents a reader who genuinely reads that way.
 */
export const MANGA_AI_DERIVATIVE_WEIGHT_FACTOR = 0.5;

export type MangaAiEvidenceStatus = 'completed' | 'current' | 'dropped';

export type MangaAiStrengthBand = 'Defining' | 'Strong' | 'Present' | 'Emerging';
export type MangaAiDataSufficiency = 'sparse' | 'adequate' | 'rich';

export type MangaAiEvidenceEntry = {
  identityKey: string;
  familyKey: string;
  representativeTitle: string;
  titles: string[];
  status: MangaAiEvidenceStatus;
  score: number | null;
  favorite: boolean;
  /**
   * Progress, in chapter-equivalents, or null when the unit could not be established.
   *
   * Normalised to one unit before it reaches the model precisely so the model is never asked to
   * work out whether "12" means twelve volumes or twelve chapters — a question the database
   * itself cannot answer for every row.
   */
  chaptersRead: number | null;
  /** Total chapters, only where trustworthy. Null far more often than not; see `history.ts`. */
  totalChapters: number | null;
  /** Total volumes, from `media_items.volumes`. */
  totalVolumes: number | null;
  progressBand: MangaProgressBand;
  /** MAL `media_type`, lowercased: manga, novel, light_novel, one_shot, doujinshi, manhwa. */
  format: string | null;
  /** Publication status: finished, currently_publishing, on_hiatus, discontinued. */
  publicationStatus: string | null;
  startYear: number | null;
  /**
   * MAL's flat label list, which mixes genres, themes and demographics into one array.
   *
   * Surfaced as-is rather than split, because MAL does not mark which is which and guessing would
   * discard real themes. The prompt is what tells the model that a demographic in this list is
   * publishing metadata rather than a taste.
   */
  genres: string[];
  /** True for one-shots, gaiden, anthologies, 4-koma and doujinshi. */
  derivative: boolean;
  /**
   * How much aversion evidence this entry carries: `none`, `weak` or `clear`.
   *
   * Deterministic, and sent to the model rather than left for it to infer from status, score and
   * progress. Graded rather than boolean because "citable" and "sufficient" are different
   * questions, and conflating them produces signals built entirely from lukewarm ratings.
   */
  aversionEvidence: MangaAiAversionEvidence;
  weight: number;
};

export type MangaAiFamilyEvidence = {
  familyKey: string;
  representativeTitle: string;
  titles: string[];
  /** How many works of this family the library holds, before collapse. */
  entryCount: number;
  completionCount: number;
  favoriteCount: number;
  positiveMass: number;
  negativeMass: number;
  genres: string[];
};

export type MangaAiEvidenceDocument = {
  schemaVersion: 1;
  preprocessingVersion: typeof MANGA_AI_EVIDENCE_PREPROCESSING_VERSION;
  category: 'manga';
  entries: MangaAiEvidenceEntry[];
  families: MangaAiFamilyEvidence[];
  dataQuality: {
    /** Collapsed families, not raw library rows. */
    titleCount: number;
    ratedRatio: number;
    favoriteCount: number;
    /**
     * Share of entries with a trustworthy chapter or volume total.
     *
     * Expected to be low, and surfaced for that reason: the drop-point reasoning degrades without
     * a total, and the model should know when its evidence about abandonment is thin rather than
     * assume it is complete.
     */
    lengthDataRatio: number;
    /**
     * Share of entries whose progress unit could be established at all.
     *
     * Manga-specific, and it has no anime counterpart. Anime progress is unambiguously episodes;
     * manga progress is chapters or volumes depending on which importer wrote the row. When this
     * is low the profile rests on status and score alone.
     */
    progressUnitKnownRatio: number;
    /**
     * Entries graded `clear` — those able to carry a negative signal on their own.
     *
     * Surfaced because a library can be rich and still contain no aversion evidence whatsoever: a
     * reader who drops nothing and rates nothing below 7 has told us plenty about what they like
     * and nothing about what they avoid. When this is zero the model is instructed to claim no
     * aversion anywhere, prose included — and the validator enforces it.
     */
    clearAversionCount: number;
    sufficiency: MangaAiDataSufficiency;
  };
};

/**
 * Character bounds shared by the Zod contract and the Gemini `responseSchema`.
 *
 * Both sides MUST agree: a bound Zod enforces but the provider schema omits is a bound the
 * decoder never applies, so the model overruns it and the whole generation is discarded.
 */
export const MANGA_AI_TASTE_TEXT_LIMITS = {
  identityLabel: 48,
  name: 80,
  description: 360,
  summary: 320,
  openQuestion: 140,
} as const;

/** Item-count bounds shared by the Zod contract and the Gemini `responseSchema`. */
export const MANGA_AI_TASTE_LIST_LIMITS = {
  pillarsMin: 2,
  pillarsMax: 4,
  pillarEvidenceMin: 2,
  negativeEvidenceMin: 1,
  evidenceMax: 5,
  negativeSignalsMax: 3,
  openQuestionsMax: 2,
} as const;

/**
 * The manga taste contract.
 *
 * Its own contract, not anime's, and the decision was not made on how the fields look. They look
 * almost identical, and that is the weakest possible reason to share one.
 *
 * *Version coupling is the deciding argument.* Sharing the Zod object means the two categories
 * share `schemaVersion`. Any bound manga later wants to move — a longer `name` for titles like
 * "JoJo's Bizarre Adventure Part 7: Steel Ball Run", a fourth pillar — would force an anime schema
 * bump and invalidate every cached anime profile. Anime is frozen and live-validated; buying manga
 * a shared type at the price of being able to break anime is a bad trade.
 *
 * *`dataQuality` genuinely differs.* Anime reports `episodeDataRatio`. Manga reports
 * `lengthDataRatio` and `progressUnitKnownRatio`, the second of which describes a problem anime
 * does not have. A shared contract would have to carry both categories' fields and let each
 * ignore the other's.
 *
 * *`kind: content | form` is kept, and is right for reading.* Form is not an anime-only idea:
 * episodic versus serialised, arc structure, ensemble versus protagonist focus, dialogue-heavy
 * versus action-heavy panelling are all real, reader-visible properties of how a manga is told.
 * What is deliberately *not* imported is the games enum's `behavior` — "how someone plays" has no
 * reading equivalent, and offering it would invite the model to describe reading habits (bingeing,
 * dropping, re-reading) as though they were taste.
 */
export const AiMangaTasteProfileSchema = z.object({
  schemaVersion: z.literal(MANGA_AI_TASTE_SCHEMA_VERSION),
  identity: z.object({
    label: z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.identityLabel),
    description: z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.description),
  }),
  pillars: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.name),
        kind: z.enum(['content', 'form']),
        description: z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.description),
        evidenceTitles: z
          .array(z.string().trim().min(1))
          .min(MANGA_AI_TASTE_LIST_LIMITS.pillarEvidenceMin)
          .max(MANGA_AI_TASTE_LIST_LIMITS.evidenceMax),
      }),
    )
    .min(MANGA_AI_TASTE_LIST_LIMITS.pillarsMin)
    .max(MANGA_AI_TASTE_LIST_LIMITS.pillarsMax),
  negativeSignals: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.name),
        description: z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.description),
        evidenceTitles: z
          .array(z.string().trim().min(1))
          .min(MANGA_AI_TASTE_LIST_LIMITS.negativeEvidenceMin)
          .max(MANGA_AI_TASTE_LIST_LIMITS.evidenceMax),
      }),
    )
    .max(MANGA_AI_TASTE_LIST_LIMITS.negativeSignalsMax),
  summary: z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.summary),
  openQuestions: z
    .array(z.string().trim().min(1).max(MANGA_AI_TASTE_TEXT_LIMITS.openQuestion))
    .max(MANGA_AI_TASTE_LIST_LIMITS.openQuestionsMax),
});

export type AiMangaTasteProfile = z.infer<typeof AiMangaTasteProfileSchema>;

export type AiMangaTastePillar = AiMangaTasteProfile['pillars'][number] & {
  strengthBand: MangaAiStrengthBand;
};

/**
 * What is cached and returned to the client.
 *
 * Every number on it is produced by deterministic code — the strength band from evidence mass, the
 * data-quality figures from the library. The model contributes only prose and the titles it cites.
 */
export type EnrichedAiMangaTasteProfile = Omit<AiMangaTasteProfile, 'pillars'> & {
  pillars: AiMangaTastePillar[];
  dataQuality: MangaAiEvidenceDocument['dataQuality'];
  source: 'ai' | 'deterministic';
  model: string;
  inputHash: string;
};

export type { MangaAiAversionEvidence };
export type { MangaProgressBand };
