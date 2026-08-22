/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const rateLimitMock = jest.fn();
const getClientIpMock = jest.fn();
const rateLimitHeadersMock = jest.fn();
const verifyCaptchaTokenMock = jest.fn();
const createSupabaseAdminClientMock = jest.fn();
const sendConfirmEmailMock = jest.fn();
const resolveSiteUrlMock = jest.fn();
const validateEmailMock = jest.fn();
const validateUsernameMock = jest.fn();
const validatePasswordMock = jest.fn();
const validateFullNameMock = jest.fn();

const usersMaybeSingleMock = jest.fn();
const usersUpsertMock = jest.fn();
const userCategoryProfilesUpsertMock = jest.fn();
const createUserMock = jest.fn();
const deleteUserMock = jest.fn();
const generateLinkMock = jest.fn();
const createRouteHandlerClientMock = jest.fn();
const setAuthCookiesMock = jest.fn();
const sendVerificationEmailMock = jest.fn();
const signInWithPasswordMock = jest.fn();

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

jest.mock('@/lib/api/response', () => ({
  __esModule: true,
  ok: jest.fn((data: unknown, init?: ResponseInit) => ({
    status: (init as { status?: number } | undefined)?.status ?? 200,
    headers: new Headers((init as { headers?: HeadersInit } | undefined)?.headers),
    json: async () => ({ data }),
  })),
  fail: jest.fn((body: unknown, status: number, init?: ResponseInit) => ({
    status,
    headers: new Headers((init as { headers?: HeadersInit } | undefined)?.headers),
    json: async () => body,
  })),
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));

jest.mock('@/lib/auth', () => ({
  setAuthCookies: (...args: unknown[]) => setAuthCookiesMock(...args),
}));

jest.mock('@/lib/auth/verification', () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailMock(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: (...args: unknown[]) => getClientIpMock(...args),
  rateLimitHeaders: (...args: unknown[]) => rateLimitHeadersMock(...args),
}));

jest.mock('@/lib/captcha/turnstile', () => ({
  verifyCaptchaToken: (...args: unknown[]) => verifyCaptchaTokenMock(...args),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClientMock(...args),
}));

jest.mock('@/lib/email/send', () => ({
  sendConfirmEmail: (...args: unknown[]) => sendConfirmEmailMock(...args),
}));

jest.mock('@/lib/auth/site-url', () => ({
  resolveSiteUrl: (...args: unknown[]) => resolveSiteUrlMock(...args),
}));

jest.mock('@/utils/validation/auth', () => ({
  validateEmail: (...args: unknown[]) => validateEmailMock(...args),
  validateUsername: (...args: unknown[]) => validateUsernameMock(...args),
  validatePassword: (...args: unknown[]) => validatePasswordMock(...args),
  validateFullName: (...args: unknown[]) => validateFullNameMock(...args),
}));

import { POST } from '@/app/api/auth/signup/route';
import { API_ERRORS } from '@/lib/api/errors';
import {
  LEGAL_PATHS,
  PRIVACY_POLICY_VERSION,
  TERMS_OF_USE_VERSION,
} from '@/lib/legal/policyVersions';

function makeSupabaseAdminClient() {
  const usersSelect = jest.fn(() => {
    const chain = {
      eq: jest.fn(() => chain),
      neq: jest.fn(() => chain),
      maybeSingle: usersMaybeSingleMock,
    };
    return chain;
  });

  const from = jest.fn((table: string) => {
    if (table === 'users') {
      return {
        select: usersSelect,
        upsert: (...args: unknown[]) => usersUpsertMock(...args),
      };
    }
    if (table === 'user_category_profiles') {
      return {
        upsert: (...args: unknown[]) => userCategoryProfilesUpsertMock(...args),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUserMock(...args),
        deleteUser: (...args: unknown[]) => deleteUserMock(...args),
        generateLink: (...args: unknown[]) => generateLinkMock(...args),
      },
    },
  };
}

function makeUserUpsertChain(result: unknown) {
  return {
    select: jest.fn(() => ({
      single: jest.fn().mockResolvedValue(result),
    })),
  };
}

function makeRequest(overrides?: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'Password1!',
      username: 'user123',
      agree_to_terms: true,
      acceptedPolicies: {
        termsVersion: TERMS_OF_USE_VERSION,
        privacyVersion: PRIVACY_POLICY_VERSION,
        termsPath: LEGAL_PATHS.terms,
        privacyPath: LEGAL_PATHS.privacy,
        acceptedAt: new Date().toISOString(),
      },
      full_name: '  User Example  ',
      date_of_birth: '1990-01-01',
      country: 'GR',
      bio: 'Hello',
      captchaToken: 'captcha-token',
      ...overrides,
    }),
  });
}

describe('app/api/auth/signup/route', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();

    getClientIpMock.mockReturnValue('127.0.0.1');
    rateLimitMock.mockResolvedValue({ success: true });
    rateLimitHeadersMock.mockReturnValue({ 'x-ratelimit-remaining': '0' });
    verifyCaptchaTokenMock.mockResolvedValue({ success: true, errors: [] });
    resolveSiteUrlMock.mockReturnValue('https://example.com');
    createSupabaseAdminClientMock.mockReturnValue(makeSupabaseAdminClient());

    validateEmailMock.mockReturnValue({ isValid: true });
    validateUsernameMock.mockReturnValue({ isValid: true });
    validatePasswordMock.mockReturnValue({ isValid: true });
    validateFullNameMock.mockReturnValue({ isValid: true });

    usersMaybeSingleMock.mockResolvedValue({ data: null });
    usersUpsertMock.mockReturnValue(makeUserUpsertChain({ error: null }));
    userCategoryProfilesUpsertMock.mockResolvedValue({ error: null });
    createUserMock.mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    generateLinkMock.mockResolvedValue({
      data: { properties: { action_link: 'https://example.com/confirm' } },
      error: null,
    });
    sendConfirmEmailMock.mockResolvedValue(undefined);
    sendVerificationEmailMock.mockResolvedValue(true);
    setAuthCookiesMock.mockResolvedValue(undefined);
    signInWithPasswordMock.mockResolvedValue({
      data: {
        session: { access_token: 'access-token', refresh_token: 'refresh-token' },
      },
      error: null,
    });
    createRouteHandlerClientMock.mockResolvedValue({
      auth: { signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args) },
    });

    process.env.NODE_ENV = 'test';
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns 429 with rate-limit headers when throttled', async () => {
    rateLimitMock.mockResolvedValueOnce({ success: false, remaining: 0, reset: 1, limit: 3 });
    rateLimitHeadersMock.mockReturnValueOnce({ 'x-ratelimit-remaining': '0' });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
  });

  it('returns 400 when terms are not accepted', async () => {
    const res = await POST(makeRequest({ agree_to_terms: false }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'You must accept the terms of use and privacy policy.',
    });
  });

  it('returns 400 for invalid accepted policies payload', async () => {
    const res = await POST(
      makeRequest({
        acceptedPolicies: {
          termsVersion: 'wrong',
          privacyVersion: PRIVACY_POLICY_VERSION,
          termsPath: LEGAL_PATHS.terms,
          privacyPath: LEGAL_PATHS.privacy,
          acceptedAt: 'not-a-date',
        },
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Policy consent is invalid. Refresh and try again.',
    });
  });

  it('returns 400 when acceptedAt is not a string', async () => {
    const res = await POST(
      makeRequest({
        acceptedPolicies: {
          termsVersion: TERMS_OF_USE_VERSION,
          privacyVersion: PRIVACY_POLICY_VERSION,
          termsPath: LEGAL_PATHS.terms,
          privacyPath: LEGAL_PATHS.privacy,
          acceptedAt: 12345,
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when captcha fails', async () => {
    verifyCaptchaTokenMock.mockResolvedValueOnce({ success: false, errors: ['invalid'] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'CAPTCHA validation failed, please retry' });
  });

  it('returns validation failures with fallback messages', async () => {
    validateEmailMock.mockReturnValueOnce({ isValid: false, error: 'Invalid format' });
    const e1 = await POST(makeRequest());
    expect(e1.status).toBe(400);

    validateEmailMock.mockReturnValueOnce({ isValid: false });
    const e2 = await POST(makeRequest());
    await expect(e2.json()).resolves.toEqual({ error: 'Invalid email' });

    validateUsernameMock.mockReturnValueOnce({ isValid: false, error: 'Too short username' });
    const u1 = await POST(makeRequest());
    expect(u1.status).toBe(400);

    validateUsernameMock.mockReturnValueOnce({ isValid: false });
    const u2 = await POST(makeRequest());
    await expect(u2.json()).resolves.toEqual({ error: 'Invalid username' });

    validatePasswordMock.mockReturnValueOnce({ isValid: false, error: 'Weak password' });
    const p1 = await POST(makeRequest());
    expect(p1.status).toBe(400);

    validatePasswordMock.mockReturnValueOnce({ isValid: false });
    const p2 = await POST(makeRequest());
    await expect(p2.json()).resolves.toEqual({ error: 'Invalid password' });
  });

  it('validates full name when provided and skips validation when absent', async () => {
    validateFullNameMock.mockReturnValueOnce({ isValid: false, error: 'Bad name' });
    const bad = await POST(makeRequest({ full_name: '!!' }));
    expect(bad.status).toBe(400);

    const okNoName = await POST(makeRequest({ full_name: '' }));
    expect(okNoName.status).toBe(200);
  });

  it('uses default full-name validation message when validator returns no error', async () => {
    validateFullNameMock.mockReturnValueOnce({ isValid: false });
    const res = await POST(makeRequest({ full_name: '??' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid full name' });
  });

  it('returns 409 when email already exists', async () => {
    usersMaybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', account_status: 'active' } });

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'An account with this email already exists.',
    });
  });

  it('returns 409 when username already exists', async () => {
    usersMaybeSingleMock
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: { id: 'u2', account_status: 'active' } });

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'Username is already in use.' });
  });

  it('handles createUser auth errors and missing user', async () => {
    createUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'already registered' },
    });
    const conflict = await POST(makeRequest());
    expect(conflict.status).toBe(409);

    createUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'random error' },
    });
    const internal = await POST(makeRequest());
    expect(internal.status).toBe(API_ERRORS.INTERNAL.status);

    createUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const missingUser = await POST(makeRequest());
    expect(missingUser.status).toBe(API_ERRORS.INTERNAL.status);
  });

  it('returns 409 on profile upsert 23505 and logs rollback failure when delete fails', async () => {
    createUserMock.mockResolvedValueOnce({ data: { user: { id: 'auth-user-2' } }, error: null });
    usersUpsertMock.mockReturnValueOnce(
      makeUserUpsertChain({
        error: { code: '23505', message: 'duplicate key' },
      }),
    );
    deleteUserMock.mockRejectedValueOnce(new Error('rollback failed'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(console.error).toHaveBeenCalledWith(
      'Signup rollback failed - orphaned auth user:',
      'auth-user-2',
      expect.any(Error),
    );
  });

  it('returns internal error for non-unique profile upsert failures', async () => {
    usersUpsertMock.mockReturnValueOnce(
      makeUserUpsertChain({
        error: { code: 'XX000', message: 'db failed' },
      }),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(API_ERRORS.INTERNAL.status);
    expect(console.error).toHaveBeenCalledWith('Profile upsert error:', {
      code: 'XX000',
      message: 'db failed',
    });
  });

  it('continues signup when category profile upsert fails', async () => {
    userCategoryProfilesUpsertMock.mockResolvedValueOnce({ error: { message: 'category failed' } });

    const res = await POST(makeRequest({ steam_id: 'steam_123' }));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith('Category profile upsert error:', {
      message: 'category failed',
    });
  });

  it('still succeeds when the verification email cannot be sent', async () => {
    // The account exists by this point; failing the request would tell the user
    // their sign-up did not work when in fact it did.
    sendVerificationEmailMock.mockResolvedValueOnce(false);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.verificationEmailSent).toBe(false);
    expect(body.data.session).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
  });

  it('falls back to the login screen when auto sign-in fails', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'sign-in unavailable' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.session).toBeNull();
    expect(body.data.redirectUrl).toBe('/auth/login');
    expect(setAuthCookiesMock).not.toHaveBeenCalled();
  });

  it('returns development catch message with step details', async () => {
    process.env.NODE_ENV = 'development';
    verifyCaptchaTokenMock.mockRejectedValueOnce(new Error('captcha down'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Signup failed at step "verify_captcha": captcha down',
    });
  });

  it('returns standardized internal error in production catch', async () => {
    process.env.NODE_ENV = 'production';
    verifyCaptchaTokenMock.mockRejectedValueOnce(new Error('captcha down'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(API_ERRORS.INTERNAL.status);
    await expect(res.json()).resolves.toEqual(API_ERRORS.INTERNAL);
  });

  it('signs the new account in and sends it to onboarding on the happy path', async () => {
    createUserMock.mockResolvedValueOnce({ data: { user: { id: 'auth-user-3' } }, error: null });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual(
      expect.objectContaining({
        ok: true,
        redirectUrl: '/onboarding',
        verificationEmailSent: true,
        session: { access_token: 'access-token', refresh_token: 'refresh-token' },
      }),
    );

    // Confirmed at the Supabase level so the session can be issued right away;
    // address ownership is tracked by users.email_verified instead.
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        email_confirm: true,
      }),
    );
    expect(usersUpsertMock.mock.calls[0]?.[0].email_verified).toBe(false);

    expect(sendVerificationEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      'user@example.com',
      'https://example.com',
    );
    expect(setAuthCookiesMock).toHaveBeenCalledWith('access-token', 'refresh-token', true);
  });

  it('upserts nullable profile fields as null when optional values are empty', async () => {
    const res = await POST(
      makeRequest({
        date_of_birth: '',
        country: '',
        bio: '',
      }),
    );
    expect(res.status).toBe(200);

    const upsertPayload = usersUpsertMock.mock.calls[0]?.[0];
    expect(upsertPayload.date_of_birth).toBeNull();
    expect(upsertPayload.country).toBeNull();
    expect(upsertPayload.bio).toBeNull();
  });

  it('returns development catch message with Unknown signup error for non-Error throws', async () => {
    process.env.NODE_ENV = 'development';
    verifyCaptchaTokenMock.mockRejectedValueOnce('boom-string');

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Signup failed at step "verify_captcha": Unknown signup error',
    });
  });
});
