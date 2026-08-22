/**
 * @jest-environment node
 */

const mockCreateRouteHandlerClient = jest.fn();
const mockRequireAuth = jest.fn();
const mockInsertActivity = jest.fn().mockResolvedValue(undefined);
const mockGetUserBasicInfo = jest.fn().mockResolvedValue({
  username: 'tester',
  display_name: 'Tester',
  avatar_url: null,
});
const mockRefreshGenreAffinity = jest.fn();
const mockRevalidateUserMediaMutation = jest.fn();

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: (...args: unknown[]) => mockCreateRouteHandlerClient(...args),
}));

jest.mock('@/lib/api/auth', () => {
  class UnauthorizedError extends Error {}
  return {
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
    UnauthorizedError,
  };
});

jest.mock('@/lib/services/activityService', () => ({
  insertActivity: (...args: unknown[]) => mockInsertActivity(...args),
}));

jest.mock('@/lib/services/userService', () => ({
  getUserBasicInfo: (...args: unknown[]) => mockGetUserBasicInfo(...args),
}));

jest.mock('@/lib/profile/genre-affinity', () => ({
  refreshGenreAffinity: (...args: unknown[]) => mockRefreshGenreAffinity(...args),
}));

jest.mock('@/lib/api/media/utils/revalidation', () => ({
  revalidateUserMediaMutation: (...args: unknown[]) => mockRevalidateUserMediaMutation(...args),
}));

type EntryRow = {
  user_id: string;
  media_id: number;
  status: 'planned' | 'current' | 'completed' | 'dropped';
  is_favorite: boolean;
  selected_platform: string | null;
  priority: number | null;
  score: number | null;
  progress: number | null;
  notes: string | null;
  updated_at: string;
};

function createMockSupabase(initial: EntryRow) {
  const state = {
    entry: { ...initial },
  };

  const from = jest.fn((table: string) => {
    if (table === 'user_media_entries') {
      return {
        select: () => {
          const filters: { userId?: string; mediaId?: number } = {};
          return {
            eq: (key: string, value: string | number) => {
              if (key === 'user_id') {
                filters.userId = String(value);
              }
              if (key === 'media_id') {
                filters.mediaId = Number(value);
              }
              return {
                eq: (key2: string, value2: string | number) => {
                  if (key2 === 'user_id') {
                    filters.userId = String(value2);
                  }
                  if (key2 === 'media_id') {
                    filters.mediaId = Number(value2);
                  }
                  const result = {
                    maybeSingle: jest.fn(async () => {
                      const match =
                        state.entry.user_id === filters.userId &&
                        state.entry.media_id === filters.mediaId;
                      return {
                        data: match ? { ...state.entry } : null,
                        error: null,
                      };
                    }),
                    limit: jest.fn(() => result),
                  };
                  return result;
                },
                maybeSingle: jest.fn(async () => {
                  const match =
                    state.entry.user_id === filters.userId &&
                    state.entry.media_id === filters.mediaId;
                  return {
                    data: match ? { ...state.entry } : null,
                    error: null,
                  };
                }),
                limit: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => {
                    const match =
                      state.entry.user_id === filters.userId &&
                      state.entry.media_id === filters.mediaId;
                    return {
                      data: match ? { ...state.entry } : null,
                      error: null,
                    };
                  }),
                })),
              };
            },
          };
        },
        update: (payload: Record<string, unknown>) => {
          const filters: { userId?: string; mediaId?: number; clientUpdatedAt?: string } = {};
          return {
            eq: (key: string, value: string | number) => {
              if (key === 'user_id') {
                filters.userId = String(value);
              }
              if (key === 'media_id') {
                filters.mediaId = Number(value);
              }
              return {
                eq: (key2: string, value2: string | number) => {
                  if (key2 === 'user_id') {
                    filters.userId = String(value2);
                  }
                  if (key2 === 'media_id') {
                    filters.mediaId = Number(value2);
                  }
                  return {
                    lte: (key3: string, value3: string) => {
                      if (key3 === 'updated_at') {
                        filters.clientUpdatedAt = value3;
                      }
                      return {
                        select: () => ({
                          maybeSingle: jest.fn(async () => {
                            const match =
                              state.entry.user_id === filters.userId &&
                              state.entry.media_id === filters.mediaId;
                            if (!match || !filters.clientUpdatedAt) {
                              return { data: null, error: null };
                            }
                            const current = Date.parse(state.entry.updated_at);
                            const client = Date.parse(filters.clientUpdatedAt);
                            if (!Number.isFinite(current) || !Number.isFinite(client)) {
                              return { data: null, error: null };
                            }
                            if (current > client) {
                              return { data: null, error: null };
                            }
                            state.entry = {
                              ...state.entry,
                              ...payload,
                              updated_at: String(payload.updated_at ?? state.entry.updated_at),
                            } as EntryRow;
                            return { data: { ...state.entry }, error: null };
                          }),
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === 'media_items') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: jest.fn(async () => ({
              data: { title: 'Mock title', category: 'books' },
              error: null,
            })),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
  };
}

describe('handleLibraryPatch RC-011', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns one success and one conflict for same clientUpdatedAt, then succeeds after retry with fresh timestamp', async () => {
    const originalUpdatedAt = '2026-04-02T10:00:00.000Z';
    const mockSupabase = createMockSupabase({
      user_id: 'user-1',
      media_id: 7,
      status: 'planned',
      is_favorite: false,
      selected_platform: null,
      priority: null,
      score: null,
      progress: null,
      notes: null,
      updated_at: originalUpdatedAt,
    });
    mockCreateRouteHandlerClient.mockResolvedValue(mockSupabase);

    const { handleLibraryPatch } = await import('@/lib/api/media/handlers/library');
    const { MEDIA_CATEGORY_CONFIGS } = await import('@/lib/api/media/config');
    const config = MEDIA_CATEGORY_CONFIGS.books;

    const reqA = new Request('http://localhost/api/books/library', {
      method: 'PATCH',
      body: JSON.stringify({
        mediaId: 7,
        clientUpdatedAt: originalUpdatedAt,
        score: 8,
      }),
    });
    const reqB = new Request('http://localhost/api/books/library', {
      method: 'PATCH',
      body: JSON.stringify({
        mediaId: 7,
        clientUpdatedAt: originalUpdatedAt,
        status: 'completed',
      }),
    });

    const resA = await handleLibraryPatch(reqA, config);
    const bodyA = await resA.json();
    const resB = await handleLibraryPatch(reqB, config);
    const bodyB = await resB.json();

    expect([resA.status, resB.status].sort()).toEqual([200, 409]);
    const successBody = resA.status === 200 ? bodyA : bodyB;
    expect(successBody.entry).toBeDefined();

    const latestUpdatedAt = successBody.entry.updated_at as string;

    const reqRetry = new Request('http://localhost/api/books/library', {
      method: 'PATCH',
      body: JSON.stringify({
        mediaId: 7,
        clientUpdatedAt: latestUpdatedAt,
        notes: 'retry-ok',
      }),
    });

    const retryRes = await handleLibraryPatch(reqRetry, config);
    const retryBody = await retryRes.json();

    expect(retryRes.status).toBe(200);
    expect(retryBody.entry.notes).toBe('retry-ok');
  });
});
