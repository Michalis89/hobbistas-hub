/**
 * @jest-environment node
 */

const mockCreateRouteHandlerClient = jest.fn();
const mockRequireAuthorRole = jest.fn();
const mockSanitizeHtmlContent = jest.fn((value: string) => value);
const mockValidatePlainText = jest.fn(() => ({ isValid: true }));
const mockValidatePlainTextArray = jest.fn(() => ({ isValid: true }));
const mockValidateTipTapContent = jest.fn(() => ({ isValid: true }));
const mockSlugProbe = jest.fn();
const mockInsertActivity = jest.fn();
const mockRevalidateArticle = jest.fn();
const mockArticleInsert = jest.fn();

const mockSupabase = {
  from: jest.fn((table: string) => {
    if (table !== 'articles') {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      insert: (...args: unknown[]) => mockArticleInsert(...args),
      // Server-side slug resolution probes for collisions before inserting.
      select: () => ({ like: (...args: unknown[]) => mockSlugProbe(...args) }),
    };
  }),
};

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: (...args: unknown[]) => mockCreateRouteHandlerClient(...args),
}));

jest.mock('@/lib/api/permissions', () => ({
  requireAuthorRole: (...args: unknown[]) => mockRequireAuthorRole(...args),
  ForbiddenError: class ForbiddenError extends Error {},
}));

jest.mock('@/utils/security/sanitizeHtml', () => ({
  sanitizeHtmlContent: (...args: unknown[]) => mockSanitizeHtmlContent(...args),
}));

jest.mock('@/utils/validation/text', () => ({
  validatePlainText: (...args: unknown[]) => mockValidatePlainText(...args),
  validatePlainTextArray: (...args: unknown[]) => mockValidatePlainTextArray(...args),
}));

jest.mock('@/utils/validation/tiptap', () => ({
  validateTipTapContent: (...args: unknown[]) => mockValidateTipTapContent(...args),
}));

jest.mock('@/lib/services/activityService', () => ({
  insertActivity: (...args: unknown[]) => mockInsertActivity(...args),
}));

jest.mock('@/lib/cache/tags', () => ({
  CACHE_CONFIG: { PUBLIC_DATA: { revalidate: 60 } },
  CACHE_TAGS: { ARTICLES: 'articles' },
  revalidateCache: {
    article: (...args: unknown[]) => mockRevalidateArticle(...args),
  },
}));

jest.mock('@/lib/supabase/queries', () => ({
  getArticlesWithFilters: jest.fn(),
}));

jest.mock('@/lib/observability/withApiRoute', () => ({
  withApiRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));

function makeInsertChain(result: unknown) {
  return {
    select: jest.fn(() => ({
      single: jest.fn().mockResolvedValue(result),
    })),
  };
}

function makeRequest() {
  return new Request('http://localhost/api/articles', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Same Title',
      slug: 'same-title',
      description: 'Description',
      category: 'games',
      content_rich: { type: 'doc', content: [] },
      content_html: '<p>hello</p>',
    }),
  });
}

describe('POST /api/articles RC-012', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRouteHandlerClient.mockResolvedValue(mockSupabase);
    mockRequireAuthorRole.mockResolvedValue({
      session: { user: { id: 'author-1' } },
      user: { username: 'author', display_name: 'Author', avatar_url: null },
    });
    mockInsertActivity.mockResolvedValue(undefined);
    // No pre-existing slugs: every concurrent request derives the same slug and
    // the database unique constraint stays the real arbiter of the race.
    mockSlugProbe.mockResolvedValue({ data: [], error: null });
  });

  it('returns 409 CONFLICT when slug unique constraint (23505) fires', async () => {
    mockArticleInsert.mockReturnValueOnce(
      makeInsertChain({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      }),
    );

    const { POST } = await import('@/app/api/articles/route');
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: 'An article with this slug already exists.',
      code: 'CONFLICT',
    });
  });

  it('for concurrent identical creates returns one 201 and the rest 409', async () => {
    const successArticle = {
      id: 101,
      title: 'Same Title',
      slug: 'same-title',
      category: 'games',
      topic: 'articles',
      status: 'draft',
    };

    mockArticleInsert
      .mockReturnValueOnce(makeInsertChain({ data: successArticle, error: null }))
      .mockReturnValueOnce(
        makeInsertChain({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      )
      .mockReturnValueOnce(
        makeInsertChain({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      )
      .mockReturnValueOnce(
        makeInsertChain({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      )
      .mockReturnValueOnce(
        makeInsertChain({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      );

    const { POST } = await import('@/app/api/articles/route');

    const responses = await Promise.all([
      POST(makeRequest()),
      POST(makeRequest()),
      POST(makeRequest()),
      POST(makeRequest()),
      POST(makeRequest()),
    ]);

    const statusCounts = responses.reduce<Record<number, number>>((acc, res) => {
      acc[res.status] = (acc[res.status] ?? 0) + 1;
      return acc;
    }, {});

    expect(statusCounts[201]).toBe(1);
    expect(statusCounts[409]).toBe(4);
  });
});
