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
const animeRerankService = jest.fn();
const mangaRerankService = jest.fn();
const animeTasteService = jest.fn();
const mangaTasteService = jest.fn();
const moviesTasteService = jest.fn();
const tvTasteService = jest.fn();
const booksTasteService = jest.fn();

jest.mock('@/lib/ai/categories/games/taste/service', () => ({
  __esModule: true,
  generateGameAiTasteProfile: (...args: unknown[]) => gamesTasteService(...args),
}));

jest.mock('@/lib/ai/categories/games/rerank/service', () => ({
  __esModule: true,
  runGamesRerankShadow: (...args: unknown[]) => gamesRerankService(...args),
}));

jest.mock('@/lib/ai/categories/anime/rerank/service', () => ({
  __esModule: true,
  runAnimeRerankShadow: (...args: unknown[]) => animeRerankService(...args),
}));

jest.mock('@/lib/ai/categories/manga/rerank/service', () => ({
  __esModule: true,
  runMangaRerankShadow: (...args: unknown[]) => mangaRerankService(...args),
}));

jest.mock('@/lib/ai/categories/anime/taste/service', () => ({
  __esModule: true,
  generateAnimeAiTasteProfile: (...args: unknown[]) => animeTasteService(...args),
}));

jest.mock('@/lib/ai/categories/manga/taste/service', () => ({
  __esModule: true,
  generateMangaAiTasteProfile: (...args: unknown[]) => mangaTasteService(...args),
}));

jest.mock('@/lib/ai/categories/movies/taste/service', () => ({
  __esModule: true,
  generateMoviesAiTasteProfile: (...args: unknown[]) => moviesTasteService(...args),
}));

jest.mock('@/lib/ai/categories/tv/taste/service', () => ({
  __esModule: true,
  generateTvAiTasteProfile: (...args: unknown[]) => tvTasteService(...args),
}));

jest.mock('@/lib/ai/categories/books/taste/service', () => ({
  __esModule: true,
  generateBooksAiTasteProfile: (...args: unknown[]) => booksTasteService(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { dispatchRerankShadow } from '../rerank-shadow';
import { generateAiTasteProfileForCategory } from '../taste-profile';

/**
 * Categories with no taste adapter.
 *
 * Every media category has one now, so what is left are the hobby verticals with no library to
 * reason about. They are still worth testing: the gate that refuses them is the registry, not a
 * flag, and a stray registry entry would be caught here before it reached a provider.
 */
const TASTE_UNSUPPORTED_CATEGORIES = ['coding', 'pet', 'vape'];

/**
 * Categories with a taste profile but no reranker.
 *
 * This list is the whole reason the registry carries two fields. All three profile taste; none may
 * be reranked, because none has a reranker, a corpus or any evidence a model improves its ordering.
 */
const RERANK_UNSUPPORTED_CATEGORIES = ['movies', 'tv', 'books'];

/** Every reranker, so a test can assert that exactly one of them ran. */
const RERANK_SERVICES = {
  games: gamesRerankService,
  anime: animeRerankService,
  manga: mangaRerankService,
};

/** Every taste generator, so a test can assert that exactly one of them ran. */
const TASTE_SERVICES = {
  games: gamesTasteService,
  anime: animeTasteService,
  manga: mangaTasteService,
  movies: moviesTasteService,
  tv: tvTasteService,
  books: booksTasteService,
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

  it.each(['games', 'anime', 'manga', 'movies', 'tv', 'books'] as const)(
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
    for (const service of Object.values(RERANK_SERVICES)) {
      expect(service).not.toHaveBeenCalled();
    }
  });

  it.each(['games', 'anime', 'manga'] as const)(
    'routes %s to its own reranker, and only that one',
    async category => {
      RERANK_SERVICES[category].mockResolvedValue(undefined);
      const context = {
        supabase: {} as SupabaseClient<Database>,
        userId: 'user-1',
        shortlist: [],
        continuationContext: { chosenFamilyKeys: [], remainingDiscoverySlots: 2 },
        servedDiscoveryIds: [],
      };

      await dispatchRerankShadow(category, context as never);

      expect(RERANK_SERVICES[category]).toHaveBeenCalledWith(context);
      for (const [other, service] of Object.entries(RERANK_SERVICES)) {
        if (other !== category) {
          expect(service).not.toHaveBeenCalled();
        }
      }
      // Reranking must never trigger a taste generation.
      for (const service of Object.values(TASTE_SERVICES)) {
        expect(service).not.toHaveBeenCalled();
      }
    },
  );
});
