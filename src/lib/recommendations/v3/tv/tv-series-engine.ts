import type { MediaCandidate, MediaHistoryEntry, ScoredItem, UserScoringContext } from '../types';
import { extractFranchiseKey } from '../utils/franchise';
import { getCanonicalKey, normalizeGenres } from '../utils/genre';

export type TvAxisKey =
  | 'prestigeCharacterDrama'
  | 'mythicFantasySaga'
  | 'slowBurnMystery'
  | 'politicalStrategyTension'
  | 'prestigeReflectiveSciFi'
  | 'emotionalLongFormPayoff'
  | 'comfortAdventureSerial'
  | 'crimeThrillerMomentum';

type TvAxisDefinition = {
  key: TvAxisKey;
  name: string;
  requiredGenres: string[];
  boostGenres: string[];
  motifTokens: string[];
};

type AxisContribution = {
  title: string;
  score: number;
};

type RetentionSignals = {
  seasonLoyalty: number;
  bingeMomentum: number;
  cliffhangerRetention: number;
  multiSeasonPatience: number;
  finalePayoffAffinity: number;
  characterAttachmentStrength: number;
};

type TvSemanticCompatibility = {
  tone: number;
  pacing: number;
  worldContinuity: number;
  emotionalDepth: number;
  audienceType: number;
  total: number;
  lowCommitmentMismatch: boolean;
};

export type TvSeriesProfile = {
  coreAxes: Record<TvAxisKey, number>;
  peripheralAxes: Record<TvAxisKey, number>;
  normalizedCoreAxes: Record<TvAxisKey, number>;
  normalizedAxes: Record<TvAxisKey, number>;
  axisEvidence: Record<TvAxisKey, string[]>;
  retention: RetentionSignals;
  franchiseDepthByFamily: Map<string, number>;
  plannedFranchiseDepthByFamily: Map<string, number>;
  droppedGenrePressure: Set<string>;
  comfortAffinity: boolean;
  animationFamilyAffinity: boolean;
};

export type TvIdentityProfile = {
  summary: string;
  coreAxes: Array<{ name: string; weight: number }>;
  behavioralAxes: Array<{ name: string; weight: number }>;
};

const TV_AXES: TvAxisDefinition[] = [
  {
    key: 'prestigeCharacterDrama',
    name: 'Prestige Character Drama',
    requiredGenres: ['drama'],
    boostGenres: ['history', 'biography', 'thriller'],
    motifTokens: ['legacy', 'family', 'dynasty', 'house', 'crown', 'character'],
  },
  {
    key: 'mythicFantasySaga',
    name: 'Mythic Fantasy Saga',
    requiredGenres: ['fantasy', 'adventure'],
    boostGenres: ['drama', 'action'],
    motifTokens: ['kingdom', 'dragon', 'throne', 'realm', 'magic', 'saga'],
  },
  {
    key: 'slowBurnMystery',
    name: 'Slow Burn Mystery',
    requiredGenres: ['mystery', 'thriller'],
    boostGenres: ['drama', 'crime'],
    motifTokens: ['mystery', 'secret', 'truth', 'lost', 'dark', 'burn'],
  },
  {
    key: 'politicalStrategyTension',
    name: 'Political Strategy Tension',
    requiredGenres: ['drama', 'war'],
    boostGenres: ['thriller', 'history'],
    motifTokens: ['politics', 'state', 'power', 'war', 'empire', 'succession'],
  },
  {
    key: 'prestigeReflectiveSciFi',
    name: 'Prestige Reflective Sci-Fi',
    requiredGenres: ['sci-fi-fantasy', 'drama'],
    boostGenres: ['mystery', 'thriller'],
    motifTokens: ['future', 'space', 'time', 'machine', 'mirror', 'android'],
  },
  {
    key: 'emotionalLongFormPayoff',
    name: 'Emotional Long-form Payoff',
    requiredGenres: ['drama'],
    boostGenres: ['romance', 'family', 'biography'],
    motifTokens: ['journey', 'home', 'bond', 'life', 'heart', 'growth'],
  },
  {
    key: 'comfortAdventureSerial',
    name: 'Comfort Adventure Serial',
    requiredGenres: ['adventure', 'comedy'],
    boostGenres: ['family', 'fantasy'],
    motifTokens: ['team', 'crew', 'quest', 'serial', 'comfort'],
  },
  {
    key: 'crimeThrillerMomentum',
    name: 'Crime / Thriller Momentum',
    requiredGenres: ['crime', 'thriller'],
    boostGenres: ['drama', 'mystery'],
    motifTokens: ['case', 'detective', 'killer', 'investigation', 'manhunt'],
  },
];

const AXIS_LABELS: Record<TvAxisKey, string> = TV_AXES.reduce(
  (acc, axis) => ({ ...acc, [axis.key]: axis.name }),
  {} as Record<TvAxisKey, string>,
);

const CANONICAL_DISCOVERY_BOOSTS: Array<{ pattern: RegExp; boost: number }> = [
  { pattern: /\bthe expanse\b/i, boost: 14 },
  { pattern: /\bfoundation\b/i, boost: 13 },
  { pattern: /\bdark\b/i, boost: 13 },
  { pattern: /\bseverance\b/i, boost: 13 },
  { pattern: /\bthe last of us\b/i, boost: 12 },
  { pattern: /\bhouse of the dragon\b/i, boost: 12 },
];

const CANONICAL_BACKLOG_BOOSTS: Array<{ pattern: RegExp; boost: number }> = [
  { pattern: /\bseason\s+\d+\b/i, boost: 10 },
  { pattern: /\bfinal\s+season\b/i, boost: 9 },
  { pattern: /\bpart\s+\d+\b/i, boost: 8 },
];

const LONG_FORM_PATTERN =
  /\b(saga|chronicles|season\s+\d+|part\s+\d+|chapter|legacy|dynasty|kingdom|empire)\b/i;

function emptyAxisRecord(): Record<TvAxisKey, number> {
  return {
    prestigeCharacterDrama: 0,
    mythicFantasySaga: 0,
    slowBurnMystery: 0,
    politicalStrategyTension: 0,
    prestigeReflectiveSciFi: 0,
    emotionalLongFormPayoff: 0,
    comfortAdventureSerial: 0,
    crimeThrillerMomentum: 0,
  };
}

function normalizeAxis(value: number, maxValue: number): number {
  return round2(Math.max(0, Math.min(1, value / maxValue)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function tokenizeTitle(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return new Set(tokens);
}

function looksLikeStandaloneSeries(title: string): boolean {
  const tokenCount = title.trim().split(/\s+/).length;
  return tokenCount <= 4 && !/\bseason\b|\bpart\b|\bfinal\b/i.test(title);
}

function deriveSeriesFamilyKey(title: string): string {
  const stripped = title
    .toLowerCase()
    .replace(/[:\-]\s*.+$/g, '')
    .replace(/\bseason\s+\d+\b|\bpart\s+\d+\b|\bfinal\s+season\b/g, '')
    .replace(/\b(the|a|an|series|show)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped) {
    return extractFranchiseKey(title);
  }
  return stripped.split(' ').slice(0, 3).join('-');
}

function canonicalBoostForTitle(title: string, boosts: Array<{ pattern: RegExp; boost: number }>): number {
  const match = boosts.find(entry => entry.pattern.test(title));
  return match?.boost ?? 0;
}

function topEvidenceTitles(evidence: AxisContribution[]): string[] {
  const deduped = new Map<string, number>();
  for (const entry of evidence) {
    deduped.set(entry.title, Math.max(deduped.get(entry.title) ?? 0, entry.score));
  }
  return Array.from(deduped.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([title]) => title);
}

function hasNoCoreOverlap(genres: string[], loveGenreKeys: Set<string>): boolean {
  if (loveGenreKeys.size === 0) {
    return false;
  }
  return !genres.some(genre => loveGenreKeys.has(genre));
}

function tvCoreTasteWeight(entry: MediaHistoryEntry, familyDepth: number): number {
  if (entry.status === 'dropped' || entry.status === 'planned') {
    return 0;
  }

  const score = entry.score ?? 0;
  const highProgressCurrent = entry.status === 'current' && (entry.progress ?? 0) >= 70;
  const completedMultiSeason = entry.status === 'completed' && familyDepth >= 2;

  if (entry.isFavorite && score >= 9.5) {
    return 1;
  }
  if (entry.isFavorite && score >= 9) {
    return 0.88;
  }
  if (score >= 9) {
    return 0.76;
  }
  if (completedMultiSeason && score >= 8) {
    return 0.62;
  }
  if (highProgressCurrent && score >= 8) {
    return 0.52;
  }

  return 0;
}

function tvPeripheralTasteWeight(entry: MediaHistoryEntry): number {
  if (entry.status === 'planned') {
    return 0;
  }

  const score = entry.score ?? 0;
  const progress = entry.progress ?? 0;

  if (entry.status === 'current') {
    if (progress >= 65) {
      return 0.24;
    }
    if (progress >= 35) {
      return 0.14;
    }
    return 0.06;
  }

  if (entry.status === 'completed') {
    if (score >= 8 && score < 9) {
      return 0.45;
    }
    if (score >= 6 && score < 8) {
      return 0.15;
    }
    if (score > 0 && score <= 5) {
      return 0.05;
    }
  }

  if (entry.status === 'dropped') {
    return 0.05;
  }

  return 0.08;
}

function tvNegativeDriftWeight(entry: MediaHistoryEntry): number {
  if (entry.status !== 'completed' && entry.status !== 'dropped' && entry.status !== 'current') {
    return 0;
  }

  const score = entry.score ?? 0;
  const progress = entry.progress ?? 0;

  if (entry.status === 'dropped') {
    return score <= 5 ? 0.44 : 0.26;
  }

  if (entry.status === 'current' && progress < 25) {
    return 0.22;
  }

  if (score <= 4) {
    return 0.36;
  }
  if (score <= 5.5) {
    return 0.28;
  }

  return 0;
}

function isHighCommitmentEntry(entry: MediaHistoryEntry, familyDepth: number): boolean {
  if (entry.status === 'completed' && familyDepth >= 2) {
    return true;
  }
  if (entry.status === 'current' && (entry.progress ?? 0) >= 75) {
    return true;
  }
  return false;
}

function computeTvAxisFit(
  genres: string[],
  titleTokens: Set<string>,
  axis: TvAxisDefinition,
  entry: MediaHistoryEntry,
): number {
  const required = normalizeGenres(axis.requiredGenres);
  const boosts = normalizeGenres(axis.boostGenres);
  const requiredOverlap = genres.filter(genre => required.includes(genre)).length;
  if (requiredOverlap === 0) {
    return 0;
  }

  const requiredScore = requiredOverlap / required.length;
  const boostScore = Math.min(0.3, genres.filter(genre => boosts.includes(genre)).length * 0.1);
  const motifScore = Math.min(
    0.2,
    axis.motifTokens.reduce((acc, token) => acc + (titleTokens.has(token) ? 0.07 : 0), 0),
  );

  const retentionWeight = isHighCommitmentEntry(entry, 1)
    ? 1.16
    : entry.status === 'current' && (entry.progress ?? 0) >= 65
      ? 1.08
      : 1;

  return Math.min(1, (requiredScore + boostScore + motifScore) * retentionWeight);
}

function computeCandidateAxisFit(
  genres: string[],
  profile: TvSeriesProfile,
): Record<TvAxisKey, number> {
  const fit = emptyAxisRecord();
  const emptyTokens = new Set<string>();

  const pseudoEntry: MediaHistoryEntry = {
    id: 0,
    mediaId: 0,
    status: 'planned',
    score: null,
    progress: null,
    priority: null,
    isFavorite: false,
    pinnedRank: null,
    updatedAt: new Date().toISOString(),
    media: { id: 0, title: '', category: 'tv', genres },
  };

  for (const axis of TV_AXES) {
    const axisFit = computeTvAxisFit(genres, emptyTokens, axis, pseudoEntry);
    const blended = profile.normalizedCoreAxes[axis.key] * 0.86 + profile.normalizedAxes[axis.key] * 0.14;
    const expressionGate = candidateExpressesAxis(genres, axis.key) ? 1 : 0.34;
    fit[axis.key] = round2(axisFit * blended * expressionGate);
  }

  return fit;
}

function countDominantAxes(axisFit: Record<TvAxisKey, number>): number {
  return Object.values(axisFit).filter(v => v >= 0.24).length;
}

function computeThematicSimilarity(axisFit: Record<TvAxisKey, number>): number {
  const ordered = Object.values(axisFit).sort((a, b) => b - a);
  const first = ordered[0] ?? 0;
  const second = ordered[1] ?? 0;
  return round2(Math.min(1, first * 0.66 + second * 0.34));
}

function deriveTvSemanticCompatibility(
  genres: string[],
  axisFit: Record<TvAxisKey, number>,
  profile: TvSeriesProfile,
): TvSemanticCompatibility {
  const isAnimationFamily = genres.includes('animation') || genres.includes('family') || genres.includes('children');
  const isComfort = genres.includes('comedy') || genres.includes('family');
  const isSlowBurn = genres.includes('mystery') || genres.includes('thriller') || genres.includes('drama');
  const isLongFormWorld = genres.includes('fantasy') || genres.includes('sci-fi-fantasy') || genres.includes('drama');

  const tone =
    axisFit.prestigeCharacterDrama * 0.28 +
    axisFit.prestigeReflectiveSciFi * 0.22 +
    axisFit.slowBurnMystery * 0.2 +
    axisFit.emotionalLongFormPayoff * 0.3;

  const pacing = isSlowBurn ? 0.78 : isComfort ? 0.58 : 0.48;
  const worldContinuity =
    isLongFormWorld
      ? profile.retention.multiSeasonPatience >= 0.55
        ? 0.82
        : 0.64
      : profile.retention.multiSeasonPatience >= 0.55
        ? 0.52
        : 0.66;
  const emotionalDepth = genres.includes('drama') || genres.includes('romance') ? 0.8 : 0.52;
  const audienceType = isAnimationFamily
    ? profile.animationFamilyAffinity
      ? 0.72
      : 0.26
    : profile.comfortAffinity
      ? 0.72
      : 0.78;

  const total = round2(
    tone * 0.28 + pacing * 0.17 + worldContinuity * 0.2 + emotionalDepth * 0.2 + audienceType * 0.15,
  );

  return {
    tone: round2(tone),
    pacing: round2(pacing),
    worldContinuity: round2(worldContinuity),
    emotionalDepth: round2(emotionalDepth),
    audienceType: round2(audienceType),
    total,
    lowCommitmentMismatch:
      profile.retention.multiSeasonPatience >= 0.58 &&
      !LONG_FORM_PATTERN.test(genres.join(' ')) &&
      !genres.includes('drama') &&
      !genres.includes('mystery') &&
      !genres.includes('fantasy') &&
      !genres.includes('sci-fi-fantasy'),
  };
}

function detectSeriesContinuation(
  title: string,
  profile: TvSeriesProfile,
): { isDirect: boolean; strength: number; familyKey: string } {
  const familyKey = deriveSeriesFamilyKey(title);
  const depth = profile.franchiseDepthByFamily.get(familyKey) ?? 0;
  const hasMarker = /\bseason\s+\d+|part\s+\d+|final\s+season\b/i.test(title);

  if (depth >= 2 && (hasMarker || !looksLikeStandaloneSeries(title))) {
    return { isDirect: true, strength: Math.min(1, 0.84 + depth * 0.04), familyKey };
  }
  if (depth >= 1 && hasMarker) {
    return { isDirect: true, strength: Math.min(0.92, 0.74 + depth * 0.05), familyKey };
  }

  return { isDirect: false, strength: 0, familyKey };
}

function computeDroppedPressurePenalty(genres: string[], droppedPressure: Set<string>): number {
  if (droppedPressure.size === 0) {
    return 0;
  }
  const overlap = genres.filter(genre => droppedPressure.has(genre)).length;
  return overlap > 0 ? Math.min(16, overlap * 7) : 0;
}

function computeRetentionBacklogBoost(entry: MediaHistoryEntry, profile: TvSeriesProfile): number {
  const continuation = detectSeriesContinuation(entry.media.title, profile);
  const loyalty = profile.retention.seasonLoyalty;
  const patience = profile.retention.multiSeasonPatience;

  if (continuation.isDirect) {
    return 8 + loyalty * 6 + patience * 5;
  }
  return 2 + loyalty * 3 + patience * 2;
}

function computeRetentionDiscoveryBoost(
  candidate: MediaCandidate,
  profile: TvSeriesProfile,
  semantic: TvSemanticCompatibility,
): number {
  const continuation = detectSeriesContinuation(candidate.title, profile);
  const longFormSignal = LONG_FORM_PATTERN.test(candidate.title) ? 1 : 0;
  const loyalty = profile.retention.seasonLoyalty;
  const patience = profile.retention.multiSeasonPatience;
  const cliffhanger = profile.retention.cliffhangerRetention;

  let boost = loyalty * 5 + patience * 4 + cliffhanger * 3;
  if (continuation.isDirect) {
    boost += 6 + continuation.strength * 5;
  }
  if (longFormSignal > 0 && semantic.worldContinuity >= 0.64) {
    boost += 3;
  }

  return boost;
}

function computeTvOrderingBonus(
  candidate: MediaCandidate,
  axisFit: Record<TvAxisKey, number>,
  semantic: TvSemanticCompatibility,
  profile: TvSeriesProfile,
): number {
  const worldbuildingBonus =
    axisFit.mythicFantasySaga >= 0.24 && semantic.worldContinuity >= 0.68 ? 3.8 : 0;
  const reflectiveBonus =
    axisFit.prestigeReflectiveSciFi >= 0.26 && semantic.tone >= 0.6 ? 3.4 : 0;
  const characterBonus =
    axisFit.emotionalLongFormPayoff >= 0.25 && profile.retention.characterAttachmentStrength >= 0.55
      ? 2.8
      : 0;
  const politicalBonus = axisFit.politicalStrategyTension >= 0.24 ? 2.2 : 0;

  const massSpectaclePenalty =
    /\b(heroes|vs\.|war|invasion|battle|league)\b/i.test(candidate.title) && semantic.tone < 0.58
      ? 3.4
      : 0;

  return worldbuildingBonus + reflectiveBonus + characterBonus + politicalBonus - massSpectaclePenalty;
}

function computeTvOrderingTieBreaker(title: string): number {
  const lowered = title.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < lowered.length; i += 1) {
    hash = (hash * 31 + lowered.charCodeAt(i)) % 997;
  }
  return hash / 10000;
}

function candidateExpressesAxis(genres: string[], axis: TvAxisKey): boolean {
  switch (axis) {
    case 'prestigeCharacterDrama':
      return genres.includes('drama');
    case 'mythicFantasySaga':
      return genres.includes('fantasy') && genres.includes('adventure');
    case 'slowBurnMystery':
      return genres.includes('mystery') || (genres.includes('thriller') && genres.includes('drama'));
    case 'politicalStrategyTension':
      return genres.includes('war') || (genres.includes('drama') && genres.includes('history'));
    case 'prestigeReflectiveSciFi':
      return genres.includes('sci-fi-fantasy') && (genres.includes('drama') || genres.includes('mystery'));
    case 'emotionalLongFormPayoff':
      return genres.includes('drama') || genres.includes('romance') || genres.includes('family');
    case 'comfortAdventureSerial':
      return genres.includes('adventure') && (genres.includes('comedy') || genres.includes('family'));
    case 'crimeThrillerMomentum':
      return genres.includes('crime') && genres.includes('thriller');
    default:
      return false;
  }
}

function topTwoExpressedAxisLabels(
  genres: string[],
  axisFit: Record<TvAxisKey, number>,
): [string, string] {
  const ordered = Object.entries(axisFit)
    .sort((a, b) => b[1] - a[1])
    .filter(([axis]) => candidateExpressesAxis(genres, axis as TvAxisKey))
    .slice(0, 2)
    .map(([axis]) => AXIS_LABELS[axis as TvAxisKey].toLowerCase());

  if (ordered.length < 2) {
    return [ordered[0] ?? 'core tv identity', 'long-form retention'];
  }

  return [ordered[0], ordered[1]];
}

function pickDominantExpressedAxis(
  genres: string[],
  axisFit: Record<TvAxisKey, number>,
): TvAxisKey | null {
  const ordered = Object.entries(axisFit).sort((a, b) => b[1] - a[1]);
  for (const [axis, value] of ordered) {
    if (value < 0.2) {
      return null;
    }
    if (candidateExpressesAxis(genres, axis as TvAxisKey)) {
      return axis as TvAxisKey;
    }
  }
  return null;
}

export function buildTvSeriesProfile(history: MediaHistoryEntry[]): TvSeriesProfile {
  const coreAxes = emptyAxisRecord();
  const peripheralAxes = emptyAxisRecord();
  const peripheralNegative = emptyAxisRecord();
  const axisEvidenceRaw: Record<TvAxisKey, AxisContribution[]> = {
    prestigeCharacterDrama: [],
    mythicFantasySaga: [],
    slowBurnMystery: [],
    politicalStrategyTension: [],
    prestigeReflectiveSciFi: [],
    emotionalLongFormPayoff: [],
    comfortAdventureSerial: [],
    crimeThrillerMomentum: [],
  };

  const coreSupport = new Map<TvAxisKey, Set<number>>();
  const peripheralSupport = new Map<TvAxisKey, Set<number>>();
  for (const axis of TV_AXES) {
    coreSupport.set(axis.key, new Set());
    peripheralSupport.set(axis.key, new Set());
  }

  const franchiseDepthByFamily = new Map<string, number>();
  const plannedFranchiseDepthByFamily = new Map<string, number>();
  const droppedGenrePressure = new Set<string>();

  let completedCount = 0;
  let highCommitmentCount = 0;
  let highProgressCurrentCount = 0;
  let favoriteCount = 0;
  let strongCliffhangerCount = 0;
  let comfortCount = 0;
  let animationFamilyCount = 0;

  for (const entry of history) {
    const familyKey = deriveSeriesFamilyKey(entry.media.title);

    if (entry.status === 'planned') {
      plannedFranchiseDepthByFamily.set(
        familyKey,
        (plannedFranchiseDepthByFamily.get(familyKey) ?? 0) + 1,
      );
      continue;
    }

    franchiseDepthByFamily.set(familyKey, (franchiseDepthByFamily.get(familyKey) ?? 0) + 1);

    const genres = normalizeGenres(entry.media.genres);
    const titleTokens = tokenizeTitle(entry.media.title);
    const coreWeight = tvCoreTasteWeight(entry, franchiseDepthByFamily.get(familyKey) ?? 1);
    const peripheralWeight = tvPeripheralTasteWeight(entry);
    const negativeDrift = tvNegativeDriftWeight(entry);

    if (entry.status === 'completed') {
      completedCount += 1;
    }
    if (isHighCommitmentEntry(entry, franchiseDepthByFamily.get(familyKey) ?? 1)) {
      highCommitmentCount += 1;
    }
    if (entry.status === 'current' && (entry.progress ?? 0) >= 65) {
      highProgressCurrentCount += 1;
    }
    if (entry.isFavorite) {
      favoriteCount += 1;
    }
    if ((entry.progress ?? 0) >= 75 || /finale|final/i.test(entry.media.title)) {
      strongCliffhangerCount += 1;
    }
    if (genres.includes('comedy') || genres.includes('family')) {
      comfortCount += 1;
    }
    if (genres.includes('animation') || genres.includes('children') || genres.includes('family')) {
      animationFamilyCount += 1;
    }

    if (entry.status === 'dropped') {
      for (const genre of genres) {
        droppedGenrePressure.add(genre);
      }
    }

    for (const axis of TV_AXES) {
      const fit = computeTvAxisFit(genres, titleTokens, axis, entry);
      if (fit <= 0) {
        continue;
      }

      if (coreWeight > 0) {
        const score = fit * coreWeight;
        coreAxes[axis.key] += score;
        coreSupport.get(axis.key)?.add(entry.mediaId);
        axisEvidenceRaw[axis.key].push({ title: entry.media.title, score: score * 1.2 });
      }

      if (peripheralWeight > 0) {
        const score = fit * peripheralWeight;
        peripheralAxes[axis.key] += score;
        peripheralSupport.get(axis.key)?.add(entry.mediaId);
        if (coreWeight <= 0) {
          axisEvidenceRaw[axis.key].push({ title: entry.media.title, score: score * 0.8 });
        }
      }

      if (negativeDrift > 0) {
        peripheralNegative[axis.key] += fit * negativeDrift;
      }
    }
  }

  for (const axis of TV_AXES) {
    const key = axis.key;
    const coreCount = coreSupport.get(key)?.size ?? 0;
    const peripheralCount = peripheralSupport.get(key)?.size ?? 0;

    peripheralAxes[key] = Math.max(0, peripheralAxes[key] - peripheralNegative[key] * 0.9);

    if (coreCount === 0 && peripheralCount <= 1) {
      peripheralAxes[key] *= 0.3;
    } else if (coreCount === 0 && peripheralCount <= 2) {
      peripheralAxes[key] *= 0.52;
    }
  }

  const blended = emptyAxisRecord();
  for (const axis of TV_AXES) {
    blended[axis.key] = coreAxes[axis.key] * 0.82 + peripheralAxes[axis.key] * 0.18;
  }

  const maxCore = Math.max(...Object.values(coreAxes), 0.001);
  const maxBlended = Math.max(...Object.values(blended), 0.001);

  const normalizedCoreAxes: Record<TvAxisKey, number> = {
    prestigeCharacterDrama: normalizeAxis(coreAxes.prestigeCharacterDrama, maxCore),
    mythicFantasySaga: normalizeAxis(coreAxes.mythicFantasySaga, maxCore),
    slowBurnMystery: normalizeAxis(coreAxes.slowBurnMystery, maxCore),
    politicalStrategyTension: normalizeAxis(coreAxes.politicalStrategyTension, maxCore),
    prestigeReflectiveSciFi: normalizeAxis(coreAxes.prestigeReflectiveSciFi, maxCore),
    emotionalLongFormPayoff: normalizeAxis(coreAxes.emotionalLongFormPayoff, maxCore),
    comfortAdventureSerial: normalizeAxis(coreAxes.comfortAdventureSerial, maxCore),
    crimeThrillerMomentum: normalizeAxis(coreAxes.crimeThrillerMomentum, maxCore),
  };

  const normalizedAxes: Record<TvAxisKey, number> = {
    prestigeCharacterDrama: normalizeAxis(blended.prestigeCharacterDrama, maxBlended),
    mythicFantasySaga: normalizeAxis(blended.mythicFantasySaga, maxBlended),
    slowBurnMystery: normalizeAxis(blended.slowBurnMystery, maxBlended),
    politicalStrategyTension: normalizeAxis(blended.politicalStrategyTension, maxBlended),
    prestigeReflectiveSciFi: normalizeAxis(blended.prestigeReflectiveSciFi, maxBlended),
    emotionalLongFormPayoff: normalizeAxis(blended.emotionalLongFormPayoff, maxBlended),
    comfortAdventureSerial: normalizeAxis(blended.comfortAdventureSerial, maxBlended),
    crimeThrillerMomentum: normalizeAxis(blended.crimeThrillerMomentum, maxBlended),
  };

  const axisEvidence: Record<TvAxisKey, string[]> = {
    prestigeCharacterDrama: topEvidenceTitles(axisEvidenceRaw.prestigeCharacterDrama),
    mythicFantasySaga: topEvidenceTitles(axisEvidenceRaw.mythicFantasySaga),
    slowBurnMystery: topEvidenceTitles(axisEvidenceRaw.slowBurnMystery),
    politicalStrategyTension: topEvidenceTitles(axisEvidenceRaw.politicalStrategyTension),
    prestigeReflectiveSciFi: topEvidenceTitles(axisEvidenceRaw.prestigeReflectiveSciFi),
    emotionalLongFormPayoff: topEvidenceTitles(axisEvidenceRaw.emotionalLongFormPayoff),
    comfortAdventureSerial: topEvidenceTitles(axisEvidenceRaw.comfortAdventureSerial),
    crimeThrillerMomentum: topEvidenceTitles(axisEvidenceRaw.crimeThrillerMomentum),
  };

  const totalEngaged = Math.max(1, completedCount + highProgressCurrentCount);
  const retention: RetentionSignals = {
    seasonLoyalty: round2(clamp01(highCommitmentCount / totalEngaged)),
    bingeMomentum: round2(clamp01((highProgressCurrentCount + completedCount * 0.4) / totalEngaged)),
    cliffhangerRetention: round2(clamp01(strongCliffhangerCount / totalEngaged)),
    multiSeasonPatience: round2(clamp01(highCommitmentCount / Math.max(1, completedCount))),
    finalePayoffAffinity: round2(clamp01((favoriteCount * 0.8 + highCommitmentCount * 0.6) / totalEngaged)),
    characterAttachmentStrength: round2(clamp01((favoriteCount + completedCount * 0.5) / totalEngaged)),
  };

  return {
    coreAxes,
    peripheralAxes,
    normalizedCoreAxes,
    normalizedAxes,
    axisEvidence,
    retention,
    franchiseDepthByFamily,
    plannedFranchiseDepthByFamily,
    droppedGenrePressure,
    comfortAffinity: comfortCount >= Math.max(3, Math.round(totalEngaged * 0.45)),
    animationFamilyAffinity: animationFamilyCount >= Math.max(3, Math.round(totalEngaged * 0.4)),
  };
}

export function filterTvCandidates(
  candidates: MediaCandidate[],
  ctx: UserScoringContext,
  profile: TvSeriesProfile,
): MediaCandidate[] {
  const filtered = candidates.filter(candidate => {
    if (!candidate.title.trim()) {
      return false;
    }

    const genres = normalizeGenres(candidate.genres);
    if (genres.length === 0) {
      return false;
    }

    const axisFit = computeCandidateAxisFit(genres, profile);
    const semantic = deriveTvSemanticCompatibility(genres, axisFit, profile);
    const dominantMatches = countDominantAxes(axisFit);
    const thematic = computeThematicSimilarity(axisFit);
    const continuation = detectSeriesContinuation(candidate.title, profile);
    const familyKey = deriveSeriesFamilyKey(candidate.title);

    const minPopularity = continuation.isDirect ? 34 : 46;
    if (candidate.popularityScore < minPopularity) {
      return false;
    }

    const isAnimationFamily =
      genres.includes('animation') || genres.includes('family') || genres.includes('children');
    const hasStrongMysteryDramaAnchor =
      genres.includes('mystery') || genres.includes('crime') || genres.includes('drama');

    if (isAnimationFamily && !profile.animationFamilyAffinity && !hasStrongMysteryDramaAnchor) {
      return false;
    }

    if (semantic.lowCommitmentMismatch && !continuation.isDirect) {
      return false;
    }

    if (semantic.total < 0.5 && dominantMatches < 2) {
      return false;
    }

    if (thematic < 0.38 && dominantMatches === 0) {
      return false;
    }

    if (semantic.worldContinuity < 0.45 && !continuation.isDirect && candidate.popularityScore < 66) {
      return false;
    }

    if (hasNoCoreOverlap(genres, ctx.loveGenreKeys) && semantic.total < 0.58) {
      return false;
    }

    const plannedDepth = profile.plannedFranchiseDepthByFamily.get(familyKey) ?? 0;
    if (plannedDepth >= 2 && continuation.isDirect) {
      return false;
    }

    return true;
  });

  if (filtered.length > 0) {
    return filtered;
  }

  return candidates.filter(
    c => c.popularityScore >= 54 && normalizeGenres(c.genres).length > 0 && c.title.trim().length > 0,
  );
}

export function scoreTvBacklogItem(
  entry: MediaHistoryEntry,
  ctx: UserScoringContext,
  profile: TvSeriesProfile,
): number {
  const genres = normalizeGenres(entry.media.genres);
  const axisFit = computeCandidateAxisFit(genres, profile);
  const semantic = deriveTvSemanticCompatibility(genres, axisFit, profile);
  const continuation = detectSeriesContinuation(entry.media.title, profile);

  const canonicalBoost = canonicalBoostForTitle(entry.media.title, CANONICAL_BACKLOG_BOOSTS);
  const dominantBoost = countDominantAxes(axisFit) * 8;
  const thematicBoost = computeThematicSimilarity(axisFit) * 26;
  const semanticBoost = semantic.total * 20;
  const retentionBoost = computeRetentionBacklogBoost(entry, profile);
  const continuationBoost = continuation.isDirect ? 8 + continuation.strength * 9 : 0;

  const tonePenalty = semantic.total < 0.46 ? 11 : 0;
  const commitmentPenalty = semantic.lowCommitmentMismatch ? 15 : 0;
  const droppedPenalty = computeDroppedPressurePenalty(genres, profile.droppedGenrePressure);

  const score = Math.max(
    0,
    Math.min(
      100,
      20 +
        canonicalBoost +
        dominantBoost +
        thematicBoost +
        semanticBoost +
        retentionBoost +
        continuationBoost -
        tonePenalty -
        commitmentPenalty -
        droppedPenalty,
    ),
  );

  const favoriteRateBoost = Number.isFinite(ctx.favoriteRate) ? ctx.favoriteRate * 3 : 0;
  return Math.min(100, score + favoriteRateBoost);
}

export function scoreTvDiscoveryCandidate(
  candidate: MediaCandidate,
  baseScore: number,
  profile: TvSeriesProfile,
): number {
  const genres = normalizeGenres(candidate.genres);
  const axisFit = computeCandidateAxisFit(genres, profile);
  const semantic = deriveTvSemanticCompatibility(genres, axisFit, profile);
  const continuation = detectSeriesContinuation(candidate.title, profile);

  const dominantMatches = countDominantAxes(axisFit);
  const thematic = computeThematicSimilarity(axisFit);
  const canonicalBoost = canonicalBoostForTitle(candidate.title, CANONICAL_DISCOVERY_BOOSTS);

  const qualityBoost = Math.min(16, Math.sqrt(Math.max(0, candidate.popularityScore)) * 1.52);
  const dominantBoost = dominantMatches * 7;
  const thematicBoost = thematic * 24;
  const semanticBoost = semantic.total * 22;
  const retentionBoost = computeRetentionDiscoveryBoost(candidate, profile, semantic);
  const continuationBoost = continuation.isDirect ? 8 + continuation.strength * 8 : 0;
  const orderingBonus = computeTvOrderingBonus(candidate, axisFit, semantic, profile);
  const tieBreaker = computeTvOrderingTieBreaker(candidate.title);
  const isAnimationFamily =
    genres.includes('animation') || genres.includes('family') || genres.includes('children');
  const animationMismatchPenalty = isAnimationFamily && !profile.animationFamilyAffinity ? 22 : 0;

  const qualityPenalty = candidate.popularityScore < 50 ? 15 : 0;
  const trustPenalty = candidate.popularityScore < 60 && dominantMatches < 2 ? 11 : 0;
  const thinFitPenalty = dominantMatches === 0 ? 14 : 0;
  const tonePenalty = Math.max(0, (0.56 - semantic.total) * 36);
  const commitmentPenalty = semantic.lowCommitmentMismatch ? 18 : 0;

  const tvScore = Math.max(
    0,
    Math.min(
      100,
      19 +
        qualityBoost +
        dominantBoost +
        thematicBoost +
        semanticBoost +
        retentionBoost +
        continuationBoost +
        orderingBonus +
        tieBreaker +
        canonicalBoost -
        qualityPenalty -
        trustPenalty -
        thinFitPenalty -
        tonePenalty -
        commitmentPenalty -
        animationMismatchPenalty,
    ),
  );

  const cappedScore =
    isAnimationFamily && !profile.animationFamilyAffinity ? Math.min(tvScore, 58) : tvScore;

  return Math.max(cappedScore, baseScore * 0.37);
}

export function calibrateTvConfidence(item: ScoredItem, profile: TvSeriesProfile): number {
  const genres = normalizeGenres(item.genres);
  const axisFit = computeCandidateAxisFit(genres, profile);
  const semantic = deriveTvSemanticCompatibility(genres, axisFit, profile);
  const continuation = detectSeriesContinuation(item.title, profile);
  const isAnimationFamily =
    genres.includes('animation') || genres.includes('family') || genres.includes('children');

  const strongest = Math.max(...Object.values(axisFit));
  const dominant = countDominantAxes(axisFit);
  const thematic = computeThematicSimilarity(axisFit);

  const obvious = dominant >= 3 && strongest >= 0.55 && semantic.total >= 0.78 && thematic >= 0.66;
  const strong = dominant >= 2 && strongest >= 0.44 && semantic.total >= 0.62 && thematic >= 0.54;
  const valid = dominant >= 1 && strongest >= 0.3 && semantic.total >= 0.48 && thematic >= 0.4;

  if (isAnimationFamily && !profile.animationFamilyAffinity) {
    return round2(Math.max(0.4, Math.min(0.56, item.confidence * 0.66)));
  }

  if (semantic.lowCommitmentMismatch) {
    return round2(Math.max(0.44, Math.min(0.58, item.confidence * 0.7)));
  }

  if (continuation.isDirect && continuation.strength >= 0.9 && semantic.total >= 0.72) {
    return round2(0.9 + Math.min(0.06, continuation.strength * 0.04));
  }

  if (obvious) {
    return round2(0.9 + Math.min(0.06, (strongest - 0.55) * 0.34));
  }

  if (strong) {
    return round2(0.75 + Math.min(0.14, (strongest - 0.44) * 0.52));
  }

  if (valid) {
    return round2(0.6 + Math.min(0.14, (strongest - 0.3) * 0.6));
  }

  return round2(Math.max(0.42, Math.min(0.59, item.confidence * 0.72)));
}

export function buildTvReason(item: ScoredItem, profile: TvSeriesProfile): string {
  const genres = normalizeGenres(item.genres);
  const axisFit = computeCandidateAxisFit(genres, profile);
  const semantic = deriveTvSemanticCompatibility(genres, axisFit, profile);
  const continuation = detectSeriesContinuation(item.title, profile);
  const isAnimationFamily =
    genres.includes('animation') || genres.includes('family') || genres.includes('children');

  const dominant = countDominantAxes(axisFit);
  const topTwo = topTwoExpressedAxisLabels(genres, axisFit);

  if (continuation.isDirect) {
    return 'Direct continuation aligned with your season loyalty and finale payoff preferences.';
  }

  if (isAnimationFamily && !profile.animationFamilyAffinity) {
    return 'Lower priority because it leans family-animation more than your core long-form TV profile.';
  }

  if (semantic.lowCommitmentMismatch) {
    return 'Lower priority because it does not align with your multi-season commitment and retention patterns.';
  }

  if (
    (axisFit.slowBurnMystery >= 0.24 &&
      candidateExpressesAxis(genres, 'slowBurnMystery')) ||
    (axisFit.crimeThrillerMomentum >= 0.24 &&
      candidateExpressesAxis(genres, 'crimeThrillerMomentum'))
  ) {
    return 'Matches your strong multi-season mystery retention and tension payoff preferences.';
  }

  if (
    axisFit.prestigeReflectiveSciFi >= 0.24 &&
    candidateExpressesAxis(genres, 'prestigeReflectiveSciFi')
  ) {
    return 'Matches your reflective sci-fi and long-form world continuity preferences.';
  }

  if (
    axisFit.mythicFantasySaga >= 0.24 &&
    candidateExpressesAxis(genres, 'mythicFantasySaga')
  ) {
    return 'Matches your mythic fantasy saga preferences with strong world continuity potential.';
  }

  if (dominant >= 2 && (item.confidence >= 0.84 || item.rawScore >= 82)) {
    return `Strong match for your ${topTwo[0]} and ${topTwo[1]} preferences with long-form retention fit.`;
  }

  if (dominant >= 2) {
    return `Matches your ${topTwo[0]} and ${topTwo[1]} preferences.`;
  }

  const dominantAxis = pickDominantExpressedAxis(genres, axisFit);
  if (dominantAxis) {
    if (dominantAxis === 'slowBurnMystery' || dominantAxis === 'crimeThrillerMomentum') {
      return 'Matches your long-form mystery and tension retention preferences.';
    }
    if (dominantAxis === 'prestigeCharacterDrama' || dominantAxis === 'emotionalLongFormPayoff') {
      return 'Matches your strong multi-season character payoff and emotional return preferences.';
    }
    return `Matches your ${AXIS_LABELS[dominantAxis].toLowerCase()} preferences.`;
  }

  return 'Fits your core TV taste with moderate long-form compatibility.';
}

export function tvIdentitySignalsForProfile(
  profile: TvSeriesProfile,
): Array<{ name: string; weight: number }> {
  const ordered = Object.entries(profile.normalizedAxes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([axisKey, weight]) => ({
      name: AXIS_LABELS[axisKey as TvAxisKey],
      weight: Math.round(weight * 100),
    }));

  ordered.push({ name: 'Season Loyalty', weight: Math.round(profile.retention.seasonLoyalty * 100) });
  ordered.push({ name: 'Binge Momentum', weight: Math.round(profile.retention.bingeMomentum * 100) });
  ordered.push({
    name: 'Finale Payoff Affinity',
    weight: Math.round(profile.retention.finalePayoffAffinity * 100),
  });

  return ordered;
}

export function buildTvIdentityProfile(history: MediaHistoryEntry[]): TvIdentityProfile {
  const profile = buildTvSeriesProfile(history);
  const coreAxes = Object.entries(profile.normalizedAxes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([axisKey, weight]) => ({
      name: AXIS_LABELS[axisKey as TvAxisKey],
      weight: Math.round(weight * 100),
    }));

  const behavioralAxes = [
    { name: 'Season Loyalty', weight: Math.round(profile.retention.seasonLoyalty * 100) },
    { name: 'Binge Momentum', weight: Math.round(profile.retention.bingeMomentum * 100) },
    {
      name: 'Cliffhanger Retention',
      weight: Math.round(profile.retention.cliffhangerRetention * 100),
    },
    {
      name: 'Finale Payoff Affinity',
      weight: Math.round(profile.retention.finalePayoffAffinity * 100),
    },
  ];

  const topAxis = coreAxes[0]?.name.toLowerCase() ?? 'long-form series';
  const secondAxis = coreAxes[1]?.name.toLowerCase() ?? 'character payoff';
  const summary = `Your TV identity blends ${topAxis} with ${secondAxis}, backed by long-form retention signals.`;

  return {
    summary,
    coreAxes,
    behavioralAxes,
  };
}

export function tvAxisNames(): Record<TvAxisKey, string> {
  return { ...AXIS_LABELS };
}

export function normalizeTvGenreKey(raw: string): string | null {
  return getCanonicalKey(raw);
}
