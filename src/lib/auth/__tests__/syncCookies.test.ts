/**
 * @jest-environment jsdom
 */
jest.mock('@/lib/supabase-client', () => ({
  isAuthPersistenceEnabled: () => true,
}));

type Deferred = { resolve: (value: { ok: boolean; status: number }) => void };

describe('syncCookies (latest tokens win)', () => {
  let fetchMock: jest.Mock;
  let pending: Deferred[];
  let syncCookies: typeof import('@/lib/auth/syncCookies').syncCookies;

  const session = (name: string) => ({
    access_token: `access-${name}`,
    refresh_token: `refresh-${name}`,
    expires_in: 3600,
  });
  const sentAccessTokens = () =>
    fetchMock.mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string).access_token,
    );
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(async () => {
    jest.resetModules();
    pending = [];
    fetchMock = jest.fn(
      () =>
        new Promise(resolve => {
          pending.push({ resolve });
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    ({ syncCookies } = await import('@/lib/auth/syncCookies'));
  });

  it('posts the tokens to /api/auth/refresh with the persistence flag', async () => {
    const result = syncCookies(session('a'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      access_token: 'access-a',
      refresh_token: 'refresh-a',
      expires_in: 3600,
      remember: true,
    });
    pending[0].resolve({ ok: true, status: 200 });
    await expect(result).resolves.toBe(true);
  });

  it('sends newer tokens that arrive during a request right after it, not never', async () => {
    const first = syncCookies(session('a'));
    const second = syncCookies(session('b'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending[0].resolve({ ok: true, status: 200 });
    await flush();
    // The regression: previously only "a" was ever written.
    expect(sentAccessTokens()).toEqual(['access-a', 'access-b']);

    pending[1].resolve({ ok: true, status: 200 });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('never sends tokens that were superseded while waiting', async () => {
    void syncCookies(session('a'));
    const b = syncCookies(session('b'));
    const c = syncCookies(session('c'));

    pending[0].resolve({ ok: true, status: 200 });
    await flush();
    expect(sentAccessTokens()).toEqual(['access-a', 'access-c']);

    pending[1].resolve({ ok: true, status: 200 });
    await expect(b).resolves.toBe(true);
    await expect(c).resolves.toBe(true);
  });

  it('sends one request at a time, so an older response cannot overwrite newer cookies', async () => {
    void syncCookies(session('a'));
    void syncCookies(session('b'));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a request for tokens that are already in flight', async () => {
    const first = syncCookies(session('a'));
    const again = syncCookies(session('a'));
    pending[0].resolve({ ok: true, status: 200 });
    await expect(first).resolves.toBe(true);
    await expect(again).resolves.toBe(true);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is idle again after finishing, so the next call sends immediately', async () => {
    const first = syncCookies(session('a'));
    pending[0].resolve({ ok: true, status: 200 });
    await first;
    void syncCookies(session('b'));
    expect(sentAccessTokens()).toEqual(['access-a', 'access-b']);
  });

  it('reports false on 401 and true on network failure', async () => {
    const rejected = syncCookies(session('a'));
    pending[0].resolve({ ok: false, status: 401 });
    await expect(rejected).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(syncCookies(session('b'))).resolves.toBe(true);
  });
});
