/**
 * @jest-environment node
 */

const mockFindExistingMedia = jest.fn();
const mockBackfillMediaGaps = jest.fn();
const mockInsert = jest.fn();

jest.mock('@/lib/api-cache/external', () => ({ cachedExternalFetch: jest.fn() }));

jest.mock('@/lib/api/auth', () => {
  class UnauthorizedError extends Error {}
  return {
    requireAuth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    UnauthorizedError,
  };
});

/** Chainable query builder whose terminal calls resolve to `result`. */
function builder(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'upsert', 'order', 'limit']) {
    chain[method] = () => chain;
  }
  chain.single = async () => result;
  chain.maybeSingle = async () => result;
  return chain;
}

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: jest.fn().mockResolvedValue({
    from: (table: string) =>
      builder(table === 'users' ? { data: null } : { data: { id: 99 }, error: null }),
  }),
}));

jest.mock('@/lib/supabase-server', () => ({
  __esModule: true,
  default: () => ({
    from: () => ({
      insert: (payload: unknown) => {
        mockInsert(payload);
        return builder({ data: { id: 501 }, error: null });
      },
    }),
  }),
}));

jest.mock('../../utils/media-lookup', () => ({
  ...jest.requireActual('../../utils/media-lookup'),
  findExistingMedia: (...args: unknown[]) => mockFindExistingMedia(...args),
  backfillMediaGaps: (...args: unknown[]) => mockBackfillMediaGaps(...args),
}));

jest.mock('@/lib/services/activityService', () => ({ insertActivity: jest.fn() }));
jest.mock('@/lib/services/userService', () => ({ getUserBasicInfo: jest.fn() }));
jest.mock('@/lib/profile/genre-affinity', () => ({ refreshGenreAffinity: jest.fn() }));
jest.mock('@/lib/profile/recompute-category-profiles', () => ({
  recomputeCategoryProfiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/cache/tags', () => ({ revalidateCache: { publicStats: jest.fn() } }));
jest.mock('../../utils/revalidation', () => ({ revalidateUserMediaMutation: jest.fn() }));

import { handleMediaAdd } from '../add';
import { MEDIA_CATEGORY_CONFIGS, type MediaCategoryConfig } from '../../config';
import { stripBlockedCoverFields } from '@/lib/books/coverBlocklist';
import type { MediaPayload } from '../../types';

const BLOCKED = 'https://assets.hardcover.app/edition/1/taken-down.jpeg';
const sanitize = (payload: MediaPayload) => stripBlockedCoverFields(payload, new Set([BLOCKED]));

const config: MediaCategoryConfig = {
  ...MEDIA_CATEGORY_CONFIGS.books,
  sanitizePayload: sanitize,
  enricher: undefined,
};

const request = (payload: Record<string, unknown>) =>
  new Request('http://localhost/api/books/add', {
    method: 'POST',
    body: JSON.stringify({ source: 'external', payload }),
  });

const payload = {
  category: 'books',
  hardcover_id: 1,
  title: 'Homeland',
  cover_image_large: BLOCKED,
  cover_image_medium: BLOCKED,
};

describe('handleMediaAdd payload sanitizing', () => {
  beforeEach(() => {
    mockFindExistingMedia.mockReset();
    mockBackfillMediaGaps.mockReset();
    mockInsert.mockReset();
  });

  it('never backfills a blocked cover into an existing row', async () => {
    mockFindExistingMedia.mockResolvedValue(42);

    const response = await handleMediaAdd(request(payload), config);

    expect(response.status).toBe(200);
    const backfilled = mockBackfillMediaGaps.mock.calls[0][2];
    expect(backfilled.cover_image_large).toBeNull();
    expect(backfilled.cover_image_medium).toBeNull();
  });

  it('never inserts a blocked cover, even one an enricher brings back', async () => {
    mockFindExistingMedia.mockResolvedValue(null);
    const enriching: MediaCategoryConfig = {
      ...config,
      enricher: async () => ({ cover_image_large: BLOCKED }),
    };

    const response = await handleMediaAdd(
      request({ ...payload, cover_image_large: null }),
      enriching,
    );

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][0]).toMatchObject({
      cover_image_large: null,
      cover_image_medium: null,
    });
  });

  it('is wired for books', () => {
    expect(typeof MEDIA_CATEGORY_CONFIGS.books.sanitizePayload).toBe('function');
  });
});
