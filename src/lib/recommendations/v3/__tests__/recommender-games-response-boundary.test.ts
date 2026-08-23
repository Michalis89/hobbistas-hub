/**
 * The shadow context added in the Phase 2 foundation is internal to the games engine. This guards
 * the boundary: whatever `generateGamesRecommendationsV3` carries, the public
 * `RecommendationResponse` — the shape both the dashboard and `/api/backlog/personal-suggestions`
 * serialise — must stay exactly what it was.
 */

import type { GamesRecommendationResult } from '../games/games-types';

const generateGamesRecommendationsV3 = jest.fn<Promise<GamesRecommendationResult>, [string]>();

jest.mock('../games/games-recommender', () => ({
  generateGamesRecommendationsV3: (userId: string) => generateGamesRecommendationsV3(userId),
}));

import { generateRecommendationsV3 } from '../recommender';

function buildResult(): GamesRecommendationResult {
  return {
    tasteProfile: {
      summary: 'Authored drama, methodical combat.',
      coreGenres: [{ name: 'adventure', weight: 80 }],
      secondaryGenres: [],
      themes: [{ name: 'narrative-driven worlds', weight: 60 }],
      playerStyles: [],
      negativeSignals: [],
      signalTotals: { coreGenres: 80, themes: 60, playerStyles: 0, negativeSignals: 0 },
    },
    backlogPicks: [
      {
        mediaId: 11,
        title: 'Sekiro: Shadows Die Twice',
        slug: 'sekiro',
        cover: 'cover-11',
        source: 'backlog',
        subtype: 'best_fit',
        reason: 'Matches your combat pillar.',
        confidence: 0.9,
        score: 90,
        genres: ['Adventure'],
        matchedSignals: ['core genre alignment'],
      },
    ],
    possibleNext: [
      {
        mediaId: 21,
        title: 'Mass Effect Legendary Edition',
        slug: 'mass-effect-legendary-edition',
        cover: 'cover-21',
        source: 'database',
        subtype: 'discovery',
        reason: 'Authored sci-fi drama.',
        confidence: 1,
        score: 100,
        genres: ['Role-playing (RPG)'],
        matchedSignals: ['core genre alignment'],
      },
    ],
    shadowContext: {
      discoveryShortlist: [
        {
          candidate: {
            id: 21,
            title: 'Mass Effect Legendary Edition',
            slug: 'mass-effect-legendary-edition',
            genres: ['Role-playing (RPG)'],
            themes: [],
            platforms: [],
            cover: '',
            popularityScore: 80,
          },
          score: 100,
          confidence: 1,
          matchedSignals: [],
          debug: { coreMatch: 3 },
          familyKey: 'mass-effect',
          deterministicRank: 1,
        },
      ],
      continuationContext: {
        chosenFamilyKeys: ['god-of-war'],
        continuationSlotsUsed: 1,
        remainingDiscoverySlots: 3,
        possibleNextLimit: 4,
      },
    },
    debug: { completedCount: 8, inProgressCount: 1, droppedCount: 3, backlogCount: 5 },
  };
}

describe('generateRecommendationsV3 (games) response boundary', () => {
  beforeEach(() => {
    generateGamesRecommendationsV3.mockResolvedValue(buildResult());
  });

  it('exposes exactly the documented top-level keys', async () => {
    const response = await generateRecommendationsV3('user-1', 'games');

    expect(Object.keys(response).sort()).toEqual([
      'category',
      'fromBacklog',
      'possibleNext',
      'tasteProfile',
    ]);
  });

  it('does not leak the shadow context anywhere in the serialised response', async () => {
    const response = await generateRecommendationsV3('user-1', 'games');
    const serialised = JSON.stringify(response);

    expect(serialised).not.toContain('shadowContext');
    expect(serialised).not.toContain('discoveryShortlist');
    expect(serialised).not.toContain('continuationContext');
    expect(serialised).not.toContain('deterministicRank');
    expect(serialised).not.toContain('familyKey');
  });

  it('keeps the recommendation item shape unchanged', async () => {
    const response = await generateRecommendationsV3('user-1', 'games');

    expect(response.possibleNext[0]).toEqual({
      id: 'rec-games-21',
      mediaDbId: 21,
      title: 'Mass Effect Legendary Edition',
      cover: 'cover-21',
      slug: 'mass-effect-legendary-edition',
      category: 'games',
      source: 'discovery',
      confidence: 1,
      reason: 'Authored sci-fi drama.',
      matchedSignals: ['core genre alignment'],
    });
  });

  it('still maps backlog picks and the taste profile as before', async () => {
    const response = await generateRecommendationsV3('user-1', 'games');

    expect(response.category).toBe('games');
    expect(response.fromBacklog).toHaveLength(1);
    expect(response.fromBacklog[0].source).toBe('backlog');
    expect(response.tasteProfile.summary).toBe('Authored drama, methodical combat.');
  });
});
