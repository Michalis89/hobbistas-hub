import type { MediaCandidate, MediaHistoryEntry } from '../types';

export type AnimeRecommendationSource = 'backlog' | 'database';
export type AnimeRecommendationSubtype = 'continuation' | 'best_fit' | 'discovery';

export type AnimeTasteProfile = {
  summary: string;
  coreGenres: Array<{ name: string; weight: number }>;
  topThemes: Array<{ name: string; weight: number }>;
  viewerStyles: Array<{ name: string; weight: number }>;
  premiumSignals?: Array<{ name: string; weight: number }>;
  negativeSignals?: Array<{ name: string; weight: number }>;
};

export type AnimeRecommendation = {
  mediaId: number;
  title: string;
  slug?: string;
  cover?: string;
  source: AnimeRecommendationSource;
  subtype: AnimeRecommendationSubtype;
  reason: string;
  confidence: number;
  score: number;
  genres: string[];
  matchedSignals: string[];
};

export type AnimeTasteSignals = {
  battleAxisGenres: Set<string>;
  premiumAxisGenres: Set<string>;
  suspenseAxisGenres: Set<string>;
  lovedGenreKeys: Set<string>;
  avoidedGenreKeys: Set<string>;
  premiumAxisStrength: number;
  hasSingleTenFavoriteMasterpiece: boolean;
  topEvidenceTitles: string[];
};

export type AnimeTasteComputation = {
  profile: AnimeTasteProfile;
  signals: AnimeTasteSignals;
};

export type AnimeRecommendationEngineInput = {
  history: MediaHistoryEntry[];
  backlog: MediaHistoryEntry[];
  databaseCandidates: MediaCandidate[];
  taste: AnimeTasteComputation;
};

/** A discovery candidate after scoring, before any slot or family decision. */
export type ScoredAnimeCandidate = {
  candidate: MediaCandidate;
  score: number;
  matchedSignals: string[];
};

export type AnimeDiscoveryShortlistEntry = ScoredAnimeCandidate & {
  familyKey: string;
  deterministicRank: number;
};

/**
 * What the continuation half of `possibleNext` already consumed by the time discovery is filled.
 *
 * Enough to replay `selectAnimeDiscoveryPicks` over an alternative ordering under exactly the same
 * constraints the deterministic path applied: the same claimed families, the same slot budget.
 */
export type AnimeContinuationContext = {
  chosenFamilyKeys: string[];
  continuationSlotsUsed: number;
  remainingDiscoverySlots: number;
  possibleNextLimit: number;
};

/**
 * Non-user-facing detail about how `possibleNext` was assembled.
 *
 * Never reaches `RecommendationResponse` — the mapper builds its items field by field, so this is
 * dropped at the boundary rather than filtered out of it.
 */
export type AnimeShadowContext = {
  discoveryShortlist: AnimeDiscoveryShortlistEntry[];
  continuationContext: AnimeContinuationContext;
};

export type AnimeRecommendationResult = {
  tasteProfile: AnimeTasteProfile;
  backlogPicks: AnimeRecommendation[];
  possibleNext: AnimeRecommendation[];
  /** Internal only. Not part of any API response — see {@link AnimeShadowContext}. */
  shadowContext?: AnimeShadowContext;
  debug?: {
    completedCount: number;
    inProgressCount: number;
    droppedCount: number;
    backlogCount: number;
  };
};
