export type GameRecommendationSource = 'backlog' | 'database';
export type GameRecommendationSubtype = 'continuation' | 'best_fit' | 'discovery';

export type GamesTasteProfile = {
  summary: string;
  coreGenres: Array<{ name: string; weight: number }>;
  secondaryGenres: Array<{ name: string; weight: number }>;
  themes: Array<{ name: string; weight: number }>;
  playerStyles: Array<{ name: string; weight: number }>;
  negativeSignals: Array<{ name: string; weight: number }>;
  signalTotals?: {
    coreGenres: number;
    themes: number;
    playerStyles: number;
    negativeSignals: number;
  };
};

export type GameRecommendation = {
  mediaId: number;
  title: string;
  slug?: string;
  cover?: string;
  source: GameRecommendationSource;
  subtype: GameRecommendationSubtype;
  reason: string;
  confidence: number;
  score: number;
  genres: string[];
  matchedSignals: string[];
  debug?: Record<string, unknown>;
};

export type GamesRecommendationResult = {
  tasteProfile: GamesTasteProfile;
  backlogPicks: GameRecommendation[];
  possibleNext: GameRecommendation[];
  /** Internal only. Not part of any API response — see {@link GamesShadowContext}. */
  shadowContext?: GamesShadowContext;
  debug?: {
    completedCount: number;
    inProgressCount: number;
    droppedCount: number;
    backlogCount: number;
  };
};

export type GameEntryStatus = 'planned' | 'current' | 'completed' | 'dropped';

export type GameHistoryEntry = {
  id: number;
  mediaId: number;
  status: GameEntryStatus;
  score: number | null;
  progress: number | null;
  priority: number | null;
  isFavorite: boolean;
  pinnedRank: number | null;
  updatedAt: string;
  selectedPlatform?: string | null;
  media: {
    id: number;
    title: string;
    genres: string[];
    themes: string[];
    studios: string[];
    platforms: string[];
    coverImageLarge?: string;
    coverImageMedium?: string;
  };
};

export type GameCandidate = {
  id: number;
  title: string;
  slug: string;
  genres: string[];
  themes: string[];
  platforms: string[];
  cover: string;
  popularityScore: number;
  /**
   * Semantic metadata carried alongside the scoring inputs.
   *
   * Deliberately optional and deliberately unread by the deterministic scorers: these fields exist
   * so a candidate can be described to something other than the genre/theme matcher without
   * changing what the matcher does. `scoreDiscoveryCandidate` and `scoreBestFitBacklog` must never
   * reference them — that is what keeps populating them a no-op for rankings.
   */
  developer?: string | null;
  studios?: string[];
  releaseDate?: string | null;
  gameModes?: string[];
  playerPerspectives?: string[];
  summary?: string | null;
};

/**
 * A candidate paired with its deterministic discovery/continuation score.
 *
 * Shared shape for the two buckets `pickPossibleNextRecommendations` builds, so the selection
 * rules can be applied by a standalone helper instead of an inline loop.
 */
export type ScoredGameCandidate = {
  candidate: GameCandidate;
  score: number;
  confidence: number;
  matchedSignals: string[];
  debug: Record<string, unknown>;
};

/**
 * One franchise family's best-scoring discovery candidate, with its position in the shortlist.
 *
 * `deterministicRank` is the 1-based position *within the collapsed shortlist*, not within the
 * full candidate pool, so it stays meaningful as the shortlist is the only thing a consumer sees.
 */
export type GamesDiscoveryShortlistEntry = ScoredGameCandidate & {
  familyKey: string;
  deterministicRank: number;
};

/**
 * What the continuation half of `possibleNext` already consumed by the time discovery is filled.
 *
 * Enough to replay `selectDiscoveryPicks` over an alternative ordering under exactly the same
 * constraints the deterministic path applied: the same claimed families, the same slot budget.
 */
export type GamesContinuationContext = {
  chosenFamilyKeys: string[];
  continuationSlotsUsed: number;
  remainingDiscoverySlots: number;
  possibleNextLimit: number;
};

/**
 * Non-user-facing detail about how `possibleNext` was assembled.
 *
 * Never reaches `RecommendationResponse` — `mapGamesResultToRecommendationResponse` builds its
 * items field by field, so this is dropped at the boundary rather than filtered out of it.
 */
export type GamesShadowContext = {
  discoveryShortlist: GamesDiscoveryShortlistEntry[];
  continuationContext: GamesContinuationContext;
};

export type TasteSignals = {
  coreGenreKeys: Set<string>;
  secondaryGenreKeys: Set<string>;
  negativeGenreKeys: Set<string>;
  favoriteFranchiseKeys: Set<string>;
  topCompletedTitles: string[];
  preferredPlatforms: string[];
};

export type TasteComputation = {
  profile: GamesTasteProfile;
  signals: TasteSignals;
};

export type RecommendationEngineInput = {
  history: GameHistoryEntry[];
  backlog: GameHistoryEntry[];
  databaseCandidates: GameCandidate[];
  taste: TasteComputation;
};
