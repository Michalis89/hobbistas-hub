import 'whatwg-fetch';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const createRouteHandlerClientMock = jest.fn();
const sanitizeHtmlContentMock = jest.fn();
const validatePlainTextMock = jest.fn();
const validatePlainTextArrayMock = jest.fn();
const normalizeSlugMock = jest.fn();
const insertActivityMock = jest.fn();
const requireAuthMock = jest.fn();
const hasAnyRoleMock = jest.fn();
const getUserFullInfoMock = jest.fn();
const revalidateArticleMock = jest.fn();

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

jest.mock('@/utils/slugify', () => ({
  normalizeSlug: (...args: unknown[]) => normalizeSlugMock(...args),
}));

jest.mock('@/lib/services/activityService', () => ({
  insertActivity: (...args: unknown[]) => insertActivityMock(...args),
}));

jest.mock('@/lib/api/auth', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    code = 'UNAUTHORIZED';
  },
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
}));

jest.mock('@/lib/roles', () => ({
  hasAnyRole: (...args: unknown[]) => hasAnyRoleMock(...args),
}));

jest.mock('@/lib/services/userService', () => ({
  getUserFullInfo: (...args: unknown[]) => getUserFullInfoMock(...args),
}));

jest.mock('@/lib/cache/tags', () => ({
  revalidateCache: {
    article: (...args: unknown[]) => revalidateArticleMock(...args),
  },
}));

import { API_ERRORS } from '@/lib/api/errors';
import { UnauthorizedError } from '@/lib/api/auth';
import { GET, PUT, DELETE } from '@/app/api/articles/[id]/route';

type MaybeResult = { data: unknown; error: unknown };

function makeSupabaseMock(config?: {
  getArticleResult?: MaybeResult;
  getSessionUserId?: string | null;
  viewInsertReject?: boolean;
  existingArticleResult?: MaybeResult;
  updateResult?: MaybeResult;
  deleteError?: unknown;
}) {
  const getArticleResult = config?.getArticleResult ?? { data: null, error: null };
  const existingArticleResult = config?.existingArticleResult ?? { data: null, error: null };
  const updateResult = config?.updateResult ?? { data: null, error: null };

  const getArticleSingle = jest.fn().mockResolvedValue(getArticleResult);
  const getByEq = jest.fn().mockReturnValue({ single: getArticleSingle });
  const getByIn = jest.fn().mockReturnValue({ single: getArticleSingle });
  const articleGetSelect = jest.fn().mockReturnValue({ eq: getByEq, in: getByIn });

  const existingSingle = jest.fn().mockResolvedValue(existingArticleResult);
  const existingEq = jest.fn().mockReturnValue({ single: existingSingle });
  const articleCrudSelect = jest.fn().mockReturnValue({ eq: existingEq });

  const updateSingle = jest.fn().mockResolvedValue(updateResult);
  const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
  const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
  const updates: Array<Record<string, unknown>> = [];
  const update = jest.fn().mockImplementation((payload: Record<string, unknown>) => {
    updates.push(payload);
    return { eq: updateEq };
  });

  const deleteEq = jest.fn().mockResolvedValue({ error: config?.deleteError ?? null });
  const del = jest.fn().mockReturnValue({ eq: deleteEq });

  const viewInsert = config?.viewInsertReject
    ? jest.fn().mockRejectedValue(new Error('view insert fail'))
    : jest.fn().mockResolvedValue({ error: null });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'articles') {
      return {
        select: (columns: string) =>
          columns.includes('users!author_id') ? articleGetSelect() : articleCrudSelect(),
        update,
        delete: del,
      };
    }
    if (table === 'article_views') {
      return { insert: viewInsert };
    }
    return {};
  });

  const getSession = jest.fn().mockResolvedValue({
    data: {
      session: config?.getSessionUserId ? { user: { id: config.getSessionUserId } } : null,
    },
  });

  return {
    client: {
      from,
      auth: { getSession },
    },
    spies: {
      from,
      getByEq,
      getByIn,
      viewInsert,
      updates,
      deleteEq,
    },
  };
}

describe('app/api/articles/[id]/route', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    sanitizeHtmlContentMock.mockImplementation((v: string) => v);
    validatePlainTextMock.mockReturnValue({ isValid: true });
    validatePlainTextArrayMock.mockReturnValue({ isValid: true });
    normalizeSlugMock.mockImplementation((v: string) => `norm-${v}`);
    insertActivityMock.mockResolvedValue(undefined);
    requireAuthMock.mockResolvedValue({ user: { id: 'author-1' } });
    hasAnyRoleMock.mockImplementation(
      (user: { roles?: unknown }, roles: string[]) =>
        Array.isArray(user?.roles) && user.roles.some(role => roles.includes(String(role))),
    );
    getUserFullInfoMock.mockResolvedValue({ roles: ['user'], username: 'u', display_name: 'U' });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('GET fetches by numeric id and returns article', async () => {
    const supabase = makeSupabaseMock({
      getArticleResult: { data: { id: 1, author_id: 'x' }, error: null },
      getSessionUserId: null,
    });
    createRouteHandlerClientMock.mockResolvedValue(supabase.client);

    const response = await GET(new Request('https://example.com'), {
      params: Promise.resolve({ id: '123' }),
    });
    expect(response.status).toBe(200);
    expect(supabase.spies.getByEq).toHaveBeenCalledWith('id', 123);
  });

  it('GET fetches by slug candidates and tracks view for other user', async () => {
    const supabase = makeSupabaseMock({
      getArticleResult: { data: { id: 9, author_id: 'author-2' }, error: null },
      getSessionUserId: 'viewer-1',
    });
    createRouteHandlerClientMock.mockResolvedValue(supabase.client);

    const response = await GET(new Request('https://example.com'), {
      params: Promise.resolve({ id: 'Some Slug' }),
    });
    expect(response.status).toBe(200);
    expect(normalizeSlugMock).toHaveBeenCalledWith('Some Slug');
    expect(supabase.spies.getByIn).toHaveBeenCalled();
    expect(supabase.spies.viewInsert).toHaveBeenCalledWith({ article_id: 9, user_id: 'viewer-1' });
  });

  it('GET ignores optional view tracking failures', async () => {
    const supabase = makeSupabaseMock({
      getArticleResult: { data: { id: 10, author_id: 'a2' }, error: null },
      getSessionUserId: 'viewer-1',
      viewInsertReject: true,
    });
    createRouteHandlerClientMock.mockResolvedValue(supabase.client);

    const response = await GET(new Request('https://example.com'), {
      params: Promise.resolve({ id: '10' }),
    });
    expect(response.status).toBe(200);
  });

  it('GET returns 404 and internal error paths', async () => {
    const s1 = makeSupabaseMock({ getArticleResult: { data: null, error: { message: 'nf' } } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s1.client);
    const r1 = await GET(new Request('https://example.com'), {
      params: Promise.resolve({ id: '11' }),
    });
    expect(r1.status).toBe(404);

    createRouteHandlerClientMock.mockRejectedValueOnce(new Error('boom'));
    const r2 = await GET(new Request('https://example.com'), {
      params: Promise.resolve({ id: '11' }),
    });
    expect(r2.status).toBe(API_ERRORS.INTERNAL.status);
  });

  it('PUT maps unauthorized and internal catches', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabaseMock().client);
    requireAuthMock.mockRejectedValueOnce(new UnauthorizedError());
    const r1 = await PUT(new Request('https://example.com', { method: 'PUT', body: '{}' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r1.status).toBe(API_ERRORS.UNAUTHORIZED.status);

    createRouteHandlerClientMock.mockRejectedValueOnce(new Error('boom'));
    const r2 = await PUT(new Request('https://example.com', { method: 'PUT', body: '{}' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r2.status).toBe(API_ERRORS.INTERNAL.status);
  });

  it('PUT returns 404 when article is missing', async () => {
    const supabase = makeSupabaseMock({
      existingArticleResult: { data: null, error: { message: 'nf' } },
    });
    createRouteHandlerClientMock.mockResolvedValue(supabase.client);
    const response = await PUT(new Request('https://example.com', { method: 'PUT', body: '{}' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(response.status).toBe(404);
  });

  it('PUT enforces author/admin permission', async () => {
    const supabase = makeSupabaseMock({
      existingArticleResult: {
        data: { id: 1, author_id: 'other', published_at: null },
        error: null,
      },
    });
    createRouteHandlerClientMock.mockResolvedValue(supabase.client);
    getUserFullInfoMock.mockResolvedValue({ roles: ['user'] });

    const response = await PUT(
      new Request('https://example.com', { method: 'PUT', body: JSON.stringify({ title: 'x' }) }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(response.status).toBe(403);
  });

  it('PUT validates score boundaries and plain-text/tags fields', async () => {
    const baseArticle = { id: 1, author_id: 'author-1', published_at: null };

    const s1 = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s1.client);
    const r1 = await PUT(
      new Request('https://example.com', { method: 'PUT', body: JSON.stringify({ score: 'nan' }) }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r1.status).toBe(400);

    const s2 = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s2.client);
    const r2 = await PUT(
      new Request('https://example.com', { method: 'PUT', body: JSON.stringify({ score: 11 }) }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r2.status).toBe(400);

    validatePlainTextMock.mockReturnValueOnce({ isValid: false, error: 'bad title' });
    const s3 = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s3.client);
    const r3 = await PUT(
      new Request('https://example.com', { method: 'PUT', body: JSON.stringify({ title: 'x' }) }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r3.status).toBe(400);

    validatePlainTextArrayMock.mockReturnValueOnce({ isValid: false, error: 'bad tags' });
    const s4 = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s4.client);
    const r4 = await PUT(
      new Request('https://example.com', { method: 'PUT', body: JSON.stringify({ tags: ['x'] }) }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r4.status).toBe(400);
  });

  it('PUT rejects content_rich containing node types outside the article schema', async () => {
    const baseArticle = { id: 1, author_id: 'author-1', published_at: null };
    const s = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s.client);

    const response = await PUT(
      new Request('https://example.com', {
        method: 'PUT',
        body: JSON.stringify({
          content_rich: {
            type: 'doc',
            content: [{ type: 'iframeEmbed', attrs: { src: 'https://evil.com' } }],
          },
        }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(response.status).toBe(400);
  });

  it('PUT accepts content_rich that matches the article schema', async () => {
    const baseArticle = { id: 1, author_id: 'author-1', published_at: null };
    const s = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s.client);

    const response = await PUT(
      new Request('https://example.com', {
        method: 'PUT',
        body: JSON.stringify({
          content_rich: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }],
          },
        }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(response.status).not.toBe(400);
  });

  it('PUT returns fallback errors for description/meta title/meta description validations', async () => {
    const baseArticle = { id: 1, author_id: 'author-1', published_at: null };

    validatePlainTextMock.mockReturnValueOnce({ isValid: false });
    const s1 = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s1.client);
    const r1 = await PUT(
      new Request('https://example.com', {
        method: 'PUT',
        body: JSON.stringify({ description: 'x' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r1.status).toBe(400);
    await expect(r1.json()).resolves.toEqual({ error: 'Invalid description' });

    validatePlainTextMock
      .mockReturnValueOnce({ isValid: true })
      .mockReturnValueOnce({ isValid: false });
    const s2 = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s2.client);
    const r2 = await PUT(
      new Request('https://example.com', {
        method: 'PUT',
        body: JSON.stringify({ description: 'ok', meta_title: 'x' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r2.status).toBe(400);
    await expect(r2.json()).resolves.toEqual({ error: 'Invalid meta title' });

    validatePlainTextMock
      .mockReturnValueOnce({ isValid: true })
      .mockReturnValueOnce({ isValid: true })
      .mockReturnValueOnce({ isValid: false });
    const s3 = makeSupabaseMock({ existingArticleResult: { data: baseArticle, error: null } });
    createRouteHandlerClientMock.mockResolvedValueOnce(s3.client);
    const r3 = await PUT(
      new Request('https://example.com', {
        method: 'PUT',
        body: JSON.stringify({ description: 'ok', meta_title: 'ok', meta_description: 'x' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r3.status).toBe(400);
    await expect(r3.json()).resolves.toEqual({ error: 'Invalid meta description' });
  });

  it('PUT handles update error and success path with activity/revalidate', async () => {
    const existing = { id: 1, author_id: 'author-1', published_at: null };
    const updated = { id: 1, title: 'New', slug: 'norm-new' };

    const s1 = makeSupabaseMock({
      existingArticleResult: { data: existing, error: null },
      updateResult: { data: null, error: { message: 'fail' } },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s1.client);
    const r1 = await PUT(
      new Request('https://example.com', { method: 'PUT', body: JSON.stringify({ title: 'New' }) }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r1.status).toBe(500);

    const s2 = makeSupabaseMock({
      existingArticleResult: { data: existing, error: null },
      updateResult: { data: updated, error: null },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s2.client);
    const r2 = await PUT(
      new Request('https://example.com', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'New',
          slug: 'new',
          description: 'desc',
          category: 'news',
          topic: 'articles',
          tags: ['a'],
          cover_image: '/c.png',
          content_rich: { type: 'doc', content: [] },
          content_html: ' <p>x</p> ',
          meta_title: 'mt',
          meta_description: 'md',
          status: 'published',
          is_featured: true,
          score: '7',
          media_id: '3',
        }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(r2.status).toBe(200);
    expect(s2.spies.updates[0]).toMatchObject({
      slug: 'norm-new',
      content_html: '<p>x</p>',
      score: 7,
      media_id: 3,
      status: 'published',
      is_featured: true,
    });
    expect(s2.spies.updates[0].published_at).toBeDefined();
    expect(insertActivityMock).toHaveBeenCalled();
    expect(revalidateArticleMock).toHaveBeenCalledWith(1);
  });

  it('PUT keeps null score/media and preserves published_at when already published', async () => {
    const existing = { id: 2, author_id: 'author-1', published_at: '2020-01-01T00:00:00.000Z' };
    const s = makeSupabaseMock({
      existingArticleResult: { data: existing, error: null },
      updateResult: { data: { id: 2, title: 'x', slug: 'norm-x' }, error: null },
    });
    createRouteHandlerClientMock.mockResolvedValue(s.client);

    const response = await PUT(
      new Request('https://example.com', {
        method: 'PUT',
        body: JSON.stringify({ slug: 'x', status: 'published', score: null, media_id: null }),
      }),
      { params: Promise.resolve({ id: '2' }) },
    );
    expect(response.status).toBe(200);
    expect(s.spies.updates[0]).toMatchObject({ score: null, media_id: null, status: 'published' });
    expect(s.spies.updates[0].published_at).toBeUndefined();
  });

  it('DELETE maps unauthorized/internal and handles not-found/forbidden/error/success', async () => {
    createRouteHandlerClientMock.mockResolvedValue(makeSupabaseMock().client);
    requireAuthMock.mockRejectedValueOnce(new UnauthorizedError());
    const r1 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r1.status).toBe(API_ERRORS.UNAUTHORIZED.status);

    const s2 = makeSupabaseMock({
      existingArticleResult: { data: null, error: { message: 'nf' } },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s2.client);
    const r2 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r2.status).toBe(404);

    const s3 = makeSupabaseMock({
      existingArticleResult: {
        data: { id: 1, author_id: 'other', slug: 's', title: 't' },
        error: null,
      },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s3.client);
    getUserFullInfoMock.mockResolvedValueOnce({ roles: ['user'] });
    const r3 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r3.status).toBe(403);

    const s4 = makeSupabaseMock({
      existingArticleResult: {
        data: { id: 1, author_id: 'author-1', slug: 's', title: 't' },
        error: null,
      },
      deleteError: { message: 'del fail' },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s4.client);
    const r4 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r4.status).toBe(500);

    const s5 = makeSupabaseMock({
      existingArticleResult: {
        data: { id: 1, author_id: 'author-1', slug: 's', title: 't' },
        error: null,
      },
      deleteError: null,
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(s5.client);
    const r5 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r5.status).toBe(200);
    expect(insertActivityMock).toHaveBeenCalled();
    expect(revalidateArticleMock).toHaveBeenCalledWith(1);

    createRouteHandlerClientMock.mockRejectedValueOnce(new Error('boom'));
    const r6 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(r6.status).toBe(API_ERRORS.INTERNAL.status);
  });
});
