/**
 * @jest-environment node
 *
 * An unsupported category must cost nothing.
 *
 * Not "returns null" — *nothing*: no provider request, no Supabase call, no cache row, no
 * observation row, and no import of a category's provider module. The cheapest way to leak spend
 * into a new category is a dispatcher that loads an adapter first and checks support second, so
 * these tests assert on the absence of side effects rather than on the return value.
 *
 * The Supabase double throws on any property access. A single `.from(...)` anywhere in the path
 * fails the test with a stack pointing at the offender.
 */

jest.mock('server-only', () => ({}), { virtual: true });

const gamesTasteService = jest.fn();
const gamesRerankService = jest.fn();
const animeTasteService = jest.fn();
const mangaTasteService = jest.fn();

jest.mock('@/lib/ai/categories/games/taste/service', () => ({
  __esModule: true,
  generateGameAiTasteProfile: (...args: unknown[]) => gamesTasteService(...args),
}));

jest.mock('@/lib/ai/categories/games/rerank/service', () => ({
  __esModule: true,
  runGamesRerankShadow: (...args: unknown[]) => gamesRerankService(...args),
}));

jest.mock('@/lib/ai/categories/anime/taste/service', () => ({
  __esModule: true,
  generateAnimeAiTasteProfile: (...args: unknown[]) => animeTasteService(...args),
}));

jest.mock('@/lib/ai/categories/manga/taste/service', () => ({
  __esModule: true,
  generateMangaAiTasteProfile: (...args: unknown[]) => mangaTasteService(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { dispatchRerankShadow } from '../rerank-shadow';
import { generateAiTasteProfileForCategory } from '../taste-profile';

/** Categories with no taste adapter. Anime and manga both have one now. */
const TASTE_UNSUPPORTED_CATEGORIES = ['movies', 'tv', 'books'];

/**
 * Categories with no reranker — which is every category except games.
 *
 * Anime belongs here even though its taste profile is live. That difference is the whole reason
 * the registry carries two independent fields, and this list is where it is enforced.
 */
const RERANK_UNSUPPORTED_CATEGORIES = ['anime', 'manga', 'movies', 'tv', 'books'];

/** Every taste generator, so a test can assert that exactly one of them ran. */
const TASTE_SERVICES = {
  games: gamesTasteService,
  anime: animeTasteService,
  manga: mangaTasteService,
};

/** Any touch is a failure, so the trap is the assertion. */
function forbiddenSupabase(): SupabaseClient<Database> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(`unsupported category touched Supabase: .${String(property)}`);
      },
    },
  ) as unknown as SupabaseClient<Database>;
}

describe('taste dispatch for unsupported categories', () => {
  const originalFetch = global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.fn(() => {
      throw new Error('unsupported category reached the network');
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(TASTE_UNSUPPORTED_CATEGORIES)(
    'returns null for %s without any side effect',
    async category => {
      const result = await generateAiTasteProfileForCategory(
        forbiddenSupabase(),
        'user-1',
        category,
      );

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      for (const service of Object.values(TASTE_SERVICES)) {
        expect(service).not.toHaveBeenCalled();
      }
    },
  );

  it('still reaches the games generator for games', async () => {
    gamesTasteService.mockResolvedValue({ summary: 'ok' });
    const supabase = {} as SupabaseClient<Database>;

    await expect(generateAiTasteProfileForCategory(supabase, 'user-1', 'games')).resolves.toEqual({
      summary: 'ok',
    });
    expect(gamesTasteService).toHaveBeenCalledWith(supabase, 'user-1');
    expect(animeTasteService).not.toHaveBeenCalled();
  });

  it.each(['games', 'anime', 'manga'] as const)(
    'routes %s to its own generator, and only that one',
    async category => {
      const supabase = {} as SupabaseClient<Database>;
      TASTE_SERVICES[category].mockResolvedValue({ summary: `${category} ok` });

      await expect(
        generateAiTasteProfileForCategory(supabase, 'user-1', category),
      ).resolves.toEqual({ summary: `${category} ok` });

      expect(TASTE_SERVICES[category]).toHaveBeenCalledWith(supabase, 'user-1');
      for (const [other, service] of Object.entries(TASTE_SERVICES)) {
        if (other !== category) {
          expect(service).not.toHaveBeenCalled();
        }
      }
    },
  );
});

describe('shadow rerank dispatch for unsupported categories', () => {
  const originalFetch = global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.fn(() => {
      throw new Error('unsupported category reached the network');
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(RERANK_UNSUPPORTED_CATEGORIES)('does no work at all for %s', async category => {
    const context = {
      supabase: forbiddenSupabase(),
      userId: 'user-1',
      shortlist: [],
      continuationContext: { chosenFamilyKeys: [], remainingDiscoverySlots: 2 },
      servedDiscoveryIds: [],
    };

    await expect(
      dispatchRerankShadow(category as 'games', context as never),
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(gamesRerankService).not.toHaveBeenCalled();
  });

  it.each(['anime', 'manga'])(
    'refuses %s reranking even though its taste profile is supported',
    async category => {
      // The separation, asserted directly: taste support must never imply rerank support.
      await dispatchRerankShadow(category as 'games', {
        supabase: forbiddenSupabase(),
        userId: 'user-1',
        shortlist: [],
        continuationContext: { chosenFamilyKeys: [], remainingDiscoverySlots: 2 },
        servedDiscoveryIds: [],
      } as never);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(gamesRerankService).not.toHaveBeenCalled();
      for (const service of Object.values(TASTE_SERVICES)) {
        expect(service).not.toHaveBeenCalled();
      }
    },
  );

  it('refuses anime reranking even though anime taste is supported', async () => {
    await dispatchRerankShadow('anime' as 'games', {
      supabase: forbiddenSupabase(),
      userId: 'user-1',
      shortlist: [],
      continuationContext: { chosenFamilyKeys: [], remainingDiscoverySlots: 2 },
      servedDiscoveryIds: [],
    } as never);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(gamesRerankService).not.toHaveBeenCalled();
    expect(animeTasteService).not.toHaveBeenCalled();
  });

  it('still reaches the games reranker for games', async () => {
    gamesRerankService.mockResolvedValue(undefined);
    const context = {
      supabase: {} as SupabaseClient<Database>,
      userId: 'user-1',
      shortlist: [],
      continuationContext: { chosenFamilyKeys: [], remainingDiscoverySlots: 2 },
      servedDiscoveryIds: [],
    };

    await dispatchRerankShadow('games', context as never);

    expect(gamesRerankService).toHaveBeenCalledWith(context);
  });
});
