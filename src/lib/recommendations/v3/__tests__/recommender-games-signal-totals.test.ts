/**
 * Regression guard for the Phase 0 percentage-denominator fix.
 *
 * `buildGamesTasteProfile` computes `signalTotals` over the FULL unsliced signal lists, and
 * `CategoryTasteProfileCard.toIdentityTraits` divides by those totals so the bars stop being
 * forced to sum to 100%. The V3 mapping in `recommender.ts` sits between the two and used to
 * drop `signalTotals`, silently reverting the dashboard to the old sliced-denominator maths.
 */

import type { GamesRecommendationResult, GamesTasteProfile } from '../games/games-types';

const generateGamesRecommendationsV3 = jest.fn<Promise<GamesRecommendationResult>, [string]>();

jest.mock('../games/games-recommender', () => ({
  generateGamesRecommendationsV3: (userId: string) => generateGamesRecommendationsV3(userId),
}));

import { generateRecommendationsV3 } from '../recommender';

/** Mirrors `toIdentityTraits` in CategoryTasteProfileCard. */
function renderPercentages(
  visible: Array<{ name: string; weight: number }>,
  denominator?: number,
): number[] {
  const visibleTotal = visible.reduce((sum, item) => sum + item.weight, 0);
  const total = denominator && denominator > visibleTotal ? denominator : visibleTotal;
  if (total <= 0) {
    return [];
  }
  return visible.map(item => Math.round((item.weight / total) * 100));
}

/**
 * Weights taken from running the real V3 taste engine over a 129-entry games library, so the
 * expected percentages below are the ones an actual dashboard renders.
 */
const tasteProfile: GamesTasteProfile = {
  summary: 'Your taste centers around adventure + role-playing-rpg.',
  coreGenres: [
    { name: 'adventure', weight: 85.2 },
    { name: 'role-playing-rpg', weight: 62.5 },
    { name: 'hack-and-slash', weight: 20.4 },
  ],
  secondaryGenres: [
    { name: 'platform', weight: 5.7 },
    { name: 'visual-novel', weight: 2 },
  ],
  themes: [
    { name: 'narrative-driven worlds', weight: 103.39 },
    { name: 'cinematic single-player campaigns', weight: 58.74 },
    { name: 'dark fantasy action', weight: 49.74 },
  ],
  playerStyles: [
    { name: 'single-player narrative immersion', weight: 168.1 },
    { name: 'cinematic campaign preference', weight: 68.53 },
  ],
  negativeSignals: [
    { name: 'cozy simulator aversion', weight: 26 },
    { name: 'low-engagement simulator loop aversion', weight: 15 },
    { name: 'puzzle-first indie aversion', weight: 12 },
    { name: 'multiplayer live-service aversion', weight: 3 },
  ],
  // Full mass, including the signals sliced off before display.
  signalTotals: {
    coreGenres: 186.8,
    themes: 211.87,
    playerStyles: 359.65,
    negativeSignals: 56,
  },
};

function mockResult(profile: GamesTasteProfile): GamesRecommendationResult {
  return {
    tasteProfile: profile,
    backlogPicks: [],
    possibleNext: [],
  };
}

type MappedTasteProfile = {
  signalTotals?: GamesTasteProfile['signalTotals'];
  coreGenres: Array<{ name: string; weight: number }>;
  themes: Array<{ name: string; weight: number }>;
  playerStyles: Array<{ name: string; weight: number }>;
  negativeSignals: Array<{ name: string; weight: number }>;
};

async function mapGames(profile: GamesTasteProfile): Promise<MappedTasteProfile> {
  generateGamesRecommendationsV3.mockResolvedValue(mockResult(profile));
  const response = await generateRecommendationsV3('user-1', 'games');
  return response.tasteProfile as unknown as MappedTasteProfile;
}

describe('generateRecommendationsV3 games taste profile mapping', () => {
  it('forwards signalTotals through to the dashboard payload', async () => {
    const mapped = await mapGames(tasteProfile);

    expect(mapped.signalTotals).toEqual({
      coreGenres: 186.8,
      themes: 211.87,
      playerStyles: 359.65,
      negativeSignals: 56,
    });
  });

  it('keeps the raw identity signal lists alongside the totals', async () => {
    const mapped = await mapGames(tasteProfile);

    expect(mapped.coreGenres).toEqual(tasteProfile.coreGenres);
    expect(mapped.themes).toEqual(tasteProfile.themes);
    expect(mapped.playerStyles).toEqual(tasteProfile.playerStyles);
    expect(mapped.negativeSignals).toEqual(tasteProfile.negativeSignals);
  });

  it('renders percentages against full signal mass instead of the visible slice', async () => {
    const mapped = await mapGames(tasteProfile);

    // Core genres: 51/37/12 under the old sliced denominator, 46/33/11 against full mass.
    expect(renderPercentages(mapped.coreGenres, mapped.signalTotals?.coreGenres)).toEqual([
      46, 33, 11,
    ]);
    // Player styles: 71/29 under the old sliced denominator, 47/19 against full mass.
    expect(renderPercentages(mapped.playerStyles, mapped.signalTotals?.playerStyles)).toEqual([
      47, 19,
    ]);
    // Buckets whose full list fits inside the visible slice are unchanged by the fix.
    expect(renderPercentages(mapped.negativeSignals, mapped.signalTotals?.negativeSignals)).toEqual(
      [46, 27, 21, 5],
    );
  });

  it('falls back to the visible slice when the engine supplies no totals', async () => {
    const mapped = await mapGames({ ...tasteProfile, signalTotals: undefined });

    expect(mapped.signalTotals).toBeUndefined();
    expect(renderPercentages(mapped.coreGenres, mapped.signalTotals?.coreGenres)).toEqual([
      51, 37, 12,
    ]);
  });
});
