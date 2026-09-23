/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const mockSignInWithPassword = jest.fn();
const mockRateLimit = jest.fn();
const mockGetClientIp = jest.fn();
const mockRateLimitHeaders = jest.fn();
const mockSetAuthCookies = jest.fn();
const mockAccountStatus = jest.fn();

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

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: async () => ({
    auth: { signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => mockAccountStatus() }),
      }),
    }),
  }),
}));

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
  rateLimitHeaders: (...args: unknown[]) => mockRateLimitHeaders(...args),
}));

jest.mock('@/lib/auth', () => ({
  setAuthCookies: (...args: unknown[]) => mockSetAuthCookies(...args),
}));

const DEMO_ID = '11111111-2222-3333-4444-555555555555';

function makeRequest() {
  return new Request('https://example.test/api/auth/demo-login', { method: 'POST' });
}

async function loadRoute() {
  const route = await import('@/app/api/auth/demo-login/route');
  return route.POST as unknown as (request: Request) => Promise<{
    status: number;
    json: () => Promise<Record<string, unknown>>;
  }>;
}

describe('POST /api/auth/demo-login', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    process.env.NEXT_PUBLIC_DEMO_USER_ID = DEMO_ID;
    process.env.DEMO_USER_EMAIL = 'demo@example.test';
    process.env.DEMO_USER_PASSWORD = 'demo-password';

    mockGetClientIp.mockReturnValue('203.0.113.4');
    mockRateLimit.mockResolvedValue({ success: true });
    mockRateLimitHeaders.mockReturnValue({});
    mockAccountStatus.mockResolvedValue({ data: { account_status: 'active' }, error: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('signs in and sets a session that does not outlive the browser', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: DEMO_ID, email: 'demo@example.test' },
        session: { access_token: 'access', refresh_token: 'refresh' },
      },
      error: null,
    });

    const POST = await loadRoute();
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { redirectTo: '/dashboard', user: { id: DEMO_ID } },
    });
    // `false` is the "remember me" flag: a shared account must not persist.
    expect(mockSetAuthCookies).toHaveBeenCalledWith('access', 'refresh', false);
  });

  it('is invisible when no demo account is configured', async () => {
    delete process.env.NEXT_PUBLIC_DEMO_USER_ID;

    const POST = await loadRoute();
    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('reports a misconfiguration when the credentials are missing', async () => {
    delete process.env.DEMO_USER_PASSWORD;

    const POST = await loadRoute();
    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('rate limits by IP so this cannot mint sessions freely', async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    const POST = await loadRoute();
    const response = await POST(makeRequest());

    expect(response.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith('loginIp', '203.0.113.4');
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('refuses when the demo account has been suspended', async () => {
    // Suspending the account is how an admin turns the demo off.
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: DEMO_ID, email: 'demo@example.test' },
        session: { access_token: 'access', refresh_token: 'refresh' },
      },
      error: null,
    });
    mockAccountStatus.mockResolvedValue({
      data: { account_status: 'suspended' },
      error: null,
    });

    const POST = await loadRoute();
    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
  });

  it('does not leak the reason when the demo account cannot sign in', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    const POST = await loadRoute();
    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Demo account is unavailable right now.',
    });
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
  });
});
