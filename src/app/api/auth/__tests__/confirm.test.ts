/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const createSupabaseAdminClientMock = jest.fn();
const resolveSiteUrlMock = jest.fn();
const setAuthCookiesOnResponseMock = jest.fn();
const verifyOtpMock = jest.fn();
const usersUpdateMock = jest.fn();
const categoryMaybeSingleMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: string) => ({ status: 307, url, cookies: { set: jest.fn() } }),
  },
}));

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClientMock(...args),
}));

jest.mock('@/lib/auth', () => ({
  setAuthCookiesOnResponse: (...args: unknown[]) => setAuthCookiesOnResponseMock(...args),
}));

jest.mock('@/lib/auth/site-url', () => ({
  resolveSiteUrl: (...args: unknown[]) => resolveSiteUrlMock(...args),
}));

import { GET } from '@/app/api/auth/confirm/route';

function makeAdminClient() {
  return {
    from: jest.fn((table: string) => {
      if (table === 'users') {
        return { update: (...args: unknown[]) => usersUpdateMock(...args) };
      }
      const chain = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        maybeSingle: categoryMaybeSingleMock,
      };
      return chain;
    }),
  };
}

function makeRequest(query: string) {
  return new Request(`http://localhost/api/auth/confirm${query}`);
}

describe('app/api/auth/confirm/route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveSiteUrlMock.mockReturnValue('https://example.com');
    verifyOtpMock.mockResolvedValue({
      data: {
        session: { access_token: 'access-token', refresh_token: 'refresh-token' },
        user: { id: 'user-1' },
      },
      error: null,
    });
    createRouteHandlerClientMock.mockResolvedValue({
      auth: { verifyOtp: (...args: unknown[]) => verifyOtpMock(...args) },
    });
    usersUpdateMock.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    categoryMaybeSingleMock.mockResolvedValue({ data: null });
    createSupabaseAdminClientMock.mockReturnValue(makeAdminClient());
    setAuthCookiesOnResponseMock.mockImplementation((response: unknown) => response);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs the user in, marks the address verified, and sends them to onboarding', async () => {
    const res = (await GET(makeRequest('?token_hash=abc&type=magiclink'))) as unknown as {
      url: string;
    };

    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'abc', type: 'magiclink' });
    expect(usersUpdateMock).toHaveBeenCalledWith({ email_verified: true });
    // Cookies go on the redirect response itself; next/headers writes are not
    // reliably merged into a manually constructed NextResponse.
    expect(setAuthCookiesOnResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      'access-token',
      'refresh-token',
      true,
    );
    expect(res.url).toBe('https://example.com/onboarding?verified=1');
  });

  it('sends a user who already has categories to the dashboard', async () => {
    categoryMaybeSingleMock.mockResolvedValueOnce({ data: { profiles: { games: {} } } });

    const res = (await GET(makeRequest('?token_hash=abc'))) as unknown as { url: string };
    expect(res.url).toBe('https://example.com/dashboard?verified=1');
  });

  it('redirects to the error screen without a token', async () => {
    const res = (await GET(makeRequest(''))) as unknown as { url: string };

    expect(res.url).toBe('https://example.com/auth/confirm-email?state=error');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('redirects to the error screen when the token is expired', async () => {
    verifyOtpMock.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Token has expired' },
    });

    const res = (await GET(makeRequest('?token_hash=stale'))) as unknown as { url: string };
    expect(res.url).toBe('https://example.com/auth/confirm-email?state=error');
    expect(setAuthCookiesOnResponseMock).not.toHaveBeenCalled();
  });

  it('ignores an off-site next parameter', async () => {
    const res = (await GET(
      makeRequest('?token_hash=abc&next=https://evil.example/steal'),
    )) as unknown as { url: string };

    expect(res.url).toBe('https://example.com/onboarding?verified=1');
  });

  it('ignores a protocol-relative next parameter', async () => {
    const res = (await GET(makeRequest('?token_hash=abc&next=//evil.example'))) as unknown as {
      url: string;
    };

    expect(res.url).toBe('https://example.com/onboarding?verified=1');
  });
});
