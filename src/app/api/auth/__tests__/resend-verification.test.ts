/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const rateLimitMock = jest.fn();
const getClientIpMock = jest.fn();
const rateLimitHeadersMock = jest.fn();
const createSupabaseAdminClientMock = jest.fn();
const resolveSiteUrlMock = jest.fn();
const sendVerificationEmailMock = jest.fn();
const validateEmailMock = jest.fn();
const usersMaybeSingleMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: (...args: unknown[]) => getClientIpMock(...args),
  rateLimitHeaders: (...args: unknown[]) => rateLimitHeadersMock(...args),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClientMock(...args),
}));

jest.mock('@/lib/auth/site-url', () => ({
  resolveSiteUrl: (...args: unknown[]) => resolveSiteUrlMock(...args),
}));

jest.mock('@/lib/auth/verification', () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailMock(...args),
}));

jest.mock('@/utils/validation/auth', () => ({
  validateEmail: (...args: unknown[]) => validateEmailMock(...args),
}));

import { POST } from '@/app/api/auth/resend-verification/route';

function makeAdminClient() {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    maybeSingle: usersMaybeSingleMock,
  };
  return { from: jest.fn(() => chain) };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('app/api/auth/resend-verification/route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getClientIpMock.mockReturnValue('127.0.0.1');
    rateLimitMock.mockResolvedValue({ success: true });
    rateLimitHeadersMock.mockReturnValue({ 'x-ratelimit-remaining': '0' });
    resolveSiteUrlMock.mockReturnValue('https://example.com');
    validateEmailMock.mockReturnValue({ isValid: true });
    createSupabaseAdminClientMock.mockReturnValue(makeAdminClient());
    usersMaybeSingleMock.mockResolvedValue({ data: { id: 'u1', email_verified: false } });
    sendVerificationEmailMock.mockResolvedValue(true);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a fresh link for an unverified account', async () => {
    const res = await POST(makeRequest({ email: 'User@Example.com ' }));

    expect(res.status).toBe(200);
    // Address is normalized before lookup and sending.
    expect(sendVerificationEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      'user@example.com',
      'https://example.com',
    );
  });

  it('returns the same response for unknown and already-verified addresses', async () => {
    usersMaybeSingleMock.mockResolvedValueOnce({ data: null });
    const unknown = await POST(makeRequest({ email: 'nobody@example.com' }));

    usersMaybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email_verified: true } });
    const verified = await POST(makeRequest({ email: 'user@example.com' }));

    // Identical output is what stops this endpoint being an account-enumeration oracle.
    expect(unknown.status).toBe(verified.status);
    await expect(unknown.json()).resolves.toEqual(await verified.json());
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('throttles per IP and per address', async () => {
    rateLimitMock.mockResolvedValueOnce({ success: false, remaining: 0 });
    const byIp = await POST(makeRequest({ email: 'user@example.com' }));
    expect(byIp.status).toBe(429);

    rateLimitMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, remaining: 0 });
    const byEmail = await POST(makeRequest({ email: 'user@example.com' }));
    expect(byEmail.status).toBe(429);

    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed address', async () => {
    validateEmailMock.mockReturnValueOnce({ isValid: false, error: 'Invalid email format' });

    const res = await POST(makeRequest({ email: 'nope' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid email format' });
  });

  it('reports a delivery failure instead of claiming success', async () => {
    sendVerificationEmailMock.mockResolvedValueOnce(false);

    const res = await POST(makeRequest({ email: 'user@example.com' }));
    expect(res.status).toBe(502);
  });
});
