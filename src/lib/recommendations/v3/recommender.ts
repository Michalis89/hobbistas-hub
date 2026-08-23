/**
 * V3 Recommendation Orchestrator
 *
 * Shared pipeline with category adapter overrides.
 *
 * Flow:
 *   1. Load history + candidates via adapter.loadData()
 *   2. Build UserScoringContext (clusters, tone, preferences)
 *   3. Score backlog items → top 4
 *   4. Detect continuation candidates
 *   5. Score discovery candidates
 *   6. Fill possibleNext: 2 continuation + 2 discovery (fallback rules)
 *   7. Generate explanations for all items
 *   8. Assemble and return RecommendationResponse
 */

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import type { RecommendationCategory, RecommendationResponse, RecommendationItem, MediaHistoryEntry, UserScoringContext, TasteCluster, ToneProfile, ScoredItem } from './types';
import { generateGamesRecommendationsV3 } from './games/games-recommender';
import type { GamesRecommendationResult } from './games/games-types';
import { generateAnimeRecommendationsV3 } from './anime/anime-recommender';
import type { AnimeRecommendationResult } from './anime/anime-types';
import { extractClusters } from './pipeline/cluster-extractor';
import { inferToneProfile } from './pipeline/tone-inferrer';
import { detectContinuationCandidates } from './pipeline/continuation-detector';
import { scoreBacklogItems } from './pipeline/backlog-scorer';
import { scoreDiscoveryCandidates, selectDiverseDiscovery } from './pipeline/discovery-scorer';
import { generateExplanations, generateTasteSummary } from './pipeline/explanation-generator';
import { getCanonicalKey } from './utils/genre';
import { extractBaseTitle, isEditionVariant } from './utils/franchise';
import type { CategoryAdapter } from './adapters/adapter.types';
import { buildTvIdentityProfile } from './tv/tv-series-engine';
import { buildBooksIdentityProfile } from './books/books-saga-engine';

// ─── Adapter Registry ─────────────────────────────────────────────────────────

import { gamesAdapter } from './adapters/games.adapter';
import { tvAdapter } from './adapters/tv.adapter';
import { moviesAdapter } from './adapters/movies.adapter';
import { animeAdapter } from './adapters/anime.adapter';
import { mangaAdapter } from './adapters/manga.adapter';
import { booksAdapter } from './adapters/books.adapter';

const ADAPTERS: Record<RecommendationCategory, CategoryAdapter> = {
  games: gamesAdapter,
  tv: tvAdapter,
  movies: moviesAdapter,
  anime: animeAdapter,
  manga: mangaAdapter,
  books: booksAdapter,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKLOG_LIMIT = 4;
const POSSIBLE_NEXT_LIMIT = 4;
const CONTINUATION_SLOTS = 2;
const DISCOVERY_SLOTS = 2;
const MIN_CONTINUATION_CONFIDENCE = 0.55;

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Generate V3 recommendations for a user in a given category.
 */
export async function generateRecommendationsV3(
  userId: string,
  category: RecommendationCategory,
): Promise<RecommendationResponse> {
  if (category === 'games') {
    const gamesResult = await generateGamesRecommendationsV3(userId);
    return mapGamesResultToRecommendationResponse(gamesResult);
  }
  if (category === 'anime') {
    const animeResult = await generateAnimeRecommendationsV3(userId);
    return mapAnimeResultToRecommendationResponse(animeResult);
  }

  const adapter = ADAPTERS[category];
  const supabase = await createRouteHandlerClient();

  // ── 1. Load data ──────────────────────────────────────────────────────────
  const { history, candidates } = await adapter.loadData(supabase, userId);

  // ── 2. Build scoring context ──────────────────────────────────────────────
  const ctx = buildScoringContext(history, adapter);

  // ── 3. Apply adapter candidate filter ────────────────────────────────────
  const filteredCandidates = adapter.filterCandidates
    ? adapter.filterCandidates(candidates, ctx)
    : candidates;
  const strictCandidates = excludeOwnedTitleVariants(filteredCandidates, history);

  // ── 4. Score backlog ──────────────────────────────────────────────────────
  const plannedItems = history.filter(e => e.status === 'planned');
  let scoredBacklog = scoreBacklogItems(plannedItems, ctx, adapter.toneDefinitions);

  // Apply adapter backlog overrides
  if (adapter.overrideBacklogScore) {
    scoredBacklog = scoredBacklog.map(item => {
      const entry = plannedItems.find(e => e.mediaId === item.mediaDbId);
      if (!entry) {return item;}
      const override = adapter.overrideBacklogScore!(entry, ctx);
      if (override === null) {return item;}
      return { ...item, rawScore: override };
    });
    scoredBacklog.sort((a, b) => b.rawScore - a.rawScore);
  }

  const backlogItems = scoredBacklog.slice(0, BACKLOG_LIMIT);

  // ── 5. Detect continuation candidates ────────────────────────────────────
  const continuationCandidates = detectContinuationCandidates(
    strictCandidates,
    history,
    adapter.continuationPatterns,
  ).filter(c => c.confidence >= MIN_CONTINUATION_CONFIDENCE);

  // ── 6. Score discovery candidates ────────────────────────────────────────
  // Exclude anything already in continuationCandidates
  const continuationIds = new Set(continuationCandidates.map(c => c.candidate.id));
  const discoveryCandidates = strictCandidates.filter(c => !continuationIds.has(c.id));

  let scoredDiscovery = scoreDiscoveryCandidates(discoveryCandidates, ctx, adapter.toneDefinitions);

  // Apply adapter discovery overrides
  if (adapter.overrideDiscoveryScore) {
    scoredDiscovery = scoredDiscovery.map(item => {
      const candidate = discoveryCandidates.find(c => c.id === item.mediaDbId);
      if (!candidate) {return item;}
      const override = adapter.overrideDiscoveryScore!(candidate, item.rawScore, ctx);
      if (override === null) {return item;}
      return { ...item, rawScore: override };
    });
    scoredDiscovery.sort((a, b) => b.rawScore - a.rawScore);
  }

  const eligibleDiscovery = scoredDiscovery;

  // ── 7. Compose possibleNext with continuation-first slot strategy ─────────
  const possibleNextItems = composePossibleNext(
    continuationCandidates.map(c => continuationToScoredItem(c)),
    selectDiverseDiscovery(eligibleDiscovery, DISCOVERY_SLOTS * 2), // pass extra for diversity
    POSSIBLE_NEXT_LIMIT,
    CONTINUATION_SLOTS,
    DISCOVERY_SLOTS,
  );

  // ── 8. Generate explanations ──────────────────────────────────────────────
  const allItems = [
    ...generateExplanations(backlogItems, ctx, ctx.clusters),
    ...generateExplanations(possibleNextItems, ctx, ctx.clusters),
  ];

  const withExplanations = {
    backlog: allItems.slice(0, backlogItems.length),
    possibleNext: allItems.slice(backlogItems.length),
  };

  // ── 9. Apply post-processing ──────────────────────────────────────────────
  const finalBacklog = adapter.postProcess
    ? adapter.postProcess(withExplanations.backlog, ctx)
    : withExplanations.backlog;
  const finalPossibleNext = adapter.postProcess
    ? adapter.postProcess(withExplanations.possibleNext, ctx)
    : withExplanations.possibleNext;

  // ── 10. Assemble response ─────────────────────────────────────────────────
  return assembleResponse(category, ctx, finalBacklog, finalPossibleNext);
}

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildScoringContext(
  history: MediaHistoryEntry[],
  adapter: CategoryAdapter,
): UserScoringContext {
  // Extract clusters
  const clusters = extractClusters(history, adapter.clusterPrototypes);

  // Infer tone
  const toneProfile = inferToneProfile(history, clusters, adapter.toneDefinitions);

  const isGames = adapter.category === 'games';

  // Top genres/themes/styles
  const genreWeights = isGames ? computeGameGenreWeights(history) : computeGenreWeights(history);
  const topGenres = Array.from(genreWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre, weight]) => ({ genre, weight }));

  const themeWeights = isGames ? computeGameThemeWeights(history, genreWeights) : computeThemeWeights(history);
  const topThemes = Array.from(themeWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([theme, weight]) => ({ theme, weight }));

  const playerStyleWeights = isGames
    ? computeGamePlayerStyles(history, genreWeights)
    : computeGenericPlayerStyles(history);
  const topPlayerStyles = Array.from(playerStyleWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([style, weight]) => ({ style, weight }));

  // Top platforms (games)
  const platformWeights = computePlatformWeights(history);
  const topPlatforms = Array.from(platformWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([platform, weight]) => ({ platform, weight }));

  // Completion + favorite rates
  const engaged = history.filter(e => e.status !== 'planned');
  const completionRate = engaged.length > 0
    ? history.filter(e => e.status === 'completed').length / engaged.length
    : 0;
  const favoriteRate = history.length > 0
    ? history.filter(e => e.isFavorite).length / history.length
    : 0;

  // Loved genres (from favorites + scores >= 8)
  const loveGenreKeys = new Set<string>();
  for (const entry of history) {
    if (!entry.isFavorite && (entry.score ?? 0) < 8) {continue;}
    for (const g of entry.media.genres) {
      const key = getCanonicalKey(g);
      if (key) {loveGenreKeys.add(key);}
    }
  }

  // Avoided genres (dropped >= 3, completion ratio < 0.4)
  const avoidedGenreKeys = buildAvoidedGenres(history);

  // Completed franchise keys (for continuation detection)
  const completedFranchiseKeys = new Set<string>();
  // (populated by continuation-detector, not needed here directly)

  const libraryIds = new Set(history.map(e => e.mediaId));

  return {
    history,
    clusters,
    toneProfile,
    topGenres,
    topThemes,
    topPlayerStyles,
    topPlatforms,
    completionRate,
    favoriteRate,
    completedFranchiseKeys,
    libraryIds,
    avoidedGenreKeys,
    loveGenreKeys,
  };
}

function computeGenreWeights(history: MediaHistoryEntry[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const entry of history) {
    if (entry.status !== 'completed' && entry.status !== 'current') {continue;}
    let w = entry.status === 'completed' ? 1.5 : 1.0;
    if (entry.isFavorite) {w *= 1.4;}
    if (entry.score !== null && entry.score >= 8) {w *= 1.3;}
    for (const g of entry.media.genres) {
      const key = getCanonicalKey(g);
      if (!key) {continue;}
      weights.set(key, (weights.get(key) ?? 0) + w);
    }
  }
  return weights;
}

function computeGameGenreWeights(history: MediaHistoryEntry[]): Map<string, number> {
  const positive = new Map<string, number>();
  const negative = new Map<string, number>();
  const support = new Map<string, number>();

  for (const entry of history) {
    const weight = gameTasteWeight(entry);
    if (weight === 0) {continue;}

    for (const g of entry.media.genres) {
      const key = getCanonicalKey(g);
      if (!key) {continue;}

      if (weight > 0) {
        positive.set(key, (positive.get(key) ?? 0) + weight);
        support.set(key, (support.get(key) ?? 0) + 1);
      } else {
        negative.set(key, (negative.get(key) ?? 0) + Math.abs(weight));
      }
    }
  }

  const result = new Map<string, number>();
  for (const [genre, pos] of positive.entries()) {
    const neg = negative.get(genre) ?? 0;
    const net = pos - neg * 0.95;
    if (net <= 0) {continue;}

    const repeatCount = support.get(genre) ?? 0;
    const isCore = repeatCount >= 3 || net >= 6;
    const isSecondary = repeatCount >= 2 || net >= 3;
    if (!isCore && !isSecondary) {continue;}

    result.set(genre, isCore ? net * 1.15 : net * 0.85);
  }

  return result;
}

function computeThemeWeights(history: MediaHistoryEntry[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const entry of history) {
    if (entry.status !== 'completed' && entry.status !== 'current') {continue;}
    let w = entry.status === 'completed' ? 1.5 : 1.0;
    if (entry.isFavorite) {w *= 1.4;}
    for (const t of entry.media.themes ?? []) {
      const key = getCanonicalKey(t);
      if (!key) {continue;}
      weights.set(key, (weights.get(key) ?? 0) + w);
    }
  }
  return weights;
}

function computeGameThemeWeights(
  history: MediaHistoryEntry[],
  genreWeights: Map<string, number>,
): Map<string, number> {
  const weights = new Map<string, number>();
  const completedOrCurrent = history.filter(e => e.status === 'completed' || e.status === 'current');

  for (const entry of completedOrCurrent) {
    const weight = Math.max(0, gameTasteWeight(entry));
    if (weight <= 0) {continue;}

    for (const rawTheme of entry.media.themes ?? []) {
      const key = getCanonicalKey(rawTheme);
      if (!key) {continue;}
      weights.set(key, (weights.get(key) ?? 0) + weight);
    }
  }

  // Fallback theme synthesis for sparse IGDB theme data.
  const rpg = genreWeights.get('role-playing-rpg') ?? 0;
  const action = (genreWeights.get('hack-and-slash') ?? 0) + (genreWeights.get('shooter') ?? 0);
  const adventure = genreWeights.get('adventure') ?? 0;
  const tactical = (genreWeights.get('strategy') ?? 0) + (genreWeights.get('tactical') ?? 0);

  if (rpg + adventure >= 6) {
    weights.set('narrative-driven worlds', (weights.get('narrative-driven worlds') ?? 0) + (rpg + adventure) * 0.6);
  }
  if (rpg + action >= 6) {
    weights.set('dark fantasy action', (weights.get('dark fantasy action') ?? 0) + (rpg + action) * 0.5);
  }
  if (adventure + action >= 7) {
    weights.set('cinematic single-player campaigns', (weights.get('cinematic single-player campaigns') ?? 0) + (adventure + action) * 0.55);
  }
  if (tactical >= 4) {
    weights.set('choice-driven progression', (weights.get('choice-driven progression') ?? 0) + tactical * 0.7);
  }

  const indieDroppedPenalty = history
    .filter(e => e.status === 'dropped')
    .reduce((acc, entry) => {
      const genres = entry.media.genres.map(g => getCanonicalKey(g)).filter(Boolean);
      return genres.includes('indie') || genres.includes('puzzle') ? acc + Math.abs(gameTasteWeight(entry)) : acc;
    }, 0);

  if (indieDroppedPenalty > 0) {
    weights.set('cozy simulation experiments', Math.max(0, (weights.get('cozy simulation experiments') ?? 0) - indieDroppedPenalty));
    weights.set('psychological horror', 0);
  }

  return weights;
}

function computeGenericPlayerStyles(history: MediaHistoryEntry[]): Map<string, number> {
  const engaged = history.filter(e => e.status === 'completed' || e.status === 'current');
  const result = new Map<string, number>();
  if (engaged.length === 0) {return result;}

  const completionWeight = history.filter(e => e.status === 'completed').length / engaged.length;
  result.set('completion-focused', completionWeight);
  if (history.some(e => e.isFavorite)) {result.set('favorites-led curation', 0.6);}
  return result;
}

function computeGamePlayerStyles(
  history: MediaHistoryEntry[],
  genreWeights: Map<string, number>,
): Map<string, number> {
  const styles = new Map<string, number>();
  const engaged = history.filter(e => e.status === 'completed' || e.status === 'current');
  if (engaged.length === 0) {return styles;}

  const singlePlayerScore =
    (genreWeights.get('adventure') ?? 0) +
    (genreWeights.get('role-playing-rpg') ?? 0) +
    (genreWeights.get('hack-and-slash') ?? 0) -
    ((genreWeights.get('moba') ?? 0) + (genreWeights.get('real-time-strategy-rts') ?? 0));

  const franchiseScore = history
    .filter(e => e.status === 'completed' || e.status === 'current')
    .reduce((acc, entry) => acc + (entry.isFavorite ? 1.2 : 0.6), 0);

  const challengeScore =
    (genreWeights.get('role-playing-rpg') ?? 0) +
    (genreWeights.get('hack-and-slash') ?? 0) +
    (genreWeights.get('tactical') ?? 0);

  if (singlePlayerScore > 0) {styles.set('single-player narrative immersion', singlePlayerScore);}
  if (franchiseScore > 0) {styles.set('franchise continuation focus', franchiseScore);}
  if (challengeScore > 0) {styles.set('challenge-driven action RPG', challengeScore * 0.7);}

  return styles;
}

function computePlatformWeights(history: MediaHistoryEntry[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const entry of history) {
    if (entry.status !== 'completed' && entry.status !== 'current') {continue;}
    const platform = entry.selectedPlatform ?? entry.media.platforms?.[0];
    if (!platform) {continue;}
    weights.set(platform, (weights.get(platform) ?? 0) + 1);
  }
  return weights;
}

function buildAvoidedGenres(history: MediaHistoryEntry[]): Set<string> {
  const stats = new Map<string, { dropped: number; completed: number }>();

  for (const entry of history) {
    if (entry.status !== 'dropped' && entry.status !== 'completed') {continue;}
    for (const g of entry.media.genres) {
      const key = getCanonicalKey(g);
      if (!key) {continue;}
      const s = stats.get(key) ?? { dropped: 0, completed: 0 };
      if (entry.status === 'dropped') {s.dropped += 1;}
      else {s.completed += 1;}
      stats.set(key, s);
    }
  }

  const avoided = new Set<string>();
  for (const [key, s] of stats.entries()) {
    const total = s.dropped + s.completed;
    const ratio = total > 0 ? s.completed / total : 0;
    if (s.dropped >= 3 && ratio < 0.4) {avoided.add(key);}
  }
  return avoided;
}

function gameTasteWeight(entry: MediaHistoryEntry): number {
  if (entry.status === 'planned') {return 0;}

  if (entry.status === 'current') {
    return 0.7;
  }

  if (entry.status === 'completed') {
    let weight = 1;
    if (entry.score !== null) {
      if (entry.score >= 9) {weight += 2;}
      else if (entry.score >= 8) {weight += 1;}
    }
    if (entry.isFavorite) {weight += 3;}
    return weight;
  }

  if (entry.status === 'dropped') {
    let weight = -1;
    if (entry.score !== null && entry.score <= 5) {weight -= 1;}
    return weight;
  }

  return 0;
}

// ─── Slot Composition ─────────────────────────────────────────────────────────

export function composePossibleNext(
  continuationItems: ScoredItem[],
  discoveryItems: ScoredItem[],
  total: number,
  continuationSlots: number,
  _discoverySlots: number,
): ScoredItem[] {
  const result: ScoredItem[] = [];

  // Fill continuation slots first
  const continuationFill = Math.min(continuationItems.length, continuationSlots);
  result.push(...continuationItems.slice(0, continuationFill));

  // Remaining slots go to discovery
  const remainingSlots = total - result.length;
  result.push(...selectDiverseDiscovery(discoveryItems, remainingSlots));

  return result.slice(0, total);
}

export function composeBacklogWithContinuationBalance(
  backlogItems: ScoredItem[],
  total: number,
  continuationSlots: number,
): ScoredItem[] {
  if (total <= 0 || backlogItems.length === 0) {return [];}

  const continuation = backlogItems.filter(item => item.franchiseKey !== null);
  const nonContinuation = backlogItems.filter(item => item.franchiseKey === null);

  const continuationFill = Math.min(continuation.length, continuationSlots);
  const selected: ScoredItem[] = continuation.slice(0, continuationFill);

  const nonContinuationFill = Math.min(nonContinuation.length, total - selected.length);
  selected.push(...nonContinuation.slice(0, nonContinuationFill));

  // If non-continuation items are sparse, fill any remaining slots from continuation tail.
  if (selected.length < total) {
    const remaining = total - selected.length;
    selected.push(...continuation.slice(continuationFill, continuationFill + remaining));
  }

  return selected.slice(0, total);
}

function continuationToScoredItem(
  c: ReturnType<typeof detectContinuationCandidates>[number],
): ScoredItem {
  return {
    mediaDbId: c.candidate.id,
    title: c.candidate.title,
    cover: c.candidate.cover,
    slug: c.candidate.slug,
    genres: c.candidate.genres,
    themes: c.candidate.themes,
    platforms: c.candidate.platforms,
    source: 'continuation',
    rawScore: c.confidence * 100,
    confidence: c.confidence,
    clusterMatch: null,
    toneMatch: null,
    franchiseKey: c.franchiseKey,
    matchedSignals: ['franchise continuation'],
    reason: c.reason,
  };
}

function excludeOwnedTitleVariants<T extends { id: number; title: string }>(
  candidates: T[],
  history: MediaHistoryEntry[],
): T[] {
  const ownedBaseTitles = new Set(history.map(entry => extractBaseTitle(entry.media.title)));

  return candidates.filter(candidate => {
    if (!isEditionVariant(candidate.title)) {return true;}
    const candidateBase = extractBaseTitle(candidate.title);
    return !ownedBaseTitles.has(candidateBase);
  });
}

// ─── Response Assembly ────────────────────────────────────────────────────────

function assembleResponse(
  category: RecommendationCategory,
  ctx: UserScoringContext,
  backlog: ScoredItem[],
  possibleNext: ScoredItem[],
): RecommendationResponse {
  const topClusters: TasteCluster[] = ctx.clusters.slice(0, 5).map(c => ({
    name: c.prototype.name,
    weight: c.weight,
    signals: c.evidenceTitles,
  }));

  const toneProfile: ToneProfile = ctx.toneProfile;

  const toneSummary =
    toneProfile.toneLabels.length > 0
      ? toneProfile.toneLabels.slice(0, 3).join(', ')
      : 'varied taste';

  const summary = category === 'games'
    ? generateGamesTasteSummary(ctx)
    : generateTasteSummary(ctx.clusters, toneProfile.primaryTone, category);
  const tvIdentity = category === 'tv' ? buildTvIdentityProfile(ctx.history) : null;
  const booksIdentity = category === 'books' ? buildBooksIdentityProfile(ctx.history) : null;

  const makeItem = (item: ScoredItem): RecommendationItem => ({
    id: `rec-${category}-${item.mediaDbId}`,
    mediaDbId: item.mediaDbId,
    title: item.title,
    cover: item.cover,
    slug: item.slug,
    category,
    source: item.source,
    confidence: Math.round(item.confidence * 100) / 100,
    reason: item.reason,
    matchedSignals: item.matchedSignals,
  });

  return {
    category,
    tasteProfile: {
      topGenres: ctx.topGenres
        .slice(0, category === 'games' ? 3 : 8)
        .map(({ genre, weight }) => ({ name: genre, weight: Math.min(1, weight / 20) })),
      topTags: ctx.topThemes
        .slice(0, category === 'games' ? 3 : 6)
        .map(({ theme, weight }) => ({ name: theme, weight: Math.min(1, weight / 10) })),
      topPlayerStyles: ctx.topPlayerStyles
        .slice(0, category === 'games' ? 2 : 3)
        .map(({ style, weight }) => ({ name: style, weight: Math.min(1, weight / 12) })),
      topPlatforms: ctx.topPlatforms
        .slice(0, 3)
        .map(({ platform, weight }) => ({ name: platform, weight: Math.min(1, weight / 10) })),
      topClusters,
      toneProfile,
      toneSummary,
      summary,
      ...(tvIdentity
        ? {
            coreAxes: tvIdentity.coreAxes,
            behavioralAxes: tvIdentity.behavioralAxes,
            tvIdentitySummary: tvIdentity.summary,
          }
        : {}),
      ...(booksIdentity
        ? {
            coreAxes: booksIdentity.coreAxes,
            readingSignals: booksIdentity.readingSignals,
            booksIdentitySummary: booksIdentity.summary,
          }
        : {}),
    },
    fromBacklog: backlog.map(makeItem),
    possibleNext: possibleNext.map(makeItem),
  };
}

function generateGamesTasteSummary(ctx: UserScoringContext): string {
  const topGenres = ctx.topGenres.slice(0, 3).map(({ genre }) => genre);
  const topThemes = ctx.topThemes.slice(0, 3).map(({ theme }) => theme);
  const topStyles = ctx.topPlayerStyles.slice(0, 2).map(({ style }) => style);

  if (topGenres.length === 0) {
    return 'Your games taste is still forming; complete more titles to sharpen recommendations.';
  }

  const genrePhrase = topGenres.slice(0, 2).join(' + ');
  const themePhrase = topThemes.length > 0 ? topThemes[0] : 'narrative progression';
  const stylePhrase = topStyles.length > 0 ? topStyles[0] : 'single-player focus';

  return `Your taste centers on ${genrePhrase}, with a strong pull toward ${themePhrase} and ${stylePhrase}.`;
}

function mapGamesResultToRecommendationResponse(
  result: GamesRecommendationResult,
): RecommendationResponse {
  const topClusters: TasteCluster[] = result.tasteProfile.coreGenres.map(item => ({
    name: `core:${item.name}`,
    weight: Math.min(1, item.weight / 10),
    signals: [item.name],
  }));

  const toneLabels = result.tasteProfile.themes.slice(0, 3).map(item => item.name);
  const toneProfile: ToneProfile = {
    primaryTone: toneLabels[0] ?? 'varied',
    toneLabels,
    confidence: result.tasteProfile.coreGenres.length > 0 ? 0.85 : 0.35,
  };

  const makeItem = (
    item: GamesRecommendationResult['backlogPicks'][number],
  ): RecommendationItem => ({
    id: `rec-games-${item.mediaId}`,
    mediaDbId: item.mediaId,
    title: item.title,
    cover: item.cover ?? '',
    slug: item.slug ?? '',
    category: 'games',
    source:
      item.subtype === 'continuation'
        ? 'continuation'
        : item.source === 'backlog'
          ? 'backlog'
          : 'discovery',
    confidence: item.confidence,
    reason: item.reason,
    matchedSignals: item.matchedSignals,
  });

  const mappedTasteProfile = {
    topGenres: [
      ...result.tasteProfile.coreGenres.map(item => ({
        name: item.name,
        weight: Math.min(1, item.weight / 10),
      })),
      ...result.tasteProfile.secondaryGenres.map(item => ({
        name: item.name,
        weight: Math.min(1, item.weight / 10),
      })),
    ].slice(0, 8),
    topTags: result.tasteProfile.themes.map(item => ({
      name: item.name,
      weight: Math.min(1, item.weight / 10),
    })),
    topPlayerStyles: result.tasteProfile.playerStyles.map(item => ({
      name: item.name,
      weight: Math.min(1, item.weight / 10),
    })),
    topPlatforms: [],
    topClusters,
    toneProfile,
    toneSummary: result.tasteProfile.summary,
    summary: result.tasteProfile.summary,
    // Expose raw V3 identity fields so dashboard games card can render identity mode.
    coreGenres: result.tasteProfile.coreGenres,
    secondaryGenres: result.tasteProfile.secondaryGenres,
    themes: result.tasteProfile.themes,
    playerStyles: result.tasteProfile.playerStyles,
    negativeSignals: result.tasteProfile.negativeSignals,
    // Full unsliced signal mass per bucket. The dashboard card divides by these instead of the
    // visible top-N sum, so percentages stop being forced to 100%.
    signalTotals: result.tasteProfile.signalTotals,
  };

  // `result.shadowContext` stops here on purpose: this object is built field by field, so the
  // internal discovery shortlist and continuation context are dropped at the API boundary rather
  // than being filtered out of it. Nothing downstream can see them by accident.
  return {
    category: 'games',
    tasteProfile: mappedTasteProfile as RecommendationResponse['tasteProfile'],
    fromBacklog: result.backlogPicks.map(makeItem),
    possibleNext: result.possibleNext.map(makeItem),
  };
}

function mapAnimeResultToRecommendationResponse(
  result: AnimeRecommendationResult,
): RecommendationResponse {
  const topClusters: TasteCluster[] = result.tasteProfile.coreGenres.map(item => ({
    name: `core:${item.name}`,
    weight: Math.min(1, item.weight / 12),
    signals: [item.name],
  }));

  const toneLabels = result.tasteProfile.topThemes.slice(0, 3).map(item => item.name);
  const toneProfile: ToneProfile = {
    primaryTone: toneLabels[0] ?? 'varied',
    toneLabels,
    confidence: result.tasteProfile.coreGenres.length > 0 ? 0.82 : 0.35,
  };

  const makeItem = (
    item: AnimeRecommendationResult['backlogPicks'][number],
  ): RecommendationItem => ({
    id: `rec-anime-${item.mediaId}`,
    mediaDbId: item.mediaId,
    title: item.title,
    cover: item.cover ?? '',
    slug: item.slug ?? '',
    category: 'anime',
    source:
      item.subtype === 'continuation'
        ? 'continuation'
        : item.source === 'backlog'
          ? 'backlog'
          : 'discovery',
    confidence: item.confidence,
    reason: item.reason,
    matchedSignals: item.matchedSignals,
  });

  const mappedTasteProfile = {
    topGenres: result.tasteProfile.coreGenres.map(item => ({
      name: item.name,
      weight: Math.min(1, item.weight / 12),
    })),
    topTags: result.tasteProfile.topThemes.map(item => ({
      name: item.name,
      weight: Math.min(1, item.weight / 12),
    })),
    topPlayerStyles: result.tasteProfile.viewerStyles.map(item => ({
      name: item.name,
      weight: Math.min(1, item.weight / 12),
    })),
    topPlatforms: [],
    topClusters,
    toneProfile,
    toneSummary: result.tasteProfile.summary,
    summary: result.tasteProfile.summary,
    coreGenres: result.tasteProfile.coreGenres,
    topThemes: result.tasteProfile.topThemes,
    viewerStyles: result.tasteProfile.viewerStyles,
    premiumSignals: result.tasteProfile.premiumSignals ?? [],
    negativeSignals: result.tasteProfile.negativeSignals ?? [],
  };

  return {
    category: 'anime',
    tasteProfile: mappedTasteProfile as RecommendationResponse['tasteProfile'],
    fromBacklog: result.backlogPicks.map(makeItem),
    possibleNext: result.possibleNext.map(makeItem),
  };
}
