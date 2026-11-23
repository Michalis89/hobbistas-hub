/**
 * @jest-environment node
 *
 * Permission matrix for the article routes Studio saves through.
 *
 * Unlike route.test.ts, nothing here mocks the authorisation code: requireAuth,
 * requireAuthorRole and hasAnyRole run for real. Only the Supabase client (the
 * session and the rows) and the caller's roles are controlled.
 */
import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const getUserFullInfoMock = jest.fn();

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));
jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));
jest.mock('@/lib/services/userService', () => ({
  getUserFullInfo: (...args: unknown[]) => getUserFullInfoMock(...args),
}));
jest.mock('@/lib/services/activityService', () => ({ insertActivity: jest.fn() }));
jest.mock('@/lib/articles/mediaLinks', () => ({
  collectArticleMediaLinks: jest.fn(() => []),
  syncArticleMediaLinks: jest.fn(),
}));
jest.mock('@/lib/articles/revisions', () => ({ snapshotArticleRevision: jest.fn() }));
jest.mock('@/lib/cache/tags', () => ({
  CACHE_CONFIG: { PUBLIC_DATA: { revalidate: 60 } },
  CACHE_TAGS: { ARTICLES: 'articles' },
  revalidateCache: { article: jest.fn() },
}));
jest.mock('@/utils/security/sanitizeHtml', () => ({
  sanitizeHtmlContent: (html: string) => html ?? '',
}));
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));

import { POST } from '@/app/api/articles/route';
import { PUT, DELETE } from '@/app/api/articles/[id]/route';

type Row = Record<string, unknown>;

/** A chainable stand-in for the user's RLS-scoped Supabase client. */
function client(sessionUserId: string | null, existing: Row | null = null) {
  const writes = { inserts: [] as Row[], updates: [] as Row[], deletes: 0 };
  const articles = () => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    const result = () => {
      if (op === 'insert') {
        return { data: { id: 10, ...payload }, error: null };
      }
      if (op === 'update') {
        return { data: { ...existing, ...payload }, error: null };
      }
      return existing
        ? { data: existing, error: null }
        : { data: null, error: { code: 'PGRST116' } };
    };
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      in: () => query,
      like: async () => ({ data: [], error: null }),
      insert: (row: Row) => {
        op = 'insert';
        payload = row;
        writes.inserts.push(row);
        return query;
      },
      update: (row: Row) => {
        op = 'update';
        payload = row;
        writes.updates.push(row);
        return query;
      },
      delete: () => {
        op = 'delete';
        writes.deletes += 1;
        return query;
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return query;
  };
  return {
    writes,
    supabase: {
      from: (table: string) => (table === 'articles' ? articles() : articles()),
      auth: {
        getSession: async () => ({
          data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
        }),
      },
    },
  };
}

const as = (roles: string[]) =>
  getUserFullInfoMock.mockResolvedValue({
    id: 'caller',
    roles,
    username: 'caller',
    display_name: 'Caller',
    avatar_url: null,
  });

const createRequest = (body: Row = {}) =>
  new Request('https://example.test/api/articles', {
    method: 'POST',
    body: JSON.stringify({ title: 'MTG Commander', category: 'games', ...body }),
  });
const updateRequest = () =>
  new Request('https://example.test/api/articles/1', {
    method: 'PUT',
    body: JSON.stringify({ title: 'Edited title' }),
  });
const params = { params: Promise.resolve({ id: '1' }) };

describe('article routes: who may create, edit and delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('POST /api/articles (create a draft)', () => {
    it.each(['author', 'reviewer', 'admin', 'owner'])('%s may create a draft', async role => {
      const { supabase, writes } = client('caller');
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', role]);

      const response = await POST(createRequest());

      expect(response.status).toBe(201);
      expect(writes.inserts).toHaveLength(1);
      expect(writes.inserts[0]).toMatchObject({ status: 'draft', author_id: 'caller' });
    });

    it.each([{ roles: ['user'] }, { roles: ['user', 'moderator'] }])(
      'roles $roles may not create (403, nothing written)',
      async ({ roles }) => {
        const { supabase, writes } = client('caller');
        createRouteHandlerClientMock.mockResolvedValue(supabase);
        as(roles);

        const response = await POST(createRequest());

        expect(response.status).toBe(403);
        expect(writes.inserts).toHaveLength(0);
      },
    );

    it('without a session answers 401 "Unauthorized access" and writes nothing', async () => {
      const { supabase, writes } = client(null);
      createRouteHandlerClientMock.mockResolvedValue(supabase);

      const response = await POST(createRequest());

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized access' });
      expect(writes.inserts).toHaveLength(0);
      expect(getUserFullInfoMock).not.toHaveBeenCalled();
    });

    it('a missing editorial role is 403, never 401, so 401 always means "no session"', async () => {
      const { supabase } = client('caller');
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user']);

      const response = await POST(createRequest());
      expect(response.status).toBe(403);
    });

    it('ownership comes from the session, not from the request body', async () => {
      const { supabase, writes } = client('caller');
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', 'author']);

      await POST(createRequest({ author_id: 'someone-else' }));

      expect(writes.inserts[0].author_id).toBe('caller');
    });
  });

  describe('PUT /api/articles/[id] (edit)', () => {
    const own = { id: 1, author_id: 'caller', title: 'Mine', slug: 'mine', published_at: null };
    const others = { ...own, author_id: 'other-author', title: 'Theirs', slug: 'theirs' };

    it('an author may edit their own article', async () => {
      const { supabase, writes } = client('caller', own);
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', 'author']);

      const response = await PUT(updateRequest(), params);

      expect(response.status).toBe(200);
      expect(writes.updates).toHaveLength(1);
    });

    it("an author may not edit another author's article (403, nothing written)", async () => {
      const { supabase, writes } = client('caller', others);
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', 'author']);

      const response = await PUT(updateRequest(), params);

      expect(response.status).toBe(403);
      expect(writes.updates).toHaveLength(0);
    });

    it.each(['admin', 'owner', 'reviewer'])("%s may edit another author's article", async role => {
      const { supabase, writes } = client('caller', others);
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', role]);

      const response = await PUT(updateRequest(), params);

      expect(response.status).toBe(200);
      expect(writes.updates).toHaveLength(1);
    });

    it("a moderator may not edit another author's article through this route", async () => {
      const { supabase, writes } = client('caller', others);
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', 'moderator']);

      const response = await PUT(updateRequest(), params);

      expect(response.status).toBe(403);
      expect(writes.updates).toHaveLength(0);
    });

    it('without a session answers 401 and writes nothing', async () => {
      const { supabase, writes } = client(null, own);
      createRouteHandlerClientMock.mockResolvedValue(supabase);

      const response = await PUT(updateRequest(), params);

      expect(response.status).toBe(401);
      expect(writes.updates).toHaveLength(0);
    });
  });

  describe('DELETE /api/articles/[id]', () => {
    const own = { id: 1, author_id: 'caller', title: 'Mine', slug: 'mine' };
    const others = { ...own, author_id: 'other-author' };

    it('an author may delete their own article', async () => {
      const { supabase, writes } = client('caller', own);
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', 'author']);

      const response = await DELETE(
        new Request('https://example.test', { method: 'DELETE' }),
        params,
      );

      expect(response.status).toBe(200);
      expect(writes.deletes).toBe(1);
    });

    it("an author may not delete another author's article", async () => {
      const { supabase, writes } = client('caller', others);
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', 'author']);

      const response = await DELETE(
        new Request('https://example.test', { method: 'DELETE' }),
        params,
      );

      expect(response.status).toBe(403);
      expect(writes.deletes).toBe(0);
    });

    it("an admin may delete another author's article", async () => {
      const { supabase, writes } = client('caller', others);
      createRouteHandlerClientMock.mockResolvedValue(supabase);
      as(['user', 'admin']);

      const response = await DELETE(
        new Request('https://example.test', { method: 'DELETE' }),
        params,
      );

      expect(response.status).toBe(200);
      expect(writes.deletes).toBe(1);
    });
  });
});
