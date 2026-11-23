/**
 * @jest-environment jsdom
 */

const mockFetch = jest.fn();
const mockIsAuthPersistenceEnabled = jest.fn(() => true);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: () => null,
}));

jest.mock('@/store/slices/authSlice', () => ({
  fetchSession: jest.fn(),
  setUser: jest.fn(),
  logout: jest.fn(),
  selectUser: jest.fn(),
}));

jest.mock('@/store/store', () => ({}));

jest.mock('@/lib/supabase-client', () => ({
  isAuthPersistenceEnabled: () => mockIsAuthPersistenceEnabled(),
  supabase: {
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
      setSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('@/lib/routes/authRoutes', () => ({
  getLoginUrl: jest.fn(),
  shouldRedirectToLogin: jest.fn(() => false),
}));

describe('AuthInit syncCookies re-export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  // The behaviour itself is covered in src/lib/auth/__tests__/syncCookies.test.ts.
  it('is the shared latest-tokens-win implementation', async () => {
    const fromAuthInit = (await import('@/app/components/AuthInit')).syncCookies;
    const fromLib = (await import('@/lib/auth/syncCookies')).syncCookies;
    expect(fromAuthInit).toBe(fromLib);
  });

  it('writes newer tokens that arrive during an in-flight sync instead of dropping them', async () => {
    let release: (value: { ok: boolean; status: number }) => void = () => {};
    mockFetch
      .mockReturnValueOnce(new Promise(resolve => (release = resolve)))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const { syncCookies } = await import('@/app/components/AuthInit');
    const first = syncCookies({
      access_token: 'token-a',
      refresh_token: 'refresh-a',
      expires_in: 3600,
    });
    const second = syncCookies({
      access_token: 'token-b',
      refresh_token: 'refresh-b',
      expires_in: 3600,
    });
    release({ ok: true, status: 200 });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).access_token).toBe('token-b');
  });
});
