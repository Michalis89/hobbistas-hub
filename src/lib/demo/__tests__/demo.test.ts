/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const DEMO_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_ID = '99999999-8888-7777-6666-555555555555';

/** Builds an unsigned JWT whose payload carries the given subject. */
function tokenFor(subject: string) {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString('base64url');
  return `header.${payload}.signature`;
}

function requestWith({
  method = 'POST',
  url = 'https://example.test/api/articles',
  token,
}: {
  method?: string;
  url?: string;
  token?: string;
} = {}) {
  return new Request(url, {
    method,
    headers: token ? { cookie: `sb-access-token=${token}` } : {},
  });
}

describe('demo account detection', () => {
  const originalDemoId = process.env.NEXT_PUBLIC_DEMO_USER_ID;

  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_DEMO_USER_ID = DEMO_ID;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_DEMO_USER_ID = originalDemoId;
  });

  it('reads the subject out of an access token', async () => {
    const { readUserIdFromAccessToken } = await import('@/lib/demo');
    expect(readUserIdFromAccessToken(tokenFor(DEMO_ID))).toBe(DEMO_ID);
  });

  it('returns null for a token it cannot parse', async () => {
    const { readUserIdFromAccessToken } = await import('@/lib/demo');
    expect(readUserIdFromAccessToken('not-a-jwt')).toBeNull();
    expect(readUserIdFromAccessToken(undefined)).toBeNull();
  });

  it('blocks a mutating request carrying the demo session', async () => {
    const { isDemoWriteBlocked } = await import('@/lib/demo');
    expect(isDemoWriteBlocked(requestWith({ token: tokenFor(DEMO_ID) }))).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s from the demo session', async method => {
    const { isDemoWriteBlocked } = await import('@/lib/demo');
    expect(isDemoWriteBlocked(requestWith({ method, token: tokenFor(DEMO_ID) }))).toBe(false);
  });

  it('leaves other signed-in users alone', async () => {
    const { isDemoWriteBlocked } = await import('@/lib/demo');
    expect(isDemoWriteBlocked(requestWith({ token: tokenFor(OTHER_ID) }))).toBe(false);
  });

  it('leaves anonymous requests alone', async () => {
    const { isDemoWriteBlocked } = await import('@/lib/demo');
    expect(isDemoWriteBlocked(requestWith())).toBe(false);
  });

  it.each(['/api/auth/demo-login', '/api/auth/logout', '/api/auth/refresh'])(
    'allows the demo session to POST to %s',
    async pathname => {
      const { isDemoWriteBlocked } = await import('@/lib/demo');
      const request = requestWith({
        url: `https://example.test${pathname}`,
        token: tokenFor(DEMO_ID),
      });
      expect(isDemoWriteBlocked(request)).toBe(false);
    },
  );

  it('does nothing when no demo account is configured', async () => {
    delete process.env.NEXT_PUBLIC_DEMO_USER_ID;
    jest.resetModules();
    const { isDemoWriteBlocked, isDemoEnabled } = await import('@/lib/demo');
    expect(isDemoEnabled()).toBe(false);
    expect(isDemoWriteBlocked(requestWith({ token: tokenFor(DEMO_ID) }))).toBe(false);
  });

  it('matches ids only against the configured demo account', async () => {
    const { isDemoUserId } = await import('@/lib/demo');
    expect(isDemoUserId(DEMO_ID)).toBe(true);
    expect(isDemoUserId(OTHER_ID)).toBe(false);
    expect(isDemoUserId(null)).toBe(false);
  });
});
