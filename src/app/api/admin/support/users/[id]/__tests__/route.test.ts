import 'whatwg-fetch';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

const createRouteHandlerClientMock = jest.fn();
const createSupabaseAdminClientMock = jest.fn();
const requireAdminRoleMock = jest.fn();
const hasAnyRoleMock = jest.fn();

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: () => createRouteHandlerClientMock(),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => createSupabaseAdminClientMock(),
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
  requireAdminRole: (...args: unknown[]) => requireAdminRoleMock(...args),
}));

jest.mock('@/lib/roles', () => ({
  hasAnyRole: (...args: unknown[]) => hasAnyRoleMock(...args),
}));

import { API_ERRORS } from '@/lib/api/errors';
import { UnauthorizedError } from '@/lib/api/auth';
import { ForbiddenError } from '@/lib/api/permissions';
import { PATCH, DELETE, dynamic } from '@/app/api/admin/support/users/[id]/route';

type MaybeSingleResult = { data: unknown; error: unknown };

function makeAdminMock(config?: {
  maybeSingleQueue?: MaybeSingleResult[];
  updateResult?: MaybeSingleResult;
  deleteProfileError?: unknown;
  authDeleteError?: unknown;
}) {
  const maybeSingleQueue = [...(config?.maybeSingleQueue ?? [{ data: null, error: null }])];
  const updates: Array<Record<string, unknown>> = [];

  const maybeSingle = jest.fn().mockImplementation(() => {
    const next = maybeSingleQueue.shift() ?? { data: null, error: null };
    return Promise.resolve(next);
  });
  const selectEq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq: selectEq });

  const updateMaybeSingle = jest
    .fn()
    .mockResolvedValue(config?.updateResult ?? { data: null, error: null });
  const updateSelect = jest.fn().mockReturnValue({ maybeSingle: updateMaybeSingle });
  const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
  const update = jest.fn().mockImplementation((payload: Record<string, unknown>) => {
    updates.push(payload);
    return { eq: updateEq };
  });

  const deleteEq = jest.fn().mockResolvedValue({ error: config?.deleteProfileError ?? null });
  const del = jest.fn().mockReturnValue({ eq: deleteEq });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'users') {
      return { select, update, delete: del };
    }
    return {};
  });

  const deleteUser = jest.fn().mockResolvedValue({ error: config?.authDeleteError ?? null });

  return {
    client: {
      from,
      auth: { admin: { deleteUser } },
    },
    spies: {
      updates,
      maybeSingle,
      update,
      deleteEq,
      deleteUser,
    },
  };
}

function patchReq(body: unknown) {
  return new Request('https://example.com', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('app/api/admin/support/users/[id]/route', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    createRouteHandlerClientMock.mockResolvedValue({ auth: {} });
    requireAdminRoleMock.mockResolvedValue({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['owner'] },
    });
    hasAnyRoleMock.mockImplementation(
      (user: { roles?: unknown }, roles: string[]) =>
        Array.isArray(user?.roles) && user.roles.some(role => roles.includes(String(role))),
    );
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('exports route metadata', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('PATCH maps unauthorized and forbidden exceptions', async () => {
    createSupabaseAdminClientMock.mockReturnValue(makeAdminMock().client);
    requireAdminRoleMock.mockRejectedValueOnce(new UnauthorizedError());
    const r1 = await PATCH(patchReq({ updates: {} }), { params: Promise.resolve({ id: 'u2' }) });
    expect(r1.status).toBe(API_ERRORS.UNAUTHORIZED.status);

    requireAdminRoleMock.mockRejectedValueOnce(new ForbiddenError());
    const r2 = await PATCH(patchReq({ updates: {} }), { params: Promise.resolve({ id: 'u2' }) });
    expect(r2.status).toBe(API_ERRORS.FORBIDDEN.status);
  });

  it('PATCH validates user id and updates payload presence', async () => {
    createSupabaseAdminClientMock.mockReturnValue(makeAdminMock().client);
    const r1 = await PATCH(patchReq({ updates: {} }), { params: Promise.resolve({ id: '' }) });
    expect(r1.status).toBe(API_ERRORS.BAD_REQUEST.status);

    const r2 = await PATCH(patchReq({}), { params: Promise.resolve({ id: 'u2' }) });
    expect(r2.status).toBe(API_ERRORS.BAD_REQUEST.status);

    const r3 = await PATCH(patchReq('{"bad"'), { params: Promise.resolve({ id: 'u2' }) });
    expect(r3.status).toBe(API_ERRORS.BAD_REQUEST.status);
  });

  it('PATCH returns internal/not-found on target fetch problems', async () => {
    const s1 = makeAdminMock({ maybeSingleQueue: [{ data: null, error: { message: 'db fail' } }] });
    createSupabaseAdminClientMock.mockReturnValue(s1.client);
    const r1 = await PATCH(patchReq({ updates: { display_name: 'A' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r1.status).toBe(API_ERRORS.INTERNAL.status);

    const s2 = makeAdminMock({ maybeSingleQueue: [{ data: null, error: null }] });
    createSupabaseAdminClientMock.mockReturnValue(s2.client);
    const r2 = await PATCH(patchReq({ updates: { display_name: 'A' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r2.status).toBe(API_ERRORS.NOT_FOUND.status);
  });

  it('PATCH enforces role management and assignment constraints', async () => {
    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['admin'] },
    });
    const s1 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['owner'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s1.client);
    const r1 = await PATCH(patchReq({ updates: { display_name: 'X' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r1.status).toBe(403);
    expect((await r1.json()).error).toContain('Insufficient permissions for this target user role');

    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['admin'] },
    });
    const s2 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u3', roles: ['user'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s2.client);
    const r2 = await PATCH(patchReq({ updates: { roles: ['owner'] } }), {
      params: Promise.resolve({ id: 'u3' }),
    });
    expect(r2.status).toBe(403);
    expect((await r2.json()).error).toContain('Insufficient permissions to assign');
  });

  it('PATCH denies non-admin/non-moderator actors from managing users', async () => {
    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['reviewer'] },
    });
    const s = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s.client);

    const response = await PATCH(patchReq({ updates: { display_name: 'Nope' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN_ROLE_MANAGEMENT');
  });

  it('PATCH allows moderator to manage basic fields but blocks assigning admin/owner roles', async () => {
    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['moderator'] },
    });
    const s1 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: { data: { id: 'u2' }, error: null },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s1.client);
    const r1 = await PATCH(patchReq({ updates: { display_name: 'Allowed' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r1.status).toBe(200);

    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['moderator'] },
    });
    const s2 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u3', roles: ['user'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s2.client);
    const r2 = await PATCH(patchReq({ updates: { roles: ['admin'] } }), {
      params: Promise.resolve({ id: 'u3' }),
    });
    expect(r2.status).toBe(403);
    expect((await r2.json()).code).toBe('FORBIDDEN_ROLE_ASSIGNMENT');
  });

  it('PATCH allows admin to assign non-owner roles', async () => {
    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['admin'] },
    });
    const s = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: { data: { id: 'u2', roles: ['user', 'reviewer'] }, error: null },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s.client);

    const response = await PATCH(patchReq({ updates: { roles: ['reviewer'] } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(response.status).toBe(200);
    expect(s.spies.updates[0]).toMatchObject({ roles: ['user', 'reviewer'] });
  });

  it('PATCH handles invalid roles payload and empty effective updates', async () => {
    const s1 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s1.client);
    const r1 = await PATCH(patchReq({ updates: { roles: 'bad' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r1.status).toBe(400);

    const s2 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s2.client);
    const r2 = await PATCH(patchReq({ updates: { not_editable: 'x' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r2.status).toBe(API_ERRORS.BAD_REQUEST.status);
  });

  it('PATCH prevents self demotion and maps update conflict/internal/not-found', async () => {
    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['admin'] },
    });
    const s1 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'actor-1', roles: ['admin'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s1.client);
    const r1 = await PATCH(patchReq({ updates: { roles: ['user'] } }), {
      params: Promise.resolve({ id: 'actor-1' }),
    });
    expect(r1.status).toBe(403);

    const s2 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: { data: null, error: { code: '23505' } },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s2.client);
    const r2 = await PATCH(patchReq({ updates: { display_name: 'Alice' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r2.status).toBe(409);

    const s3 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: { data: null, error: { code: 'XX000' } },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s3.client);
    const r3 = await PATCH(patchReq({ updates: { display_name: 'Alice' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r3.status).toBe(API_ERRORS.INTERNAL.status);

    const s4 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: { data: null, error: null },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s4.client);
    const r4 = await PATCH(patchReq({ updates: { display_name: 'Alice' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r4.status).toBe(API_ERRORS.NOT_FOUND.status);
  });

  it('PATCH success normalizes text/roles and enforces user baseline role', async () => {
    const s = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: {
        data: { id: 'u2', roles: ['moderator', 'user'] },
        error: null,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(s.client);

    const response = await PATCH(
      patchReq({
        updates: {
          display_name: '  Alice  ',
          full_name: '',
          country: 123,
          account_status: '  active ',
          roles: ['MODERATOR', 'moderator'],
        },
      }),
      { params: Promise.resolve({ id: 'u2' }) },
    );

    expect(response.status).toBe(200);
    expect(s.spies.updates[0]).toMatchObject({
      display_name: 'Alice',
      full_name: null,
      country: null,
      account_status: 'active',
      roles: ['user', 'moderator'],
    });
  });

  it('PATCH normalizes invalid role entries to default user role', async () => {
    const s = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: { data: { id: 'u2', roles: ['user'] }, error: null },
    });
    createSupabaseAdminClientMock.mockReturnValue(s.client);

    const response = await PATCH(
      patchReq({
        updates: {
          roles: [123, null, ''],
        },
      }),
      { params: Promise.resolve({ id: 'u2' }) },
    );
    expect(response.status).toBe(200);
    expect(s.spies.updates[0]).toMatchObject({ roles: ['user'] });
  });

  it('PATCH rejects an account status the login flow does not know', async () => {
    const s = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
      updateResult: { data: { id: 'u2' }, error: null },
    });
    createSupabaseAdminClientMock.mockReturnValue(s.client);

    const response = await PATCH(patchReq({ updates: { account_status: 'suspnded' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });

    expect(response.status).toBe(400);
    expect(s.spies.updates).toHaveLength(0);
  });

  it('PATCH accepts suspended and banned', async () => {
    for (const status of ['suspended', 'BANNED']) {
      const s = makeAdminMock({
        maybeSingleQueue: [{ data: { id: 'u2', roles: ['user'] }, error: null }],
        updateResult: { data: { id: 'u2' }, error: null },
      });
      createSupabaseAdminClientMock.mockReturnValue(s.client);

      const response = await PATCH(patchReq({ updates: { account_status: status } }), {
        params: Promise.resolve({ id: 'u2' }),
      });

      expect(response.status).toBe(200);
      expect(s.spies.updates[0]).toMatchObject({ account_status: status.toLowerCase() });
    }
  });

  it('DELETE maps unauthorized and forbidden exceptions', async () => {
    createSupabaseAdminClientMock.mockReturnValue(makeAdminMock().client);
    requireAdminRoleMock.mockRejectedValueOnce(new UnauthorizedError());
    const r1 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r1.status).toBe(API_ERRORS.UNAUTHORIZED.status);

    requireAdminRoleMock.mockRejectedValueOnce(new ForbiddenError());
    const r2 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r2.status).toBe(API_ERRORS.FORBIDDEN.status);
  });

  it('DELETE validates id, self-delete, target fetch, role permissions and delete errors', async () => {
    const s1 = makeAdminMock();
    createSupabaseAdminClientMock.mockReturnValueOnce(s1.client);
    const r1 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '' }),
    });
    expect(r1.status).toBe(API_ERRORS.BAD_REQUEST.status);

    const s2 = makeAdminMock();
    createSupabaseAdminClientMock.mockReturnValueOnce(s2.client);
    const r2 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'actor-1' }),
    });
    expect(r2.status).toBe(400);

    const s3 = makeAdminMock({ maybeSingleQueue: [{ data: null, error: { message: 'fail' } }] });
    createSupabaseAdminClientMock.mockReturnValueOnce(s3.client);
    const r3 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r3.status).toBe(API_ERRORS.INTERNAL.status);

    const s4 = makeAdminMock({ maybeSingleQueue: [{ data: null, error: null }] });
    createSupabaseAdminClientMock.mockReturnValueOnce(s4.client);
    const r4 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r4.status).toBe(API_ERRORS.NOT_FOUND.status);

    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['moderator'] },
    });
    const s5 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', username: 'x', roles: ['admin'] }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s5.client);
    const r5 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r5.status).toBe(403);

    const s6 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', username: 'x', roles: ['user'] }, error: null }],
      deleteProfileError: { message: 'del fail' },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s6.client);
    const r6 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r6.status).toBe(API_ERRORS.INTERNAL.status);
  });

  it('PATCH and DELETE handle non-array actor/target roles safely', async () => {
    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: null },
    });
    const s1 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', roles: null }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s1.client);
    const r1 = await PATCH(patchReq({ updates: { display_name: 'X' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r1.status).toBe(403);

    requireAdminRoleMock.mockResolvedValueOnce({
      session: { user: { id: 'actor-1' } },
      user: { roles: null },
    });
    const s2 = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', username: 'x', roles: null }, error: null }],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(s2.client);
    const r2 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r2.status).toBe(403);
  });

  it('DELETE success returns user and tolerates auth delete warning', async () => {
    const s = makeAdminMock({
      maybeSingleQueue: [{ data: { id: 'u2', username: 'alice', roles: ['user'] }, error: null }],
      authDeleteError: { message: 'warn' },
    });
    createSupabaseAdminClientMock.mockReturnValue(s.client);

    const response = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'u2', username: 'alice' },
    });
    expect(s.spies.deleteUser).toHaveBeenCalledWith('u2');
  });

  it('maps generic unexpected errors to internal on PATCH and DELETE', async () => {
    createRouteHandlerClientMock.mockRejectedValueOnce(new Error('boom-patch'));
    createSupabaseAdminClientMock.mockReturnValue(makeAdminMock().client);
    const r1 = await PATCH(patchReq({ updates: { display_name: 'x' } }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r1.status).toBe(API_ERRORS.INTERNAL.status);

    createRouteHandlerClientMock.mockRejectedValueOnce(new Error('boom-delete'));
    createSupabaseAdminClientMock.mockReturnValue(makeAdminMock().client);
    const r2 = await DELETE(new Request('https://example.com', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'u2' }),
    });
    expect(r2.status).toBe(API_ERRORS.INTERNAL.status);
  });
});
