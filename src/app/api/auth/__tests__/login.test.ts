/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const validateEmailMock = jest.fn();
const validatePasswordMock = jest.fn();
const rateLimitMock = jest.fn();
const getClientIpMock = jest.fn();
const rateLimitHeadersMock = jest.fn();
const verifyCaptchaTokenMock = jest.fn();
const setAuthCookiesMock = jest.fn();

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  __esModule: true,
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));

jest.mock('@/utils/validation/auth', () => ({
  __esModule: true,
  validateEmail: (...args: unknown[]) => validateEmailMock(...args),
  validatePassword: (...args: unknown[]) => validatePasswordMock(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  __esModule: true,
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: (...args: unknown[]) => getClientIpMock(...args),
  rateLimitHeaders: (...args: unknown[]) => rateLimitHeadersMock(...args),
}));

jest.mock('@/lib/captcha/turnstile', () => ({
  __esModule: true,
  verifyCaptchaToken: (...args: unknown[]) => verifyCaptchaTokenMock(...args),
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  setAuthCookies: (...args: unknown[]) => setAuthCookiesMock(...args),
}));

jest.mock('@/lib/api/response', () => ({
  __esModule: true,
  fail: jest.fn((body: unknown, status: number, init?: ResponseInit) => ({
    status,
    init,
    json: async () => body,
  })),
  ok: jest.fn((body: unknown, init?: ResponseInit) => ({
    status: 200,
    init,
    json: async () => ({ data: body }),
  })),
}));

import { POST } from '@/app/api/auth/login/route';
import { API_ERRORS } from '@/lib/api/errors';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function createLoginClient(opts?: {
  usernameData?: unknown;
  usernameError?: unknown;
  authData?: unknown;
  authError?: unknown;
}) {
  const hasUsernameData = !!opts && Object.prototype.hasOwnProperty.call(opts, 'usernameData');
  const usernameData = hasUsernameData
    ? opts?.usernameData
    : { email: 'user@example.com', account_status: 'active' };

  const usernameMaybeSingle = jest.fn().mockResolvedValue({
    data: usernameData,
    error: opts?.usernameError ?? null,
  });
  const usernameEq = jest.fn().mockReturnValue({ maybeSingle: usernameMaybeSingle });
  const usernameSelect = jest.fn().mockReturnValue({ eq: usernameEq });

  return {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data:
          opts?.authData ??
          ({
            user: {
              id: 'user-12345678',
              email: 'user@example.com',
              user_metadata: {},
            },
            session: {
              access_token: 'access-1',
              refresh_token: 'refresh-1',
            },
          } as const),
        error: opts?.authError ?? null,
      }),
    },
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return { select: usernameSelect };
      }
      return {};
    }),
  };
}

function createAuthedClient(opts?: {
  profileData?: unknown;
  profileError?: unknown;
  upsertData?: unknown;
  upsertError?: unknown;
  categoryData?: { profiles?: Record<string, unknown> | null } | null;
  categoryProfiles?: Record<string, unknown> | null;
}) {
  const hasProfileData = !!opts && Object.prototype.hasOwnProperty.call(opts, 'profileData');
  const hasCategoryProfiles =
    !!opts && Object.prototype.hasOwnProperty.call(opts, 'categoryProfiles');
  const hasCategoryData = !!opts && Object.prototype.hasOwnProperty.call(opts, 'categoryData');

  const profileMaybeSingle = jest.fn().mockResolvedValue({
    data: hasProfileData ? opts?.profileData : { id: 'user-12345678', account_status: 'active' },
    error: opts?.profileError ?? null,
  });
  const profileEq = jest.fn().mockReturnValue({ maybeSingle: profileMaybeSingle });
  const profileSelect = jest.fn().mockReturnValue({ eq: profileEq });

  const upsertSingle = jest.fn().mockResolvedValue({
    data: opts?.upsertData ?? {
      id: 'user-12345678',
      account_status: 'active',
      username: 'user_123456',
    },
    error: opts?.upsertError ?? null,
  });
  const upsertSelect = jest.fn().mockReturnValue({ single: upsertSingle });
  const upsert = jest.fn().mockReturnValue({ select: upsertSelect });

  const categoryMaybeSingle = jest.fn().mockResolvedValue({
    data: hasCategoryData
      ? opts?.categoryData
      : { profiles: hasCategoryProfiles ? opts?.categoryProfiles : {} },
    error: null,
  });
  const categoryEq = jest.fn().mockReturnValue({ maybeSingle: categoryMaybeSingle });
  const categorySelect = jest.fn().mockReturnValue({ eq: categoryEq });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'users') {
      return {
        select: profileSelect,
        upsert,
      };
    }
    if (table === 'user_category_profiles') {
      return {
        select: categorySelect,
      };
    }
    return {};
  });

  return {
    from,
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    spies: { upsert, upsertSelect, upsertSingle },
  };
}

describe('app/api/auth/login/route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createRouteHandlerClientMock.mockReset();
    validateEmailMock.mockReset();
    validatePasswordMock.mockReset();
    rateLimitMock.mockReset();
    getClientIpMock.mockReset();
    rateLimitHeadersMock.mockReset();
    verifyCaptchaTokenMock.mockReset();
    setAuthCookiesMock.mockReset();

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    getClientIpMock.mockReturnValue('127.0.0.1');
    rateLimitMock.mockResolvedValue({ success: true });
    rateLimitHeadersMock.mockReturnValue({ 'x-ratelimit-remaining': '0' });
    verifyCaptchaTokenMock.mockResolvedValue({ success: true });
    validatePasswordMock.mockReturnValue({ isValid: true });
    validateEmailMock.mockReturnValue({ isValid: true });
    setAuthCookiesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 429 when login rate-limit fails', async () => {
    rateLimitMock.mockResolvedValueOnce({ success: false, remaining: 0, reset: 1, limit: 10 });

    const res = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: 'Too many login attempts. Please try again later.',
    });
  });

  it('returns 403 when captcha verification fails', async () => {
    verifyCaptchaTokenMock.mockResolvedValueOnce({ success: false, errors: ['bad-token'] });

    const res = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'CAPTCHA validation failed, please retry' });
  });

  it('returns 400 when identifier is missing', async () => {
    const res = await POST(makeRequest({ identifier: '   ', password: 'secret' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Email or username is required' });
  });

  it('returns 400 when password validation fails', async () => {
    validatePasswordMock.mockReturnValueOnce({ isValid: false, error: 'Too short' });
    const res = await POST(makeRequest({ identifier: 'user@example.com', password: '' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Too short' });
  });

  it('returns default invalid password error when validator has no error message', async () => {
    validatePasswordMock.mockReturnValueOnce({ isValid: false });
    const res = await POST(makeRequest({ identifier: 'user@example.com', password: '' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid password' });
  });

  it('returns 400 when email identifier is invalid', async () => {
    validateEmailMock.mockReturnValueOnce({ isValid: false, error: 'Invalid email format' });
    const res = await POST(makeRequest({ identifier: '@', password: 'secret' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid email format' });
  });

  it('returns default invalid email message when email validator has no error text', async () => {
    validateEmailMock.mockReturnValueOnce({ isValid: false });
    const res = await POST(makeRequest({ identifier: 'bad@', password: 'secret' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid email' });
  });

  it('returns 500 when username lookup errors', async () => {
    const loginClient = createLoginClient({ usernameError: { message: 'db error' } });
    createRouteHandlerClientMock.mockResolvedValueOnce(loginClient);

    const res = await POST(makeRequest({ identifier: 'username-only', password: 'secret' }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Login error' });
  });

  it('returns 401 for unknown username', async () => {
    const loginClient = createLoginClient({ usernameData: null });
    createRouteHandlerClientMock.mockResolvedValueOnce(loginClient);

    const res = await POST(makeRequest({ identifier: 'missing-user', password: 'secret' }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Wrong username or password' });
  });

  it('blocks deleted, suspended and banned account statuses from username lookup', async () => {
    const deleted = createLoginClient({
      usernameData: { email: 'a@b.c', account_status: 'deleted' },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(deleted);
    const r1 = await POST(makeRequest({ identifier: 'deleted-user', password: 'secret' }));
    expect(r1.status).toBe(403);
    await expect(r1.json()).resolves.toEqual({ error: 'This account has been deleted' });

    const suspended = createLoginClient({
      usernameData: { email: 'a@b.c', account_status: 'suspended' },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(suspended);
    const r2 = await POST(makeRequest({ identifier: 'suspended-user', password: 'secret' }));
    expect(r2.status).toBe(403);
    await expect(r2.json()).resolves.toEqual({
      error: 'Your account is suspended. Contact support.',
    });

    const banned = createLoginClient({
      usernameData: { email: 'a@b.c', account_status: 'banned' },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(banned);
    const r3 = await POST(makeRequest({ identifier: 'banned-user', password: 'secret' }));
    expect(r3.status).toBe(403);
    await expect(r3.json()).resolves.toEqual({ error: 'Your account has been banned.' });
  });

  it('returns proper auth error responses', async () => {
    const emailNotConfirmed = createLoginClient({ authError: { message: 'Email not confirmed' } });
    createRouteHandlerClientMock.mockResolvedValueOnce(emailNotConfirmed);
    const r1 = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));
    expect(r1.status).toBe(401);

    const wrongCredentials = createLoginClient({
      authError: { message: 'Invalid login credentials' },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(wrongCredentials);
    const r2 = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));
    expect(r2.status).toBe(401);
    await expect(r2.json()).resolves.toEqual({ error: 'Wrong email or password' });
  });

  it('returns 500 when auth succeeds without user', async () => {
    const loginClient = createLoginClient({
      authData: { user: null, session: { access_token: 'a', refresh_token: 'r' } },
    });
    createRouteHandlerClientMock.mockResolvedValueOnce(loginClient);

    const res = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Login failed' });
  });

  it('returns 500 when profile fetch fails with non-PGRST116 code', async () => {
    const loginClient = createLoginClient();
    const authedClient = createAuthedClient({
      profileData: null,
      profileError: { code: 'XX000', message: 'bad' },
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient)
      .mockResolvedValueOnce(authedClient);

    const res = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Profile loading failed' });
  });

  it('returns 500 when profile initialization upsert fails', async () => {
    const loginClient = createLoginClient({
      authData: {
        user: { id: 'id-abcdef12', email: 'a+@example.com', user_metadata: {} },
        session: { access_token: 'access-1', refresh_token: 'refresh-1' },
      },
    });
    const authedClient = createAuthedClient({
      profileData: null,
      profileError: { code: 'PGRST116' },
      upsertError: { message: 'upsert fail' },
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient)
      .mockResolvedValueOnce(authedClient);

    const res = await POST(makeRequest({ identifier: 'a+@example.com', password: 'secret' }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Failed to initialize account profile' });
  });

  it('blocks suspended and banned statuses from resolved profile', async () => {
    const loginClient1 = createLoginClient();
    const authedClient1 = createAuthedClient({
      profileData: { id: 'u1', account_status: 'suspended' },
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient1)
      .mockResolvedValueOnce(authedClient1);
    const r1 = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));
    expect(r1.status).toBe(403);
    await expect(r1.json()).resolves.toEqual({
      error: 'Your account is suspended. Contact support.',
    });

    const loginClient2 = createLoginClient();
    const authedClient2 = createAuthedClient({
      profileData: { id: 'u1', account_status: 'banned' },
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient2)
      .mockResolvedValueOnce(authedClient2);
    const r2 = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));
    expect(r2.status).toBe(403);
    await expect(r2.json()).resolves.toEqual({ error: 'Your account has been banned.' });
  });

  it('returns success, sets cookies, and redirects to dashboard when category data exists', async () => {
    const loginClient = createLoginClient();
    const authedClient = createAuthedClient({
      profileData: { id: 'user-12345678', account_status: 'active', username: 'john' },
      categoryProfiles: { games: { score: 1 } },
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient)
      .mockResolvedValueOnce(authedClient);

    const res = await POST(
      makeRequest({
        identifier: 'user@example.com',
        password: 'secret',
        captchaToken: 'ok',
        remember: true,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe('Login successful!');
    expect(body.data.redirectUrl).toBe('/dashboard');
    expect(setAuthCookiesMock).toHaveBeenCalledWith('access-1', 'refresh-1', true);
    expect(authedClient.rpc).toHaveBeenCalledWith('update_user_last_login', {
      user_id: 'user-12345678',
    });
  });

  it('logs in via username identifier (covers username -> email path)', async () => {
    const loginClient = createLoginClient({
      usernameData: { email: 'resolved@example.com', account_status: 'active' },
      authData: {
        user: { id: 'user-12345678', email: 'resolved@example.com', user_metadata: {} },
        session: { access_token: 'access-2', refresh_token: 'refresh-2' },
      },
    });
    const authedClient = createAuthedClient({
      profileData: { id: 'user-12345678', account_status: 'active', username: 'resolved_user' },
      categoryProfiles: { anime: {} },
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient)
      .mockResolvedValueOnce(authedClient);

    const res = await POST(makeRequest({ identifier: 'resolved_user', password: 'secret' }));
    expect(res.status).toBe(200);
    expect(loginClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'resolved@example.com',
      password: 'secret',
    });
  });

  it('creates fallback profile and redirects to onboarding when no category data', async () => {
    const loginClient = createLoginClient({
      authData: {
        user: { id: 'id-1234567890', email: '++@example.com', user_metadata: {} },
        session: null,
      },
    });
    const authedClient = createAuthedClient({
      profileData: null,
      profileError: { code: 'PGRST116' },
      upsertData: { id: 'id-1234567890', account_status: 'active', username: 'user_id-123' },
      categoryProfiles: {},
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient)
      .mockResolvedValueOnce(authedClient);

    const res = await POST(makeRequest({ identifier: '++@example.com', password: 'secret' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.redirectUrl).toBe('/onboarding');
    expect(setAuthCookiesMock).not.toHaveBeenCalled();
    expect(authedClient.spies.upsert).toHaveBeenCalled();
    const upsertArg = authedClient.spies.upsert.mock.calls[0]?.[0];
    expect(upsertArg.username.startsWith('user_')).toBe(true);
  });

  it('initializes profile using identifier email when auth user email is missing', async () => {
    const loginClient = createLoginClient({
      authData: {
        user: {
          id: 'id-abcdef12345',
          email: null,
          user_metadata: { full_name: 'John Doe' },
        },
        session: { access_token: 'access-3', refresh_token: 'refresh-3' },
      },
    });
    const authedClient = createAuthedClient({
      profileData: null,
      profileError: { code: 'PGRST116' },
      upsertData: { id: 'id-abcdef12345', account_status: 'active', username: 'johndoe_id-abc' },
      categoryProfiles: {},
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient)
      .mockResolvedValueOnce(authedClient);

    const res = await POST(
      makeRequest({ identifier: 'John.Doe+1@example.com', password: 'secret' }),
    );
    expect(res.status).toBe(200);
    const upsertArg = authedClient.spies.upsert.mock.calls[0]?.[0];
    expect(upsertArg.email).toBe('John.Doe+1@example.com');
    expect(upsertArg.username.startsWith('johndoe1_')).toBe(true);
    expect(upsertArg.display_name).toBe('John Doe');
    expect(upsertArg.full_name).toBe('John Doe');
  });

  it('redirects to onboarding when category profile row is missing', async () => {
    const loginClient = createLoginClient();
    const authedClient = createAuthedClient({
      profileData: { id: 'user-12345678', account_status: 'active', username: 'john' },
      categoryData: null,
    });
    createRouteHandlerClientMock
      .mockResolvedValueOnce(loginClient)
      .mockResolvedValueOnce(authedClient);

    const res = await POST(makeRequest({ identifier: 'user@example.com', password: 'secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.redirectUrl).toBe('/onboarding');
  });

  it('returns internal error when request parsing throws', async () => {
    const res = await POST(makeRequest('{'));
    expect(res.status).toBe(API_ERRORS.INTERNAL.status);
    await expect(res.json()).resolves.toEqual(API_ERRORS.INTERNAL);
  });
});
