/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: init?.headers,
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
const rateLimitMock = jest.fn();
const sendAdminMessageEmailMock = jest.fn();

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

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  rateLimitHeaders: () => ({ 'Retry-After': '60' }),
}));

jest.mock('@/lib/email/send', () => ({
  sendAdminMessageEmail: (...args: unknown[]) => sendAdminMessageEmailMock(...args),
}));

import { API_ERRORS } from '@/lib/api/errors';
import { UnauthorizedError } from '@/lib/api/auth';
import { ForbiddenError } from '@/lib/api/permissions';
import { POST, dynamic, runtime } from '@/app/api/admin/support/users/[id]/email/route';

const KEY = '0b9a3c3e-6f0a-4f43-9d9e-6a0c2f1b7e11';
const TARGET = {
  id: 'user-1',
  username: 'maria89',
  display_name: 'Maria',
  account_status: 'active',
  is_demo: false,
};
const AUTH_USER = { email: 'maria@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };

type Result = { data?: unknown; error?: unknown; count?: number | null };

function makeAdminMock(config?: {
  target?: Result;
  authUser?: Result;
  recipientCount?: Result;
  senderCount?: Result;
  insert?: Result;
  update?: Result;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const countQueries: Array<Record<string, unknown>> = [];

  const usersSelect = jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue(config?.target ?? { data: TARGET, error: null }),
    }),
  });

  const countSelect = () => {
    const filters: Record<string, unknown> = {};
    countQueries.push(filters);
    const chain = {
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      in: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      gte: (column: string, value: unknown) => {
        filters[column] = value;
        const result =
          'recipient_user_id' in filters
            ? (config?.recipientCount ?? { count: 0, error: null })
            : (config?.senderCount ?? { count: 0, error: null });
        return Promise.resolve(result);
      },
    };
    return chain;
  };

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'users') {
      return { select: usersSelect };
    }
    if (table === 'admin_user_emails') {
      return {
        select: countSelect,
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve(config?.insert ?? { data: { id: 'log-1' }, error: null }),
            }),
          };
        },
        update: (row: Record<string, unknown>) => {
          updates.push(row);
          return { eq: () => Promise.resolve(config?.update ?? { error: null }) };
        },
      };
    }
    return {};
  });

  const getUserById = jest
    .fn()
    .mockResolvedValue(config?.authUser ?? { data: { user: AUTH_USER }, error: null });

  return {
    client: { from, auth: { admin: { getUserById } } },
    spies: { inserts, updates, countQueries, getUserById, from },
  };
}

function postReq(body: unknown) {
  return new Request('https://example.com', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ctx = (id = 'user-1') => ({ params: Promise.resolve({ id }) });
const validBody = {
  subject: 'Hello {{displayName}}',
  message: 'Hi {{displayName}},\n\nThanks for joining.',
  idempotencyKey: KEY,
};

describe('app/api/admin/support/users/[id]/email/route', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    createRouteHandlerClientMock.mockResolvedValue({ auth: {} });
    requireAdminRoleMock.mockResolvedValue({
      session: { user: { id: 'owner-1' } },
      user: { roles: ['user', 'owner'] },
    });
    rateLimitMock.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
    sendAdminMessageEmailMock.mockResolvedValue({
      status: 'accepted',
      providerMessageId: 'msg_1',
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('exports route metadata', () => {
    expect(dynamic).toBe('force-dynamic');
    expect(runtime).toBe('nodejs');
  });

  it('lets the owner send a personalized email and records it in the audit log', async () => {
    const admin = makeAdminMock();
    createSupabaseAdminClientMock.mockReturnValue(admin.client);

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { id: 'log-1', status: 'accepted' } });
    expect(sendAdminMessageEmailMock).toHaveBeenCalledWith({
      to: 'maria@example.com',
      subject: 'Hello Maria',
      message: 'Hi Maria,\n\nThanks for joining.',
      idempotencyKey: KEY,
    });
    expect(admin.spies.inserts).toEqual([
      {
        recipient_user_id: 'user-1',
        recipient_email: 'maria@example.com',
        sender_user_id: 'owner-1',
        subject: 'Hello Maria',
        status: 'pending',
        idempotency_key: KEY,
      },
    ]);
    // The message body is never stored.
    expect(JSON.stringify(admin.spies.inserts)).not.toContain('Thanks for joining');
    expect(admin.spies.updates).toEqual([
      expect.objectContaining({ status: 'accepted', provider_message_id: 'msg_1' }),
    ]);
    expect(rateLimitMock).toHaveBeenCalledWith('adminEmailSend', 'owner-1');
  });

  it('falls back to the username when there is no display name', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ target: { data: { ...TARGET, display_name: null }, error: null } }).client,
    );

    await POST(postReq(validBody), ctx());

    expect(sendAdminMessageEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Hello maria89' }),
    );
  });

  it('records a simulated send without a provider id', async () => {
    const admin = makeAdminMock();
    createSupabaseAdminClientMock.mockReturnValue(admin.client);
    sendAdminMessageEmailMock.mockResolvedValue({ status: 'simulated' });

    const res = await POST(postReq(validBody), ctx());

    await expect(res.json()).resolves.toEqual({ data: { id: 'log-1', status: 'simulated' } });
    expect(admin.spies.updates).toEqual([
      expect.objectContaining({ status: 'simulated', provider_message_id: null }),
    ]);
  });

  it('rejects unauthenticated requests', async () => {
    requireAdminRoleMock.mockRejectedValue(new UnauthorizedError());

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(API_ERRORS.UNAUTHORIZED.status);
    expect(sendAdminMessageEmailMock).not.toHaveBeenCalled();
  });

  it('rejects regular users', async () => {
    requireAdminRoleMock.mockRejectedValue(new ForbiddenError());

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(API_ERRORS.FORBIDDEN.status);
  });

  it.each([['admin'], ['moderator']])('rejects %s accounts that are not owner', async role => {
    requireAdminRoleMock.mockResolvedValue({
      session: { user: { id: 'actor-1' } },
      user: { roles: ['user', role] },
    });
    const admin = makeAdminMock();
    createSupabaseAdminClientMock.mockReturnValue(admin.client);

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(API_ERRORS.FORBIDDEN.status);
    expect(admin.spies.from).not.toHaveBeenCalled();
    expect(sendAdminMessageEmailMock).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied recipient address', async () => {
    const admin = makeAdminMock();
    createSupabaseAdminClientMock.mockReturnValue(admin.client);

    await POST(
      postReq({ ...validBody, to: 'attacker@example.com', email: 'attacker@example.com' }),
      ctx(),
    );

    expect(sendAdminMessageEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'maria@example.com' }),
    );
    expect(admin.spies.inserts[0].recipient_email).toBe('maria@example.com');
  });

  it.each([
    [{ ...validBody, subject: '' }, 'Subject is required.'],
    [{ ...validBody, message: '' }, 'Message is required.'],
    [{ ...validBody, subject: 'Hi\r\nBcc: x@y.z' }, 'Subject must be a single line of plain text.'],
    [{ ...validBody, idempotencyKey: undefined }, 'Invalid submission key.'],
    ['not json', 'Invalid request body.'],
  ])('validates the payload (%p)', async (body, error) => {
    const res = await POST(postReq(body), ctx());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error, code: 'BAD_REQUEST' });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ target: { data: null, error: null } }).client,
    );

    const res = await POST(postReq(validBody), ctx('missing'));

    expect(res.status).toBe(404);
    expect(sendAdminMessageEmailMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a deleted account', { target: { data: { ...TARGET, account_status: 'deleted' } } }],
    ['a demo account', { target: { data: { ...TARGET, is_demo: true } } }],
    ['a missing auth user', { authUser: { data: { user: null }, error: { message: 'nope' } } }],
    [
      'an unconfirmed email',
      { authUser: { data: { user: { ...AUTH_USER, email_confirmed_at: null } }, error: null } },
    ],
  ])('refuses %s', async (_label, config) => {
    const admin = makeAdminMock(config as Parameters<typeof makeAdminMock>[0]);
    createSupabaseAdminClientMock.mockReturnValue(admin.client);

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ code: 'RECIPIENT_NOT_ELIGIBLE' }),
    );
    expect(admin.spies.inserts).toHaveLength(0);
    expect(sendAdminMessageEmailMock).not.toHaveBeenCalled();
  });

  it('applies the per-sender burst limit', async () => {
    rateLimitMock.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ code: 'RATE_LIMITED' }));
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it('caps emails per recipient per day, counting only non-failed attempts', async () => {
    const admin = makeAdminMock({ recipientCount: { count: 3, error: null } });
    createSupabaseAdminClientMock.mockReturnValue(admin.client);

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ code: 'RECIPIENT_DAILY_LIMIT' }),
    );
    expect(admin.spies.countQueries[0]).toEqual(
      expect.objectContaining({
        recipient_user_id: 'user-1',
        status: ['pending', 'accepted', 'simulated'],
      }),
    );
    expect(sendAdminMessageEmailMock).not.toHaveBeenCalled();
  });

  it('caps emails per sender per day', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ senderCount: { count: 50, error: null } }).client,
    );

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ code: 'SENDER_DAILY_LIMIT' }),
    );
  });

  it('rejects a duplicate submission of the same compose session', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ insert: { data: null, error: { code: '23505' } } }).client,
    );

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ code: 'DUPLICATE_SUBMISSION' }),
    );
    expect(sendAdminMessageEmailMock).not.toHaveBeenCalled();
  });

  it('records a provider failure and returns 502 without leaking provider detail', async () => {
    const admin = makeAdminMock();
    createSupabaseAdminClientMock.mockReturnValue(admin.client);
    sendAdminMessageEmailMock.mockResolvedValue({
      status: 'failed',
      errorCode: 'validation_error',
      errorMessage: 'Invalid `to` field: [redacted]',
    });

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      error: 'The email provider rejected the message. Nothing was sent.',
      code: 'EMAIL_PROVIDER_ERROR',
    });
    expect(admin.spies.updates).toEqual([
      expect.objectContaining({
        status: 'failed',
        error_code: 'validation_error',
        error_message: 'Invalid `to` field: [redacted]',
      }),
    ]);
    // Logs carry the error code only, never the recipient address.
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('maria@example.com');
  });

  it('still reports success if only the audit update fails', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ update: { error: { message: 'db down' } } }).client,
    );

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(200);
  });

  it('returns 500 when the audit row cannot be written, before sending', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ insert: { data: null, error: { code: '42P01' } } }).client,
    );

    const res = await POST(postReq(validBody), ctx());

    expect(res.status).toBe(500);
    expect(sendAdminMessageEmailMock).not.toHaveBeenCalled();
  });

  it('returns 500 on lookup or cap-check errors', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ target: { data: null, error: { message: 'boom' } } }).client,
    );
    expect((await POST(postReq(validBody), ctx())).status).toBe(500);

    createSupabaseAdminClientMock.mockReturnValue(
      makeAdminMock({ recipientCount: { count: null, error: { message: 'boom' } } }).client,
    );
    expect((await POST(postReq(validBody), ctx())).status).toBe(500);
  });

  it('returns 400 when the user id is missing and 500 on unexpected errors', async () => {
    expect((await POST(postReq(validBody), ctx(''))).status).toBe(400);

    rateLimitMock.mockRejectedValue(new Error('redis down'));
    expect((await POST(postReq(validBody), ctx())).status).toBe(500);
  });
});
