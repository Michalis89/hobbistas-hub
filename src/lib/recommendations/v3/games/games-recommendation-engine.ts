import { findBacklogContinuation, findExternalContinuation } from './games-continuations';
import { buildBacklogReason, buildDiscoveryReason } from './games-reasoning';
import {
  extractMainlineSequence,
  normalizeFranchiseFamilyKey,
  normalizeGameIdentityKey,
  normalizePlatformKey,
  titleToSlug,
  toCanonicalGenres,
} from './games-normalizers';
import { toDebugMap } from './games-debug';
import type {
  GameCandidate,
  GameHistoryEntry,
  GameRecommendation,
  GamesContinuationContext,
  GamesDiscoveryShortlistEntry,
  GamesShadowContext,
  RecommendationEngineInput,
  ScoredGameCandidate,
  TasteComputation,
} from './games-types';

const BACKLOG_LIMIT = 4;
const POSSIBLE_NEXT_LIMIT = 4;
const MAX_EXTERNAL_CONTINUATIONS = 2;
const DISCOVERY_MIN_SCORE = 58;

/**
 * How many franchise-distinct discovery candidates are carried on the shadow context.
 *
 * Wide enough that the two or so slots discovery actually gets are drawn from a real field of
 * alternatives, small enough to stay a bounded payload.
 */
export const DISCOVERY_SHORTLIST_LIMIT = 20;

export function buildGamesRecommendations(input: RecommendationEngineInput): {
  backlogPicks: GameRecommendation[];
  possibleNext: GameRecommendation[];
  shadowContext: GamesShadowContext;
} {
  const backlogPicks = pickBacklogRecommendations(input.backlog, input.history, input.taste);
  const possibleNext = pickPossibleNextRecommendations(
    input.databaseCandidates,
    input.history,
    input.backlog,
    input.taste,
  );

  return {
    backlogPicks,
    possibleNext: possibleNext.picks,
    shadowContext: possibleNext.shadowContext,
  };
}

function pickBacklogRecommendations(
  backlog: GameHistoryEntry[],
  history: GameHistoryEntry[],
  taste: TasteComputation,
): GameRecommendation[] {
  const continuationScored: Array<{
    entry: GameHistoryEntry;
    score: number;
    confidence: number;
    matchedSignals: string[];
    debug: Record<string, unknown>;
  }> = [];

  const bestFitScored: Array<{
    entry: GameHistoryEntry;
    score: number;
    confidence: number;
    matchedSignals: string[];
    debug: Record<string, unknown>;
  }> = [];

  for (const entry of backlog) {
    const continuation = findBacklogContinuation(entry, history);
    const fit = scoreBestFitBacklog(entry, history, taste);
    const familyKey = normalizeFranchiseFamilyKey(entry.media.title);

    if (continuation) {
      const progressionPriority = computeNextStepPriority(entry, history);
      const immediateNextBonus = progressionPriority >= 3 ? 12 : 0;
      const skipAheadPenalty = progressionPriority === 2 ? 6 : 0;
      const continuationScore = Math.min(
        100,
        fit.score + 8 + continuation.confidence * 12 + immediateNextBonus - skipAheadPenalty,
      );
      continuationScored.push({
        entry,
        score: continuationScore,
        confidence: Math.min(1, continuationScore / 100),
        matchedSignals: [...continuation.matchedSignals, ...fit.matchedSignals],
        debug: toDebugMap({
          continuationConfidence: continuation.confidence,
          fitScore: fit.score,
          progressionPriority,
          immediateNextBonus,
          skipAheadPenalty,
          franchiseKey: continuation.franchiseKey,
          franchiseFamilyKey: familyKey,
          ...fit.debug,
        }),
      });
      continue;
    }

    bestFitScored.push({
      entry,
      score: fit.score,
      confidence: Math.min(1, fit.score / 100),
      matchedSignals: fit.matchedSignals,
      debug: fit.debug,
    });
  }

  continuationScored.sort((a, b) => b.score - a.score);
  bestFitScored.sort((a, b) => b.score - a.score);

  const selectedContinuation = pickFranchiseDistinctBacklog(
    continuationScored,
    history,
    new Set(),
    continuationScored.length >= 2 ? 2 : continuationScored.length,
  );

  const selected: GameRecommendation[] = selectedContinuation.map(item => ({
    mediaId: item.entry.mediaId,
    title: item.entry.media.title,
    slug: titleToSlug(item.entry.media.title),
    cover: item.entry.media.coverImageLarge || item.entry.media.coverImageMedium || '',
    source: 'backlog',
    subtype: 'continuation',
    reason: buildBacklogReason(item.entry, 'continuation', taste, history),
    confidence: item.confidence,
    score: item.score,
    genres: item.entry.media.genres,
    matchedSignals: item.matchedSignals,
    debug: item.debug,
  }));

  const usedIds = new Set(selected.map(item => item.mediaId));
  const usedFamilies = new Set(selected.map(item => normalizeFranchiseFamilyKey(item.title)));
  const selectedBestFit = pickFranchiseDistinctBacklog(
    bestFitScored,
    history,
    usedFamilies,
    BACKLOG_LIMIT - selected.length,
  );

  for (const item of selectedBestFit) {
    if (selected.length >= BACKLOG_LIMIT) {
      break;
    }
    if (usedIds.has(item.entry.mediaId)) {
      continue;
    }

    selected.push({
      mediaId: item.entry.mediaId,
      title: item.entry.media.title,
      slug: titleToSlug(item.entry.media.title),
      cover: item.entry.media.coverImageLarge || item.entry.media.coverImageMedium || '',
      source: 'backlog',
      subtype: 'best_fit',
      reason: buildBacklogReason(item.entry, 'best_fit', taste, history),
      confidence: item.confidence,
      score: item.score,
      genres: item.entry.media.genres,
      matchedSignals: item.matchedSignals,
      debug: item.debug,
    });
    usedIds.add(item.entry.mediaId);
  }

  return selected.slice(0, BACKLOG_LIMIT);
}

/**
 * Fills the remaining `possibleNext` slots from score-sorted discovery candidates.
 *
 * Lifted verbatim out of the discovery fill loop so the selection rules — one entry per franchise
 * family, families already claimed by continuations excluded, hard slot budget — live in one place
 * and can be replayed over an alternative ordering of the same candidates.
 *
 * Pure and synchronous by contract. Nothing here may become async or reach outside its arguments:
 * that is what keeps an alternative ordering from ever influencing the deterministic path.
 */
export function selectDiscoveryPicks(
  sortedCandidates: readonly ScoredGameCandidate[],
  usedFamilyKeys: ReadonlySet<string>,
  remainingSlots: number,
): ScoredGameCandidate[] {
  if (remainingSlots <= 0) {
    return [];
  }

  const claimedFamilies = new Set(usedFamilyKeys);
  const picks: ScoredGameCandidate[] = [];

  for (const item of sortedCandidates) {
    if (picks.length >= remainingSlots) {
      break;
    }
    const family = normalizeFranchiseFamilyKey(item.candidate.title);
    if (family && claimedFamilies.has(family)) {
      continue;
    }
    if (family) {
      claimedFamilies.add(family);
    }

    picks.push(item);
  }

  return picks;
}

/**
 * Collapses score-sorted discovery candidates to one entry per franchise family.
 *
 * The highest-scoring member wins because the input is already sorted descending, which is also
 * the member the selection loop would have taken. Candidates whose title yields no family key are
 * all kept — there is nothing to collapse them on, and the selection loop treats them the same way.
 */
export function collapseDiscoveryShortlist(
  sortedCandidates: readonly ScoredGameCandidate[],
  limit: number = DISCOVERY_SHORTLIST_LIMIT,
): GamesDiscoveryShortlistEntry[] {
  const seenFamilies = new Set<string>();
  const shortlist: GamesDiscoveryShortlistEntry[] = [];

  for (const item of sortedCandidates) {
    if (shortlist.length >= limit) {
      break;
    }

    const familyKey = normalizeFranchiseFamilyKey(item.candidate.title);
    if (familyKey) {
      if (seenFamilies.has(familyKey)) {
        continue;
      }
      seenFamilies.add(familyKey);
    }

    shortlist.push({ ...item, familyKey, deterministicRank: shortlist.length + 1 });
  }

  return shortlist;
}

function pickPossibleNextRecommendations(
  candidates: GameCandidate[],
  history: GameHistoryEntry[],
  backlog: GameHistoryEntry[],
  taste: TasteComputation,
): { picks: GameRecommendation[]; shadowContext: GamesShadowContext } {
  const libraryIdentityKeys = new Set(
    history.map(item => normalizeGameIdentityKey(item.media.title)).filter(Boolean),
  );
  const backlogIds = new Set(backlog.map(item => item.mediaId));
  const continuationCandidates: ScoredGameCandidate[] = [];

  const discoveryCandidates: ScoredGameCandidate[] = [];

  for (const candidate of candidates) {
    const candidateIdentity = normalizeGameIdentityKey(candidate.title || candidate.slug);
    if (candidateIdentity && libraryIdentityKeys.has(candidateIdentity)) {
      continue;
    }
    if (backlogIds.has(candidate.id)) {
      continue;
    }

    const continuation = findExternalContinuation(candidate, history, backlog);
    const discovery = scoreDiscoveryCandidate(candidate, taste, history);

    if (continuation) {
      const score = Math.min(100, discovery.score + continuation.confidence * 20 + 8);
      continuationCandidates.push({
        candidate,
        score,
        confidence: Math.min(1, score / 100),
        matchedSignals: [...continuation.matchedSignals, ...discovery.matchedSignals],
        debug: toDebugMap({
          continuationConfidence: continuation.confidence,
          baseDiscoveryScore: discovery.score,
          franchiseKey: continuation.franchiseKey,
          ...discovery.debug,
        }),
      });
      continue;
    }

    if (discovery.score >= DISCOVERY_MIN_SCORE) {
      discoveryCandidates.push({
        candidate,
        score: discovery.score,
        confidence: Math.min(1, discovery.score / 100),
        matchedSignals: discovery.matchedSignals,
        debug: discovery.debug,
      });
    }
  }

  continuationCandidates.sort((a, b) => b.score - a.score);
  discoveryCandidates.sort((a, b) => b.score - a.score);

  const selected: GameRecommendation[] = [];
  const selectedFamilyKeys = new Set<string>();

  for (const item of continuationCandidates) {
    if (selected.length >= MAX_EXTERNAL_CONTINUATIONS) {
      break;
    }
    const family = normalizeFranchiseFamilyKey(item.candidate.title);
    if (family && selectedFamilyKeys.has(family)) {
      continue;
    }
    if (family) {
      selectedFamilyKeys.add(family);
    }
    selected.push({
      mediaId: item.candidate.id,
      title: item.candidate.title,
      slug: item.candidate.slug,
      cover: item.candidate.cover,
      source: 'database',
      subtype: 'continuation',
      reason: buildDiscoveryReason(item.candidate, taste, history, true),
      confidence: item.confidence,
      score: item.score,
      genres: item.candidate.genres,
      matchedSignals: item.matchedSignals,
      debug: item.debug,
    });
  }

  const continuationContext: GamesContinuationContext = {
    chosenFamilyKeys: Array.from(selectedFamilyKeys),
    continuationSlotsUsed: selected.length,
    remainingDiscoverySlots: POSSIBLE_NEXT_LIMIT - selected.length,
    possibleNextLimit: POSSIBLE_NEXT_LIMIT,
  };

  const discoveryPicks = selectDiscoveryPicks(
    discoveryCandidates,
    selectedFamilyKeys,
    continuationContext.remainingDiscoverySlots,
  );

  for (const item of discoveryPicks) {
    selected.push({
      mediaId: item.candidate.id,
      title: item.candidate.title,
      slug: item.candidate.slug,
      cover: item.candidate.cover,
      source: 'database',
      subtype: 'discovery',
      reason: buildDiscoveryReason(item.candidate, taste, history, false),
      confidence: item.confidence,
      score: item.score,
      genres: item.candidate.genres,
      matchedSignals: item.matchedSignals,
      debug: item.debug,
    });
  }

  const picks = selected
    .filter(item => {
      const identity = normalizeGameIdentityKey(item.title || item.slug || '');
      return identity ? !libraryIdentityKeys.has(identity) : true;
    })
    .slice(0, POSSIBLE_NEXT_LIMIT);

  return {
    picks,
    shadowContext: {
      discoveryShortlist: collapseDiscoveryShortlist(discoveryCandidates),
      continuationContext,
    },
  };
}

function scoreBestFitBacklog(
  entry: GameHistoryEntry,
  history: GameHistoryEntry[],
  taste: TasteComputation,
): {
  score: number;
  matchedSignals: string[];
  debug: Record<string, unknown>;
} {
  const genres = toCanonicalGenres(entry.media.genres);
  const coreMatch = genres.filter(genre => taste.signals.coreGenreKeys.has(genre)).length;
  const secondaryMatch = genres.filter(genre => taste.signals.secondaryGenreKeys.has(genre)).length;

  const franchiseKey = normalizeFranchiseFamilyKey(entry.media.title);
  const favoriteFranchiseSimilarity = taste.signals.favoriteFranchiseKeys.has(franchiseKey) ? 1 : 0;
  const franchiseFamily = normalizeFranchiseFamilyKey(entry.media.title);
  const highRatedFranchiseAffinity = history.some(
    item =>
      item.status === 'completed' &&
      (item.score ?? 0) >= 8 &&
      normalizeFranchiseFamilyKey(item.media.title) === franchiseFamily,
  )
    ? 1
    : 0;
  const progressionFit = scoreFranchiseProgression(entry, history);
  const sameFamilyBacklogCount = history.filter(
    item =>
      item.status === 'planned' && normalizeFranchiseFamilyKey(item.media.title) === franchiseFamily,
  ).length;
  const familyClutterPenalty = sameFamilyBacklogCount >= 4 ? 8 : sameFamilyBacklogCount >= 3 ? 4 : 0;

  const narrativeSinglePlayerFit =
    (genres.includes('adventure') || genres.includes('role-playing-rpg') || genres.includes('hack-and-slash')) &&
    !genres.includes('moba') &&
    !genres.includes('real-time-strategy-rts');

  const strongRpgCinematicAffinity =
    (genres.includes('role-playing-rpg') ? 1 : 0) +
    (genres.includes('adventure') ? 1 : 0) +
    (genres.includes('shooter') ? 1 : 0);

  const platformTieBreaker = scorePlatformPreference(entry, taste);

  const puzzleNoisePenalty =
    genres.includes('puzzle') && genres.includes('indie') && coreMatch === 0 ? 22 : 0;
  const cozyPenalty = genres.includes('simulation') && !genres.includes('role-playing-rpg') ? 16 : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      coreMatch * 20 +
        secondaryMatch * 8 +
        favoriteFranchiseSimilarity * 8 +
        highRatedFranchiseAffinity * 8 +
        progressionFit +
        (narrativeSinglePlayerFit ? 12 : 0) +
        strongRpgCinematicAffinity * 12 +
        platformTieBreaker -
        familyClutterPenalty -
        puzzleNoisePenalty -
        cozyPenalty,
    ),
  );

  const matchedSignals: string[] = [];
  if (coreMatch > 0) {
    matchedSignals.push('core genre alignment');
  }
  if (favoriteFranchiseSimilarity > 0) {
    matchedSignals.push('favorite-franchise similarity');
  }
  if (highRatedFranchiseAffinity > 0) {
    matchedSignals.push('high-rated franchise affinity');
  }
  if (progressionFit >= 8) {
    matchedSignals.push('franchise progression');
  }
  if (narrativeSinglePlayerFit) {
    matchedSignals.push('single-player narrative fit');
  }
  if (strongRpgCinematicAffinity >= 2) {
    matchedSignals.push('RPG/cinematic affinity');
  }

  return {
    score,
    matchedSignals,
    debug: toDebugMap({
      coreMatch,
      secondaryMatch,
      favoriteFranchiseSimilarity,
      highRatedFranchiseAffinity,
      progressionFit,
      sameFamilyBacklogCount,
      familyClutterPenalty,
      narrativeSinglePlayerFit,
      strongRpgCinematicAffinity,
      platformTieBreaker,
      puzzleNoisePenalty,
      cozyPenalty,
    }),
  };
}

function scoreDiscoveryCandidate(
  candidate: GameCandidate,
  taste: TasteComputation,
  history: GameHistoryEntry[],
): {
  score: number;
  matchedSignals: string[];
  debug: Record<string, unknown>;
} {
  const genres = toCanonicalGenres(candidate.genres);
  const coreMatch = genres.filter(genre => taste.signals.coreGenreKeys.has(genre)).length;
  const secondaryMatch = genres.filter(genre => taste.signals.secondaryGenreKeys.has(genre)).length;

  const narrativeFit =
    (genres.includes('adventure') || genres.includes('role-playing-rpg') || genres.includes('hack-and-slash')) &&
    !genres.includes('moba') &&
    !genres.includes('real-time-strategy-rts');

  const darkFantasyCinematic =
    (genres.includes('role-playing-rpg') ? 1 : 0) +
    (genres.includes('hack-and-slash') ? 1 : 0) +
    (genres.includes('shooter') ? 1 : 0);

  const historyStrength = calculateDiscoveryHistoryStrength(history, genres);

  const popularityBoost = Math.min(8, candidate.popularityScore / 12);
  const platformBoost = scoreCandidatePlatformPreference(candidate, taste);

  const multiplayerPenalty = genres.includes('moba') || genres.includes('real-time-strategy-rts') ? 24 : 0;
  const cozyPenalty = genres.includes('simulation') && !genres.includes('role-playing-rpg') ? 18 : 0;
  const puzzleNoisePenalty = genres.includes('puzzle') && genres.includes('indie') && coreMatch === 0 ? 20 : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      coreMatch * 22 +
        secondaryMatch * 10 +
        (narrativeFit ? 14 : 0) +
        darkFantasyCinematic * 8 +
        Math.min(16, historyStrength) +
        popularityBoost +
        platformBoost -
        multiplayerPenalty -
        cozyPenalty -
        puzzleNoisePenalty,
    ),
  );

  const matchedSignals: string[] = [];
  if (coreMatch > 0) {
    matchedSignals.push('core genre alignment');
  }
  if (narrativeFit) {
    matchedSignals.push('single-player narrative fit');
  }
  if (darkFantasyCinematic >= 2) {
    matchedSignals.push('dark fantasy / cinematic affinity');
  }

  return {
    score,
    matchedSignals,
    debug: toDebugMap({
      coreMatch,
      secondaryMatch,
      narrativeFit,
      darkFantasyCinematic,
      historyStrength,
      popularityBoost,
      platformBoost,
      multiplayerPenalty,
      cozyPenalty,
      puzzleNoisePenalty,
    }),
  };
}

export function calculateDiscoveryHistoryStrength(
  history: GameHistoryEntry[],
  candidateGenres: string[],
): number {
  const genres = toCanonicalGenres(candidateGenres);

  return history.reduce((acc, entry) => {
    const overlap = toCanonicalGenres(entry.media.genres).filter(genre => genres.includes(genre)).length;
    if (overlap === 0) {
      return acc;
    }

    if (entry.status === 'completed') {
      const base = entry.isFavorite ? 2 : 1;
      const scoreBoost = (entry.score ?? 0) / 10;
      return acc + base + scoreBoost;
    }

    if (entry.status === 'current') {
      return acc + (entry.isFavorite ? 0.8 : 0.5);
    }

    if (entry.status === 'planned' || entry.status === 'dropped') {
      return acc;
    }

    return acc;
  }, 0);
}

function scoreFranchiseProgression(entry: GameHistoryEntry, history: GameHistoryEntry[]): number {
  const family = normalizeFranchiseFamilyKey(entry.media.title);
  if (!family) {
    return 0;
  }

  const targetSequence = extractMainlineSequence(entry.media.title);
  const maxCompletedInFamily = history
    .filter(item => item.status === 'completed' && normalizeFranchiseFamilyKey(item.media.title) === family)
    .reduce((max, item) => Math.max(max, extractMainlineSequence(item.media.title) ?? 1), 0);

  if (targetSequence === null || targetSequence <= 1) {
    return maxCompletedInFamily > 0 ? 3 : 0;
  }

  if (targetSequence <= maxCompletedInFamily) {
    return 0;
  }

  if (targetSequence === maxCompletedInFamily + 1) {
    return 12;
  }
  if (maxCompletedInFamily > 0) {
    return 8;
  }
  return 0;
}

function pickFranchiseDistinctBacklog<T extends { entry: GameHistoryEntry; score: number }>(
  items: T[],
  history: GameHistoryEntry[],
  initialUsedFamilies: Set<string>,
  limit: number,
): T[] {
  if (limit <= 0) {
    return [];
  }

  const selected: T[] = [];
  const usedFamilies = new Set(initialUsedFamilies);
  const sorted = [...items].sort((a, b) =>
    compareBacklogRank(a.entry, b.entry, a.score, b.score, history),
  );

  for (const item of sorted) {
    if (selected.length >= limit) {
      break;
    }

    const family = normalizeFranchiseFamilyKey(item.entry.media.title);
    if (family && usedFamilies.has(family)) {
      continue;
    }

    selected.push(item);
    if (family) {
      usedFamilies.add(family);
    }
  }

  if (selected.length < limit) {
    for (const item of sorted) {
      if (selected.length >= limit) {
        break;
      }
      if (selected.includes(item)) {
        continue;
      }
      selected.push(item);
    }
  }

  return selected.sort((a, b) => compareBacklogRank(a.entry, b.entry, a.score, b.score, history));
}

function compareBacklogRank(
  aEntry: GameHistoryEntry,
  bEntry: GameHistoryEntry,
  aScore: number,
  bScore: number,
  history: GameHistoryEntry[],
): number {
  const aStep = computeNextStepPriority(aEntry, history);
  const bStep = computeNextStepPriority(bEntry, history);
  if (bStep !== aStep) {
    return bStep - aStep;
  }

  if (bScore !== aScore) {
    return bScore - aScore;
  }

  const aModern = scoreEntryPlatformTier(aEntry);
  const bModern = scoreEntryPlatformTier(bEntry);
  if (bModern !== aModern) {
    return bModern - aModern;
  }

  const aTitle = aEntry.media.title.toLowerCase();
  const bTitle = bEntry.media.title.toLowerCase();
  const aModernMarker = /\bragnarok\b|\bforbidden west\b|\brebirth\b|\bphantom liberty\b/.test(aTitle) ? 1 : 0;
  const bModernMarker = /\bragnarok\b|\bforbidden west\b|\brebirth\b|\bphantom liberty\b/.test(bTitle) ? 1 : 0;
  if (bModernMarker !== aModernMarker) {
    return bModernMarker - aModernMarker;
  }

  return aTitle.localeCompare(bTitle);
}

function scoreEntryPlatformTier(entry: GameHistoryEntry): number {
  const candidates = [entry.selectedPlatform ?? '', ...entry.media.platforms]
    .map(normalizePlatformKey)
    .filter(Boolean);
  if (candidates.includes('ps5') || candidates.includes('playstation')) {
    return 3;
  }
  if (candidates.includes('ps4')) {
    return 2;
  }
  if (candidates.includes('pc')) {
    return 1;
  }
  return 0;
}

function computeNextStepPriority(entry: GameHistoryEntry, history: GameHistoryEntry[]): number {
  const family = normalizeFranchiseFamilyKey(entry.media.title);
  if (!family) {
    return 0;
  }
  const targetSequence = extractMainlineSequence(entry.media.title);
  if (targetSequence === null) {
    return 1;
  }

  const maxCompleted = history
    .filter(item => item.status === 'completed' && normalizeFranchiseFamilyKey(item.media.title) === family)
    .reduce((max, item) => Math.max(max, extractMainlineSequence(item.media.title) ?? 1), 0);

  if (targetSequence === maxCompleted + 1) {
    return 3;
  }
  if (targetSequence > maxCompleted + 1) {
    return 2;
  }
  return 0;
}

function scorePlatformPreference(entry: GameHistoryEntry, taste: TasteComputation): number {
  const preferred = taste.signals.preferredPlatforms;
  if (preferred.length === 0) {
    return 0;
  }

  const candidates = [entry.selectedPlatform ?? '', ...entry.media.platforms]
    .map(normalizePlatformKey)
    .filter(Boolean);

  if (candidates.includes('ps5') || candidates.includes('playstation')) {
    return 6;
  }
  if (candidates.includes('ps4')) {
    return 4;
  }
  if (candidates.includes('ps3')) {
    return 2;
  }
  if (candidates.includes('ps2')) {
    return 0;
  }
  if (candidates.includes('pc')) {
    return 2;
  }

  const matched = candidates.find(platform => preferred.includes(platform));
  return matched ? 3 : 0;
}

function scoreCandidatePlatformPreference(candidate: GameCandidate, taste: TasteComputation): number {
  const platforms = candidate.platforms.map(normalizePlatformKey).filter(Boolean);
  if (platforms.includes('ps5') || platforms.includes('playstation')) {
    return 6;
  }
  if (platforms.includes('ps4')) {
    return 4;
  }
  if (platforms.includes('ps3')) {
    return 2;
  }
  if (platforms.includes('ps2')) {
    return 0;
  }
  if (platforms.includes('pc')) {
    return 2;
  }

  const preferred = taste.signals.preferredPlatforms;
  return platforms.some(platform => preferred.includes(platform)) ? 3 : 0;
}
