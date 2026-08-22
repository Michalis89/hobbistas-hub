/**
 * @jest-environment jsdom
 */

import { act, render, waitFor } from '@testing-library/react';
import AuthInit, { syncCookies } from '@/app/components/AuthInit';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSession, logout, setUser } from '@/store/slices/authSlice';
import { isAuthPersistenceEnabled, supabase } from '@/lib/supabase-client';
import { getLoginUrl, shouldRedirectToLogin } from '@/lib/routes/authRoutes';

const replaceMock = jest.fn();
const dispatchMock = jest.fn();
const unsubscribeMock = jest.fn();
const postMessageMock = jest.fn();

let currentUser: null | { id: string };
let authStateChangeHandler:
  | ((
      event: string,
      session: null | { access_token: string; refresh_token: string },
    ) => Promise<void>)
  | null = null;
let fetchSessionResult: { type: string; payload: unknown };

const fetchSessionMock = fetchSession as unknown as jest.Mock & {
  fulfilled: { match: jest.Mock };
};

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/store/slices/authSlice', () => {
  const mockedFetchSession = jest.fn(() => ({ type: 'auth/fetchSession' }));
  mockedFetchSession.fulfilled = {
    match: jest.fn((result: { type: string }) => result.type === 'auth/fetchSession/fulfilled'),
  };

  return {
    fetchSession: mockedFetchSession,
    setUser: jest.fn((user: unknown) => ({ type: 'auth/setUser', payload: user })),
    logout: jest.fn(() => ({ type: 'auth/logout' })),
    selectUser: jest.fn(),
  };
});

jest.mock('@/lib/supabase-client', () => ({
  isAuthPersistenceEnabled: jest.fn(),
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
  getLoginUrl: jest.fn((redirectTo?: string) =>
    redirectTo ? `/auth/login?redirect=${encodeURIComponent(redirectTo)}` : '/auth/login',
  ),
  shouldRedirectToLogin: jest.fn(),
}));

const useRouterMock = useRouter as jest.Mock;
const useDispatchMock = useDispatch as unknown as jest.Mock;
const useSelectorMock = useSelector as unknown as jest.Mock;
const isAuthPersistenceEnabledMock = isAuthPersistenceEnabled as jest.Mock;
const shouldRedirectToLoginMock = shouldRedirectToLogin as jest.Mock;
const getLoginUrlMock = getLoginUrl as jest.Mock;
const supabaseAuth = supabase.auth as unknown as {
  getSession: jest.Mock;
  getUser: jest.Mock;
  setSession: jest.Mock;
  onAuthStateChange: jest.Mock;
  signOut: jest.Mock;
};

function mockMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn(() => ({
      matches,
      media: '',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

function mockServiceWorker() {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage: postMessageMock },
      ready: Promise.resolve({
        active: { postMessage: postMessageMock },
        waiting: { postMessage: postMessageMock },
        installing: { postMessage: postMessageMock },
      }),
    },
  });
}

function mockLocation(path: string) {
  window.history.pushState({}, '', path);
}

describe('syncCookies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
    isAuthPersistenceEnabledMock.mockReturnValue(true);
  });

  it('returns false for expired cookie responses and true for network errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(
      syncCookies({ access_token: 'a', refresh_token: 'r', expires_in: 10 }),
    ).resolves.toBe(false);

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await expect(syncCookies({ access_token: 'a', refresh_token: 'r' })).resolves.toBe(true);
  });

  it('sends the persistence preference and default expiry', async () => {
    isAuthPersistenceEnabledMock.mockReturnValue(false);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

    await syncCookies({ access_token: 'a', refresh_token: 'r' });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: 'a',
        refresh_token: 'r',
        expires_in: 3600,
        remember: false,
      }),
    });
  });
});

describe('AuthInit', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
    delete (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = null;
    authStateChangeHandler = null;
    fetchSessionResult = { type: 'auth/fetchSession/fulfilled', payload: { id: 'user-1' } };
    global.fetch = jest.fn() as unknown as typeof fetch;
    mockMatchMedia(false);
    mockServiceWorker();
    mockLocation('/dashboard?tab=library');
    window.sessionStorage.clear();
    window.localStorage.clear();
    document.cookie = 'sb-access-token=token';
    document.cookie = 'sb-refresh-token=refresh';

    useRouterMock.mockReturnValue({ replace: replaceMock });
    useDispatchMock.mockReturnValue(dispatchMock);
    useSelectorMock.mockImplementation(() => currentUser);
    isAuthPersistenceEnabledMock.mockReturnValue(true);
    shouldRedirectToLoginMock.mockReturnValue(true);
    getLoginUrlMock.mockImplementation((redirectTo?: string) =>
      redirectTo ? `/auth/login?redirect=${encodeURIComponent(redirectTo)}` : '/auth/login',
    );
    dispatchMock.mockImplementation(async (action: { type: string }) => {
      if (action.type === 'auth/fetchSession') {
        return fetchSessionResult;
      }
      return action;
    });
    supabaseAuth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    });
    supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    supabaseAuth.setSession.mockResolvedValue({ data: {}, error: null });
    supabaseAuth.signOut.mockResolvedValue({ error: null });
    supabaseAuth.onAuthStateChange.mockImplementation(handler => {
      authStateChangeHandler = handler;
      return { data: { subscription: { unsubscribe: unsubscribeMock } } };
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: jest.fn() });
    fetchSessionMock.fulfilled.match.mockImplementation(
      (result: { type: string }) => result.type === 'auth/fetchSession/fulfilled',
    );
  });

  it('clears auth state, stores the return URL, and redirects when no session exists', async () => {
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: jest.fn() });

    const { unmount } = render(<AuthInit />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(logout());
    });
    expect(window.sessionStorage.getItem('hobbistas-hub-return-url')).toBe(
      '/dashboard?tab=library',
    );
    expect(dispatchMock).toHaveBeenCalledWith(setUser(null));
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'CLEAR_AUTH_CACHE' });
    expect(replaceMock).toHaveBeenCalledWith('/auth/login?redirect=%2Fdashboard%3Ftab%3Dlibrary');
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/home');
    });

    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('restores a cookie-backed session before fetching the user profile', async () => {
    supabaseAuth.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'restored-access',
            refresh_token: 'restored-refresh',
            expires_in: 3600,
          },
        },
      });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn(async () => ({
          data: {
            session: { access_token: 'cookie-access', refresh_token: 'cookie-refresh' },
            user: { id: 'user-1' },
          },
        })),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn() });

    render(<AuthInit />);

    await waitFor(() => {
      expect(supabaseAuth.setSession).toHaveBeenCalledWith({
        access_token: 'cookie-access',
        refresh_token: 'cookie-refresh',
      });
    });
    expect(dispatchMock).toHaveBeenCalledWith(fetchSession());
    expect(replaceMock).not.toHaveBeenCalledWith('/home');
  });

  it('retries profile fetch once when the first result is empty', async () => {
    fetchSessionResult = { type: 'auth/fetchSession/fulfilled', payload: null };
    dispatchMock
      .mockImplementationOnce(async () => fetchSessionResult)
      .mockImplementation(async () => ({
        type: 'auth/fetchSession/fulfilled',
        payload: { id: 'user-1' },
      }));

    render(<AuthInit />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(fetchSession());
    });
    await waitFor(() => {
      expect(
        dispatchMock.mock.calls.filter(call => call[0].type === 'auth/fetchSession'),
      ).toHaveLength(2);
    });
  });

  it('handles signed out, signed in, and failed token refresh auth events', async () => {
    render(<AuthInit />);

    await waitFor(() => {
      expect(authStateChangeHandler).toBeTruthy();
    });

    await act(async () => {
      await authStateChangeHandler?.('SIGNED_OUT', null);
    });
    expect(dispatchMock).toHaveBeenCalledWith(setUser(null));
    expect(replaceMock).toHaveBeenCalledWith('/auth/login?redirect=%2Fdashboard%3Ftab%3Dlibrary');

    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn() });

    await act(async () => {
      await authStateChangeHandler?.('SIGNED_IN', {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      });
    });
    expect(dispatchMock).toHaveBeenCalledWith(fetchSession());

    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn() });

    await act(async () => {
      await authStateChangeHandler?.('TOKEN_REFRESHED', {
        access_token: 'expired-access',
        refresh_token: 'expired-refresh',
      });
    });
    expect(dispatchMock).toHaveBeenCalledWith(setUser(null));
    expect(supabaseAuth.signOut).toHaveBeenCalled();
  });

  it('logs out the current user when a visibility check finds an expired session', async () => {
    currentUser = { id: 'user-1' };

    render(<AuthInit />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(fetchSession());
    });

    supabaseAuth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_at: Math.floor(Date.now() / 1000) - 10,
        },
      },
      error: null,
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(logout());
    });
    expect(dispatchMock).toHaveBeenCalledWith(setUser(null));
  });

  it('runs desktop full validation during idle time and cancels pending idle work on cleanup', async () => {
    jest.useFakeTimers();
    currentUser = { id: 'user-1' };
    const cancelIdleCallbackMock = jest.fn();
    let idleCallback: (() => void) | null = null;
    (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = jest.fn(
      (callback: () => void) => {
        idleCallback = callback;
        return 42;
      },
    );
    (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback = cancelIdleCallbackMock;
    supabaseAuth.getUser
      .mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: new Error('revoked') });

    const { unmount } = render(<AuthInit />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(fetchSession());
    });

    act(() => {
      jest.advanceTimersByTime(15 * 60 * 1000);
    });
    expect(globalThis.requestIdleCallback).toHaveBeenCalled();

    await act(async () => {
      await idleCallback?.();
    });

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(logout());
    });

    unmount();
    expect(cancelIdleCallbackMock).toHaveBeenCalledWith(42);
  });

  it('uses the idle timeout to clear a missing session after desktop inactivity', async () => {
    jest.useFakeTimers();
    currentUser = { id: 'user-1' };

    render(<AuthInit />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(fetchSession());
    });

    supabaseAuth.getSession.mockResolvedValueOnce({ data: { session: null } });

    act(() => {
      window.dispatchEvent(new Event('click'));
      jest.advanceTimersByTime(1000);
      window.dispatchEvent(new Event('click'));
      jest.advanceTimersByTime(60 * 60 * 1000);
    });

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(logout());
    });
    expect(dispatchMock).toHaveBeenCalledWith(setUser(null));
  });
});
