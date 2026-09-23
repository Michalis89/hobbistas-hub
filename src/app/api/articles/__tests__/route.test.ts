import 'whatwg-fetch';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const unstableCacheMock = jest.fn();
const createRouteHandlerClientMock = jest.fn();
const sanitizeHtmlContentMock = jest.fn();
const validatePlainTextMock = jest.fn();
const validatePlainTextArrayMock = jest.fn();
const validateTipTapContentMock = jest.fn();
const insertActivityMock = jest.fn();
const getArticlesWithFiltersMock = jest.fn();
const requireAuthorRoleMock = jest.fn();
const revalidateArticleMock = jest.fn();

jest.mock('next/cache', () => ({
  unstable_cache: (...args: unknown[]) => unstableCacheMock(...args),
}));

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));

jest.mock('@/utils/security/sanitizeHtml', () => ({
  sanitizeHtmlContent: (...args: unknown[]) => sanitizeHtmlContentMock(...args),
}));

jest.mock('@/utils/validation/text', () => ({
  validatePlainText: (...args: unknown[]) => validatePlainTextMock(...args),
  validatePlainTextArray: (...args: unknown[]) => validatePlainTextArrayMock(...args),
}));

jest.mock('@/utils/validation/tiptap', () => ({
  validateTipTapContent: (...args: unknown[]) => validateTipTapContentMock(...args),
}));

jest.mock('@/lib/services/activityService', () => ({
  insertActivity: (...args: unknown[]) => insertActivityMock(...args),
}));

jest.mock('@/lib/supabase/queries', () => ({
  getArticlesWithFilters: (...args: unknown[]) => getArticlesWithFiltersMock(...args),
}));

jest.mock('@/lib/api/auth', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    code = 'UNAUTHORIZED';
  },
}));

jest.mock('@/lib/api/permissions', () => ({
  ForbiddenError: class ForbiddenError extends Error {
    code = 'FORBIDDEN';
  },
  requireAuthorRole: (...args: unknown[]) => requireAuthorRoleMock(...args),
}));

jest.mock('@/lib/cache/tags', () => ({
  CACHE_CONFIG: { PUBLIC_DATA: { revalidate: 60 } },
  CACHE_TAGS: { ARTICLES: 'articles' },
  revalidateCache: {
    article: (...args: unknown[]) => revalidateArticleMock(...args),
  },
}));

import { API_ERRORS } from '@/lib/api/errors';
import { UnauthorizedError } from '@/lib/api/auth';
import { ForbiddenError } from '@/lib/api/permissions';
import { GET, POST } from '@/app/api/articles/route';

function makeGetSupabase(sessionUserId: string | null = 'u1') {
  return {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
      }),
    },
  };
}

function makePostSupabase(config?: {
  insertData?: unknown;
  insertError?: unknown;
  existingSlugs?: string[];
}) {
  const insertSingle = jest.fn().mockResolvedValue({
    data: config?.insertData ?? null,
    error: config?.insertError ?? null,
  });
  const insertSelect = jest.fn().mockReturnValue({ single: insertSingle });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });

  // POST re-derives the slug server-side and probes for collisions via
  // .select('slug').like('slug', 'base%').
  const like = jest.fn().mockResolvedValue({
    data: (config?.existingSlugs ?? []).map(slug => ({ slug })),
    error: null,
  });
  const slugSelect = jest.fn().mockReturnValue({ like });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'articles') {
      return { insert, select: slugSelect };
    }
    return {};
  });

  return {
    client: { from },
    spies: { insert, like },
  };
}

describe('app/api/articles/route GET', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    unstableCacheMock.mockImplementation((fn: () => Promise<unknown>) => async () => fn());
    createRouteHandlerClientMock.mockResolvedValue(makeGetSupabase());
    getArticlesWithFiltersMock.mockResolvedValue({ data: [], error: null, count: 0 });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns unauthorized when author_id=me and no session', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeGetSupabase(null));

    const response = await GET(new Request('https://example.com/api/articles?author_id=me'));
    expect(response.status).toBe(API_ERRORS.UNAUTHORIZED.status);
  });

  it('resolves author_id=me to session user id when authenticated', async () => {
    createRouteHandlerClientMock
      .mockResolvedValueOnce(makeGetSupabase('me-user'))
      .mockResolvedValue(makeGetSupabase('me-user'));
    getArticlesWithFiltersMock.mockResolvedValueOnce({ data: [{ id: 9 }], error: null, count: 1 });

    const response = await GET(
      new Request('https://example.com/api/articles?author_id=me&status=draft'),
    );
    expect(response.status).toBe(200);
    expect(getArticlesWithFiltersMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ authorId: 'me-user' }),
    );
  });

  it('uses cached public query path and returns metadata', async () => {
    getArticlesWithFiltersMock.mockResolvedValue({
      data: [{ id: 1 }],
      error: null,
      count: 3,
    });

    const response = await GET(
      new Request('https://example.com/api/articles?featured=true&limit=999&offset=-2'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([{ id: 1 }]);
    expect(body.meta).toEqual({ total: 3, limit: 100, offset: 0 });
    expect(unstableCacheMock).toHaveBeenCalled();
    expect(createRouteHandlerClientMock).toHaveBeenCalledWith(undefined, { ignoreCookies: true });
  });

  it('returns internal when cached query throws', async () => {
    getArticlesWithFiltersMock.mockResolvedValue({
      data: null,
      error: { message: 'db error' },
      count: null,
    });

    const response = await GET(new Request('https://example.com/api/articles'));
    expect(response.status).toBe(API_ERRORS.INTERNAL.status);
  });

  it('uses cached fallback total when count is null', async () => {
    getArticlesWithFiltersMock.mockResolvedValue({
      data: [{ id: 11 }, { id: 12 }],
      error: null,
      count: null,
    });

    const response = await GET(new Request('https://example.com/api/articles?featured=false'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.total).toBe(2);
  });

  it('uses cached zero-total fallback when both count and article length are unavailable', async () => {
    getArticlesWithFiltersMock.mockResolvedValue({
      data: undefined,
      error: null,
      count: null,
    });

    const response = await GET(new Request('https://example.com/api/articles'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('retries non-cached query on PGRST303 and succeeds', async () => {
    getArticlesWithFiltersMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST303', message: 'policy miss' },
        count: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 5 }],
        error: null,
        count: 1,
      });

    const response = await GET(new Request('https://example.com/api/articles?media_id=10'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([{ id: 5 }]);
    expect(getArticlesWithFiltersMock).toHaveBeenCalledTimes(2);
  });

  it('returns internal when non-cached query fails', async () => {
    getArticlesWithFiltersMock.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'boom' },
      count: null,
    });

    const response = await GET(new Request('https://example.com/api/articles?status=draft'));
    expect(response.status).toBe(API_ERRORS.INTERNAL.status);
  });

  it('uses non-cached fallback total when count is null', async () => {
    getArticlesWithFiltersMock.mockResolvedValue({
      data: [{ id: 90 }, { id: 91 }, { id: 92 }],
      error: null,
      count: null,
    });

    const response = await GET(new Request('https://example.com/api/articles?status=draft'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.total).toBe(3);
  });

  it('uses non-cached zero-total fallback when count and article length are unavailable', async () => {
    getArticlesWithFiltersMock.mockResolvedValue({
      data: undefined,
      error: null,
      count: null,
    });

    const response = await GET(new Request('https://example.com/api/articles?status=draft'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });
});

describe('app/api/articles/route POST', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    createRouteHandlerClientMock.mockResolvedValue({});
    requireAuthorRoleMock.mockResolvedValue({
      session: { user: { id: 'author-1' } },
      user: { username: 'author', display_name: 'Author', avatar_url: '/a.png' },
    });
    validatePlainTextMock.mockReturnValue({ isValid: true });
    validatePlainTextArrayMock.mockReturnValue({ isValid: true });
    validateTipTapContentMock.mockReturnValue({ isValid: true });
    sanitizeHtmlContentMock.mockImplementation((v: string) => v);
    insertActivityMock.mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns 400 when plain text validation fails', async () => {
    validatePlainTextMock.mockReturnValueOnce({ isValid: false, error: 'bad title' });
    const response = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'bad title' });
  });

  it('returns fallback plain-text validation message when error is missing', async () => {
    validatePlainTextMock.mockReturnValueOnce({ isValid: false });
    const response = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid title' });
  });

  it('returns 400 when tags validation fails and when tiptap validation fails', async () => {
    validatePlainTextArrayMock.mockReturnValueOnce({ isValid: false, error: 'bad tags' });
    const r1 = await POST(
      new Request('https://example.com/api/articles', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(r1.status).toBe(400);

    validatePlainTextArrayMock.mockReturnValueOnce({ isValid: true });
    validateTipTapContentMock.mockReturnValueOnce({ isValid: false, error: 'bad tiptap' });
    const r2 = await POST(
      new Request('https://example.com/api/articles', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(r2.status).toBe(400);
  });

  it('returns fallback validation messages for tags and tiptap content', async () => {
    validatePlainTextArrayMock.mockReturnValueOnce({ isValid: false });
    const r1 = await POST(
      new Request('https://example.com/api/articles', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(r1.status).toBe(400);
    await expect(r1.json()).resolves.toEqual({ error: 'Invalid tags' });

    validatePlainTextArrayMock.mockReturnValueOnce({ isValid: true });
    validateTipTapContentMock.mockReturnValueOnce({ isValid: false });
    const r2 = await POST(
      new Request('https://example.com/api/articles', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(r2.status).toBe(400);
    await expect(r2.json()).resolves.toEqual({ error: 'Invalid content format' });
  });

  it('returns 400 when required fields are missing', async () => {
    const response = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify({
          title: 'x',
          slug: '',
          category: '',
          content_rich: { type: 'doc', content: [] },
          content_html: '',
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 409 on slug conflict and 500 on insert error', async () => {
    const s1 = makePostSupabase({
      insertData: null,
      insertError: { code: '23505', message: 'dup' },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s1.client);
    const payload = {
      title: 'Title',
      slug: 'slug',
      category: 'tech',
      content_rich: { type: 'doc', content: [] },
      content_html: '<p>x</p>',
    };
    const r1 = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    expect(r1.status).toBe(409);

    const s2 = makePostSupabase({
      insertData: null,
      insertError: { code: 'XX000', message: 'fail' },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s2.client);
    const r2 = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    expect(r2.status).toBe(API_ERRORS.INTERNAL.status);
  });

  it('creates published article, logs activity, and revalidates cache', async () => {
    const s = makePostSupabase({
      insertData: {
        id: 77,
        title: 'New',
        slug: 'new',
        category: 'news',
        topic: 'articles',
        status: 'published',
      },
      insertError: null,
    });
    createRouteHandlerClientMock.mockResolvedValue(s.client);

    const response = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New',
          slug: 'new',
          description: 'desc',
          category: 'news',
          topic: 'articles',
          tags: ['a'],
          cover_image: '/cover.png',
          content_rich: { type: 'doc', content: [] },
          content_html: '   <p>safe</p>   ',
          meta_title: 'mt',
          meta_description: 'md',
          status: 'published',
          is_featured: true,
          published_at: null,
          score: '7.5',
          media_id: '11',
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.message).toBe('Article created successfully');
    expect(s.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'new',
        author_id: 'author-1',
        content_html: '<p>safe</p>',
        score: 7.5,
        media_id: 11,
      }),
    );
    expect(insertActivityMock).toHaveBeenCalled();
    expect(revalidateArticleMock).toHaveBeenCalledWith(77);
  });

  it('derives the slug from a Greek title instead of rejecting it', async () => {
    const s = makePostSupabase({
      insertData: { id: 90, title: 'Ο νέος Kratos', slug: 'o-neos-kratos' },
      insertError: null,
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s.client);

    const response = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify({ title: 'Ο νέος Kratos', category: 'games', content_html: '<p>x</p>' }),
      }),
    );

    expect(response.status).toBe(201);
    expect(s.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'o-neos-kratos' }),
    );
  });

  it('appends a numeric suffix when the derived slug is already taken', async () => {
    const s = makePostSupabase({
      insertData: { id: 91, title: 'Kratos', slug: 'kratos-3' },
      insertError: null,
      existingSlugs: ['kratos', 'kratos-2'],
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s.client);

    const response = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify({ title: 'Kratos', category: 'games', content_html: '<p>x</p>' }),
      }),
    );

    expect(response.status).toBe(201);
    expect(s.spies.insert).toHaveBeenCalledWith(expect.objectContaining({ slug: 'kratos-3' }));
  });

  it('returns 400 when no slug can be derived from the title', async () => {
    const s = makePostSupabase();
    createRouteHandlerClientMock.mockResolvedValueOnce(s.client);

    const response = await POST(
      new Request('https://example.com/api/articles', {
        method: 'POST',
        body: JSON.stringify({ title: '!!!', category: 'games', content_html: '<p>x</p>' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(s.spies.insert).not.toHaveBeenCalled();
  });

  it('maps unauthorized/forbidden and unexpected errors', async () => {
    requireAuthorRoleMock.mockRejectedValueOnce(new UnauthorizedError());
    const r1 = await POST(
      new Request('https://example.com/api/articles', { method: 'POST', body: '{}' }),
    );
    expect(r1.status).toBe(API_ERRORS.UNAUTHORIZED.status);

    requireAuthorRoleMock.mockRejectedValueOnce(new ForbiddenError());
    const r2 = await POST(
      new Request('https://example.com/api/articles', { method: 'POST', body: '{}' }),
    );
    expect(r2.status).toBe(API_ERRORS.FORBIDDEN.status);

    requireAuthorRoleMock.mockRejectedValueOnce(new Error('boom'));
    const r3 = await POST(
      new Request('https://example.com/api/articles', { method: 'POST', body: '{}' }),
    );
    expect(r3.status).toBe(API_ERRORS.INTERNAL.status);
  });
});
