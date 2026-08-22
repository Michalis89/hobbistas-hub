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
