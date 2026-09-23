import type { MediaCandidate, MediaHistoryEntry } from '../types';
import { getCanonicalKey } from '../utils/genre';
import { findBacklogContinuation, findExternalContinuation, type AnimeContinuationMatch } from './anime-continuations';
import { buildBacklogReason, buildDiscoveryReason } from './anime-reasoning';
import {
  getAnimeFranchiseKey,
  getAnimeInstallmentNumber,
  isMajorProgressionEntry,
  isLowValueDerivative,
  titleToSlug,
} from './anime-normalizers';
import type {
  AnimeContinuationContext,
  AnimeDiscoveryShortlistEntry,
  AnimeRecommendation,
  AnimeRecommendationEngineInput,
  AnimeShadowContext,
  AnimeTasteComputation,
  ScoredAnimeCandidate,
} from './anime-types';

const BACKLOG_LIMIT = 4;
const POSSIBLE_NEXT_LIMIT = 4;
const MAX_CONTINUATION_BACKLOG = 2;
const MAX_CONTINUATION_EXTERNAL = 2;
const DISCOVERY_MIN_SCORE = 40;

/**
 * How many franchise-distinct discovery candidates are carried on the shadow context.
 *
 * Wide enough that the two or so slots discovery actually gets are drawn from a real field of
 * alternatives, small enough to stay a bounded payload. Same figure as games, for the same reason.
 */
export const ANIME_DISCOVERY_SHORTLIST_LIMIT = 20;

export function buildAnimeRecommendations(input: AnimeRecommendationEngineInput): {
  backlogPicks: AnimeRecommendation[];
  possibleNext: AnimeRecommendation[];
  shadowContext: AnimeShadowContext;
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

/**
 * Fills the remaining `possibleNext` slots from score-sorted discovery candidates.
 *
 * Lifted verbatim out of the discovery fill loop so the selection rules — one entry per franchise
 * family, families already claimed by continuations excluded, hard slot budget — live in one place
 * and can be replayed over an alternative ordering of the same candidates.
 *
 * Pure and synchronous by contract. Nothing here may become async or reach outside its arguments:
 * that is what keeps an alternative ordering from ever influencing the deterministic path.
 *
 * Note the family check is unconditional, unlike the games engine's. `getAnimeFranchiseKey` can
 * return an empty string for a title it cannot parse, and the deterministic loop this was lifted
 * from treats that empty key as a family like any other — so the first unparseable title claims it
 * and later ones are skipped. Preserved deliberately: the replay has to reproduce what the user
 * was actually served, not a tidier version of it.
 */
export function selectAnimeDiscoveryPicks(
  sortedCandidates: readonly ScoredAnimeCandidate[],
  usedFamilyKeys: ReadonlySet<string>,
  remainingSlots: number,
): ScoredAnimeCandidate[] {
  if (remainingSlots <= 0) {
    return [];
  }

  const claimedFamilies = new Set(usedFamilyKeys);
  const picks: ScoredAnimeCandidate[] = [];

  for (const item of sortedCandidates) {
    if (picks.length >= remainingSlots) {
      break;
    }
    const family = getAnimeFranchiseKey(item.candidate.title);
    if (claimedFamilies.has(family)) {
      continue;
    }
    claimedFamilies.add(family);
    picks.push(item);
  }

  return picks;
}

/**
 * Collapses score-sorted discovery candidates to one entry per franchise family.
 *
 * The highest-scoring member wins because the input is already sorted descending, which is also
 * the member the selection loop would have taken.
 */
export function collapseAnimeDiscoveryShortlist(
  sortedCandidates: readonly ScoredAnimeCandidate[],
  limit: number = ANIME_DISCOVERY_SHORTLIST_LIMIT,
): AnimeDiscoveryShortlistEntry[] {
  const seenFamilies = new Set<string>();
  const shortlist: AnimeDiscoveryShortlistEntry[] = [];

  for (const item of sortedCandidates) {
    if (shortlist.length >= limit) {
      break;
    }

    const familyKey = getAnimeFranchiseKey(item.candidate.title);
    if (seenFamilies.has(familyKey)) {
      continue;
    }
    seenFamilies.add(familyKey);

    shortlist.push({ ...item, familyKey, deterministicRank: shortlist.length + 1 });
  }

  return shortlist;
}

function pickBacklogRecommendations(
  backlog: MediaHistoryEntry[],
  history: MediaHistoryEntry[],
  taste: AnimeTasteComputation,
): AnimeRecommendation[] {
  const familyBacklogCounts = countBacklogFamilies(backlog);
  const rootBacklogCounts = countBacklogRoots(backlog);
  const earliestBacklogInstallments = getEarliestBacklogInstallments(backlog);

  const continuationScored: Array<{
    entry: MediaHistoryEntry;
    score: number;
    rankScore: number;
    continuation: AnimeContinuationMatch;
    matchedSignals: string[];
  }> = [];

  const bestFitScored: Array<{
    entry: MediaHistoryEntry;
    score: number;
    rankScore: number;
    matchedSignals: string[];
  }> = [];

  for (const entry of backlog) {
    const continuation = findBacklogContinuation(entry, history);
    const isDerivative = isLowValueDerivative(entry.media.title);
    const family = getAnimeFranchiseKey(entry.media.title);
    const familyCount = familyBacklogCounts.get(family) ?? 0;
    const installment = getAnimeInstallmentNumber(entry.media.title);
    const isSideEntryClutter = familyCount >= 3 && installment === null && entry.media.title.includes(':');
    if (isSideEntryClutter) {
      continue;
    }
    if (isDerivative && !continuation) {
      continue;
    }
    const fit = scoreBacklogBestFit(
      entry,
      taste,
      familyBacklogCounts,
      rootBacklogCounts,
      earliestBacklogInstallments,
    );

    if (continuation) {
      const isMajorProgression = isMajorProgressionEntry(entry.media.title);
      if (isDerivative && !isMajorProgression) {
        continue;
      }

      const continuationBonus = continuation.immediateNext ? 34 : 20;
      const skipAheadPenalty = continuation.immediateNext ? 0 : 9;
      const derivativePenalty = isDerivative ? 14 : 0;
      const movieStylePenalty = isMovieStyleContinuation(entry.media.title) ? 34 : 0;
      const family = getAnimeFranchiseKey(entry.media.title);
      const familyCount = familyBacklogCounts.get(family) ?? 0;
      const rootCount = rootBacklogCounts.get(getFranchiseRootKey(entry.media.title)) ?? 0;
      const installment = getAnimeInstallmentNumber(entry.media.title);
      const clutterPenalty = familyCount >= 4 ? 28 : 0;
      const sideEntryPenalty =
        familyCount >= 4 && installment === null && entry.media.title.includes(':') ? 24 : 0;
      const rootClutterPenalty = rootCount >= 4 ? 18 : 0;
      const rankScore =
        fit.rankScore +
        continuationBonus +
        continuation.confidence * 12 -
        skipAheadPenalty -
        derivativePenalty -
        movieStylePenalty -
        clutterPenalty -
        sideEntryPenalty -
        rootClutterPenalty;
      const score = Math.min(
        100,
        rankScore,
      );

      continuationScored.push({
        entry,
        score,
        rankScore,
        continuation,
        matchedSignals: [...continuation.matchedSignals, ...fit.matchedSignals],
      });
      continue;
    }

    bestFitScored.push({
      entry,
      score: fit.score,
      rankScore: fit.rankScore,
      matchedSignals: fit.matchedSignals,
    });
  }

  continuationScored.sort((a, b) => b.rankScore - a.rankScore);
  bestFitScored.sort((a, b) => b.rankScore - a.rankScore);

  const selected: AnimeRecommendation[] = [];
  const usedIds = new Set<number>();
  const usedFamilies = new Set<string>();

  for (const item of continuationScored) {
    if (selected.length >= MAX_CONTINUATION_BACKLOG) {
      break;
    }
    if (isMovieStyleContinuation(item.entry.media.title)) {
      continue;
    }

    const family = getAnimeFranchiseKey(item.entry.media.title);
    if (usedFamilies.has(family)) {
      continue;
    }

    selected.push({
      mediaId: item.entry.mediaId,
      title: item.entry.media.title,
      slug: titleToSlug(item.entry.media.title),
      cover: item.entry.media.coverImageLarge || item.entry.media.coverImageMedium || '',
      source: 'backlog',
      subtype: 'continuation',
      reason: buildBacklogReason(item.entry, 'continuation', taste, history),
      confidence: calibrateAnimeConfidence({
        score: item.score,
        subtype: 'continuation',
        genres: item.entry.media.genres,
        taste,
        continuation: item.continuation,
      }),
      score: item.score,
      genres: item.entry.media.genres,
      matchedSignals: item.matchedSignals,
    });
    usedIds.add(item.entry.mediaId);
    usedFamilies.add(family);
  }

  for (const item of bestFitScored) {
    if (selected.length >= BACKLOG_LIMIT) {
      break;
    }
    if (usedIds.has(item.entry.mediaId)) {
      continue;
    }

    const family = getAnimeFranchiseKey(item.entry.media.title);
    if (usedFamilies.has(family) && familyBacklogCounts.get(family)! > 1) {
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
      confidence: calibrateAnimeConfidence({
        score: item.score,
        subtype: 'best_fit',
        genres: item.entry.media.genres,
        taste,
      }),
      score: item.score,
      genres: item.entry.media.genres,
      matchedSignals: item.matchedSignals,
    });
    usedIds.add(item.entry.mediaId);
    usedFamilies.add(family);
  }

  if (selected.length < BACKLOG_LIMIT) {
    for (const item of continuationScored) {
      if (selected.length >= BACKLOG_LIMIT) {
        break;
      }
      if (usedIds.has(item.entry.mediaId)) {
        continue;
      }
      if (isMovieStyleContinuation(item.entry.media.title)) {
        continue;
      }
      const family = getAnimeFranchiseKey(item.entry.media.title);
      const familyCount = familyBacklogCounts.get(family) ?? 0;
      const installment = getAnimeInstallmentNumber(item.entry.media.title);
      if (familyCount >= 3 && installment === null && item.entry.media.title.includes(':')) {
        continue;
      }

      selected.push({
        mediaId: item.entry.mediaId,
        title: item.entry.media.title,
        slug: titleToSlug(item.entry.media.title),
        cover: item.entry.media.coverImageLarge || item.entry.media.coverImageMedium || '',
        source: 'backlog',
        subtype: 'continuation',
        reason: buildBacklogReason(item.entry, 'continuation', taste, history),
        confidence: calibrateAnimeConfidence({
          score: item.score,
          subtype: 'continuation',
          genres: item.entry.media.genres,
          taste,
          continuation: item.continuation,
        }),
        score: item.score,
        genres: item.entry.media.genres,
        matchedSignals: item.matchedSignals,
      });
      usedIds.add(item.entry.mediaId);
    }
  }

  return selected.slice(0, BACKLOG_LIMIT);
}

function pickPossibleNextRecommendations(
  candidates: MediaCandidate[],
  history: MediaHistoryEntry[],
  backlog: MediaHistoryEntry[],
  taste: AnimeTasteComputation,
): { picks: AnimeRecommendation[]; shadowContext: AnimeShadowContext } {
  const ownedKeys = new Set(history.map(item => normalizeIdentityKey(item.media.title)));
  const backlogKeys = new Set(backlog.map(item => normalizeIdentityKey(item.media.title)));
  const backlogFamiliesWithContinuation = new Set(
    backlog
      .map(entry => ({ entry, continuation: findBacklogContinuation(entry, history) }))
      .filter(item => Boolean(item.continuation))
      .map(item => getAnimeFranchiseKey(item.entry.media.title)),
  );

  const continuationCandidates: Array<{
    candidate: MediaCandidate;
    score: number;
    continuation: AnimeContinuationMatch;
    matchedSignals: string[];
  }> = [];

  const discoveryCandidates: ScoredAnimeCandidate[] = [];

  for (const candidate of candidates) {
    const identity = normalizeIdentityKey(candidate.title);
    if (ownedKeys.has(identity) || backlogKeys.has(identity)) {
      continue;
    }

    const continuation = findExternalContinuation(candidate, history);
    const discovery = scoreDiscoveryCandidate(candidate, taste);

    if (continuation) {
      const family = getAnimeFranchiseKey(candidate.title);
      if (backlogFamiliesWithContinuation.has(family)) {
        continue;
      }

      const continuationBonus = continuation.immediateNext ? 24 : 14;
      const derivativePenalty = isLowValueDerivative(candidate.title) ? 22 : 0;
      const movieStylePenalty = isMovieStyleContinuation(candidate.title) ? 28 : 0;
      if (isLowValueDerivative(candidate.title) && !continuation.immediateNext) {
        continue;
      }
      const score = Math.min(100, discovery.score + continuationBonus - derivativePenalty - movieStylePenalty);

      continuationCandidates.push({
        candidate,
        score,
        continuation,
        matchedSignals: [...continuation.matchedSignals, ...discovery.matchedSignals],
      });
      continue;
    }

    if (isLowValueDerivative(candidate.title)) {
      continue;
    }

    if (discovery.score >= DISCOVERY_MIN_SCORE) {
      discoveryCandidates.push({
        candidate,
        score: discovery.score,
        matchedSignals: discovery.matchedSignals,
      });
    }
  }

  continuationCandidates.sort((a, b) => b.score - a.score);
  discoveryCandidates.sort((a, b) => b.score - a.score);

  const selected: AnimeRecommendation[] = [];
  const usedFamilies = new Set<string>();

  for (const item of continuationCandidates) {
    if (selected.length >= MAX_CONTINUATION_EXTERNAL) {
      break;
    }

    const family = getAnimeFranchiseKey(item.candidate.title);
    if (usedFamilies.has(family)) {
      continue;
    }

    selected.push({
      mediaId: item.candidate.id,
      title: item.candidate.title,
      slug: item.candidate.slug,
      cover: item.candidate.cover,
      source: 'database',
      subtype: 'continuation',
      reason: buildDiscoveryReason(item.candidate, taste, item.continuation),
      confidence: calibrateAnimeConfidence({
        score: item.score,
        subtype: 'continuation',
        genres: item.candidate.genres,
        taste,
        continuation: item.continuation,
      }),
      score: item.score,
      genres: item.candidate.genres,
      matchedSignals: item.matchedSignals,
    });
    usedFamilies.add(family);
  }

  const continuationContext: AnimeContinuationContext = {
    chosenFamilyKeys: Array.from(usedFamilies),
    continuationSlotsUsed: selected.length,
    remainingDiscoverySlots: POSSIBLE_NEXT_LIMIT - selected.length,
    possibleNextLimit: POSSIBLE_NEXT_LIMIT,
  };

  const discoveryPicks = selectAnimeDiscoveryPicks(
    discoveryCandidates,
    usedFamilies,
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
      reason: buildDiscoveryReason(item.candidate, taste, null),
      confidence: calibrateAnimeConfidence({
        score: item.score,
        subtype: 'discovery',
        genres: item.candidate.genres,
        taste,
      }),
      score: item.score,
      genres: item.candidate.genres,
      matchedSignals: item.matchedSignals,
    });
    usedFamilies.add(getAnimeFranchiseKey(item.candidate.title));
  }

  return {
    picks: selected.slice(0, POSSIBLE_NEXT_LIMIT),
    shadowContext: {
      discoveryShortlist: collapseAnimeDiscoveryShortlist(discoveryCandidates),
      continuationContext,
    },
  };
}

function scoreBacklogBestFit(
  entry: MediaHistoryEntry,
  taste: AnimeTasteComputation,
  familyBacklogCounts: Map<string, number>,
  rootBacklogCounts: Map<string, number>,
  earliestBacklogInstallments: Map<string, number | null>,
): {
  score: number;
  rankScore: number;
  matchedSignals: string[];
} {
  const canonical = entry.media.genres
    .map(raw => getCanonicalKey(raw))
    .filter((value): value is string => Boolean(value));

  const battleMatch = canonical.filter(genre => taste.signals.battleAxisGenres.has(genre)).length;
  const premiumMatch = canonical.filter(genre => taste.signals.premiumAxisGenres.has(genre)).length;
  const suspenseMatch = canonical.filter(genre => taste.signals.suspenseAxisGenres.has(genre)).length;
  const lovedMatch = canonical.filter(genre => taste.signals.lovedGenreKeys.has(genre)).length;

  const premiumBridgeStrength = Math.min(battleMatch, premiumMatch);
  const qualityBias = premiumMatch > 0 ? Math.min(10, taste.signals.premiumAxisStrength * 0.8) : 0;
  const classicBridgeBonus =
    canonical.includes('action') &&
    canonical.includes('shounen') &&
    canonical.includes('fantasy') &&
    canonical.includes('drama')
      ? 12
      : 0;
  const premiumBridgeBonus = battleMatch >= 2 && premiumMatch >= 2 ? 10 : 0;
  const qualityBridgeBonus =
    canonical.includes('award-winning') ||
    (canonical.includes('drama') && canonical.includes('fantasy') && canonical.includes('shounen'))
      ? 18
      : 0;
  const singleMasterpiecePremiumBonus = getSingleMasterpiecePremiumBonus(canonical, taste);
  const shounenMomentumBonus = canonical.includes('shounen') ? 8 : 0;
  const genericFantasyActionPenalty =
    canonical.includes('action') &&
    canonical.includes('fantasy') &&
    !canonical.includes('shounen') &&
    !canonical.includes('drama') &&
    !canonical.includes('supernatural')
      ? 16
      : 0;

  const family = getAnimeFranchiseKey(entry.media.title);
  const installment = getAnimeInstallmentNumber(entry.media.title);
  const earliestInstallment = earliestBacklogInstallments.get(family);
  const hasUnwatchedPrerequisite =
    installment !== null &&
    earliestInstallment !== undefined &&
    (earliestInstallment === null || earliestInstallment < installment);
  const sameFamilyCount = familyBacklogCounts.get(family) ?? 0;
  const rootCount = rootBacklogCounts.get(getFranchiseRootKey(entry.media.title)) ?? 0;
  const familyClutterPenalty =
    sameFamilyCount >= 6 ? 46 : sameFamilyCount >= 4 ? 30 : sameFamilyCount >= 3 ? 18 : 0;
  const rootClutterPenalty = rootCount >= 4 ? 42 : 0;
  const rootOverflowQualityPenalty =
    rootCount >= 4 && !canonical.includes('drama') && !canonical.includes('supernatural') ? 20 : 0;
  const derivativePenalty = isLowValueDerivative(entry.media.title) ? 24 : 0;
  const avoidedPenalty = canonical.some(genre => taste.signals.avoidedGenreKeys.has(genre)) ? 10 : 0;
  const nonCoreBattlePenalty = battleMatch === 0 ? 28 : 0;
  const unwatchedPrerequisitePenalty = hasUnwatchedPrerequisite ? 36 : 0;

  const rankScore = Math.max(
    0,
    battleMatch * 14 +
      premiumMatch * 16 +
      suspenseMatch * 10 +
      lovedMatch * 6 +
      premiumBridgeStrength * 9 +
      classicBridgeBonus +
      premiumBridgeBonus +
      qualityBridgeBonus +
      singleMasterpiecePremiumBonus +
      shounenMomentumBonus +
      qualityBias -
      familyClutterPenalty -
      rootClutterPenalty -
      rootOverflowQualityPenalty -
      derivativePenalty -
      genericFantasyActionPenalty -
      nonCoreBattlePenalty -
      unwatchedPrerequisitePenalty -
      avoidedPenalty,
  );
  const score = Math.min(100, rankScore);

  const matchedSignals: string[] = [];
  if (battleMatch > 0) {
    matchedSignals.push('battle shounen axis');
  }
  if (premiumMatch > 0) {
    matchedSignals.push('premium fantasy axis');
  }
  if (suspenseMatch > 0) {
    matchedSignals.push('suspense axis');
  }
  if (premiumBridgeStrength >= 2) {
    matchedSignals.push('axis bridge');
  }

  return { score, rankScore, matchedSignals };
}

function scoreDiscoveryCandidate(
  candidate: MediaCandidate,
  taste: AnimeTasteComputation,
): {
  score: number;
  matchedSignals: string[];
} {
  const canonical = candidate.genres
    .map(raw => getCanonicalKey(raw))
    .filter((value): value is string => Boolean(value));

  const battleMatch = canonical.filter(genre => taste.signals.battleAxisGenres.has(genre)).length;
  const premiumMatch = canonical.filter(genre => taste.signals.premiumAxisGenres.has(genre)).length;
  const suspenseMatch = canonical.filter(genre => taste.signals.suspenseAxisGenres.has(genre)).length;
  const lovedMatch = canonical.filter(genre => taste.signals.lovedGenreKeys.has(genre)).length;

  const premiumBridgeStrength = Math.min(battleMatch, premiumMatch);
  const derivativePenalty = isLowValueDerivative(candidate.title) ? 40 : 0;
  const qualityBias = premiumMatch > 0 ? Math.min(12, taste.signals.premiumAxisStrength * 0.9) : 0;
  const singleMasterpiecePremiumBonus = getSingleMasterpiecePremiumBonus(canonical, taste);

  const score = Math.max(
    0,
    Math.min(
      100,
      battleMatch * 14 +
        premiumMatch * 17 +
        suspenseMatch * 11 +
        lovedMatch * 6 +
        premiumBridgeStrength * 8 +
        qualityBias +
        singleMasterpiecePremiumBonus -
        derivativePenalty,
    ),
  );

  const matchedSignals: string[] = [];
  if (battleMatch > 0) {
    matchedSignals.push('battle shounen axis');
  }
  if (premiumMatch > 0) {
    matchedSignals.push('premium fantasy axis');
  }
  if (suspenseMatch > 0) {
    matchedSignals.push('suspense axis');
  }

  return { score, matchedSignals };
}

function countBacklogFamilies(backlog: MediaHistoryEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of backlog) {
    const key = getAnimeFranchiseKey(entry.media.title);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function countBacklogRoots(backlog: MediaHistoryEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of backlog) {
    const key = getFranchiseRootKey(entry.media.title);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function getEarliestBacklogInstallments(backlog: MediaHistoryEntry[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const entry of backlog) {
    const family = getAnimeFranchiseKey(entry.media.title);
    const installment = getAnimeInstallmentNumber(entry.media.title);
    const current = map.get(family);
    if (current === undefined) {
      map.set(family, installment);
      continue;
    }
    if (current === null) {
      continue;
    }
    if (installment === null || installment < current) {
      map.set(family, installment);
    }
  }
  return map;
}

function normalizeIdentityKey(title: string): string {
  const family = getAnimeFranchiseKey(title);
  const installment = getAnimeInstallmentNumber(title);
  return installment !== null ? `${family}#${installment}` : family;
}

function getFranchiseRootKey(title: string): string {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => token !== 'the');

  if (tokens.length === 0) {
    return '';
  }
  if (tokens.length === 1) {
    return tokens[0];
  }
  return `${tokens[0]}-${tokens[1]}`;
}

function isMovieStyleContinuation(title: string): boolean {
  const lowered = title.toLowerCase();
  const isMovie = /\b(movie|film)\b/.test(lowered);
  const hasSeason = /\bseason\s+\d+\b/.test(lowered) || /\b(2nd|3rd|4th|5th|final)\s+season\b/.test(lowered);
  return isMovie && !hasSeason;
}

function getSingleMasterpiecePremiumBonus(canonicalGenres: string[], taste: AnimeTasteComputation): number {
  if (!taste.signals.hasSingleTenFavoriteMasterpiece) {
    return 0;
  }

  const premiumCount = canonicalGenres.filter(genre => taste.signals.premiumAxisGenres.has(genre)).length;
  const hasReflectiveTone =
    canonicalGenres.includes('drama') ||
    canonicalGenres.includes('award-winning') ||
    canonicalGenres.includes('mystery') ||
    canonicalGenres.includes('psychological');

  if (premiumCount >= 3 && hasReflectiveTone) {
    return 2.8;
  }
  if (premiumCount >= 2 && hasReflectiveTone) {
    return 1.6;
  }

  return 0;
}

function calibrateAnimeConfidence(input: {
  score: number;
  subtype: 'continuation' | 'best_fit' | 'discovery';
  genres: string[];
  taste: AnimeTasteComputation;
  continuation?: AnimeContinuationMatch | null;
}): number {
  const canonical = input.genres
    .map(raw => getCanonicalKey(raw))
    .filter((value): value is string => Boolean(value));

  const battleCount = canonical.filter(genre => input.taste.signals.battleAxisGenres.has(genre)).length;
  const premiumCount = canonical.filter(genre => input.taste.signals.premiumAxisGenres.has(genre)).length;
  const suspenseCount = canonical.filter(genre => input.taste.signals.suspenseAxisGenres.has(genre)).length;
  const isBridge = battleCount >= 2 && premiumCount >= 2;

  if (input.subtype === 'continuation') {
    const isDirect = Boolean(input.continuation?.immediateNext);
    const strongMomentum = battleCount >= 2 && input.score >= 92;
    const premiumPerfect = premiumCount >= 3 && input.score >= 92;
    if (isDirect && (strongMomentum || premiumPerfect)) {
      return 1;
    }

    if (isBridge) {
      return toRange(input.score, 0.92, 0.96);
    }
    if (battleCount >= premiumCount) {
      return toRange(input.score, 0.88, 0.93);
    }
    return toRange(input.score, 0.84, 0.90);
  }

  if (isBridge && (canonical.includes('award-winning') || canonical.includes('drama'))) {
    return toRange(input.score, 0.92, 0.96);
  }
  if (battleCount > premiumCount && battleCount >= 2) {
    return toRange(input.score, 0.88, 0.93);
  }
  if (premiumCount >= 2) {
    return toRange(input.score, 0.84, 0.90);
  }
  if (premiumCount >= 1 || suspenseCount >= 2) {
    return toRange(input.score, 0.78, 0.86);
  }

  return toRange(input.score, 0.78, 0.86);
}

function toRange(score: number, min: number, max: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  const normalized = clamped / 100;
  return min + (max - min) * normalized;
}
