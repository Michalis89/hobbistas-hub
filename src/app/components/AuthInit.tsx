'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSession, setUser, logout, selectUser } from '@/store/slices/authSlice';
import { supabase } from '@/lib/supabase-client';
import { syncCookies } from '@/lib/auth/syncCookies';
import type { AppDispatch } from '@/store/store';
import { getLoginUrl, shouldRedirectToLogin } from '@/lib/routes/authRoutes';

const AUTH_STORAGE_KEY = 'hobbistas-hub-auth';
const RETURN_URL_KEY = 'hobbistas-hub-return-url';
const DESKTOP_SESSION_CHECK_INTERVAL_MS = 15 * 60 * 1000;

function scheduleIdleCallback(callback: () => void, timeout = 5000): number {
  if (typeof requestIdleCallback !== 'undefined') {
    return requestIdleCallback(callback, { timeout });
  }
  return setTimeout(callback, 100) as unknown as number;
}

function cancelIdleCallback(id: number): void {
  if (typeof window.cancelIdleCallback !== 'undefined') {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0;
}

/**
 * Check if a session token is expired or expiring soon
 */
function isTokenExpired(expiresAt: number | undefined | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const expiresAtMs = expiresAt * 1000;
  const now = Date.now();
  return expiresAtMs <= now;
}

/**
 * Safely remove auth data from storage and cookies
 */
function clearAuthStorage() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore storage errors (e.g., SSR, private browsing)
  }
  try {
    if (typeof document !== 'undefined') {
      const cookieNames = ['sb-access-token', 'sb-refresh-token'];
      cookieNames.forEach(name => {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      });
    }
  } catch {
    // ignore cookie errors
  }
}

async function clearAuthCachesInServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const message = { type: 'CLEAR_AUTH_CACHE' };

  try {
    navigator.serviceWorker.controller?.postMessage(message);
  } catch {
    // ignore SW controller race conditions
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage(message);
    registration.waiting?.postMessage(message);
    registration.installing?.postMessage(message);
  } catch {
    // ignore SW readiness failures
  }
}

// Sync session tokens to the httpOnly cookies the server reads (latest wins).
// Lives in lib so the Studio save path can re-sync too; re-exported here for
// existing importers.
export { syncCookies };

export default function AuthInit() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const currentUser = useSelector(selectUser);
  const currentUserRef = useRef(currentUser);
  const initialFetchInFlight = useRef(true);
  const redirectInFlight = useRef<string | null>(null);

  const redirectAfterLogout = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const { pathname, search } = window.location;
    if (!shouldRedirectToLogin(pathname)) {
      return;
    }
    const redirectTo = `${pathname}${search}`;
    const target = getLoginUrl(redirectTo);
    if (redirectInFlight.current === target) {
      return;
    }
    redirectInFlight.current = target;
    router.replace(target);
  }, [router]);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  /**
   * Force logout and clear all auth state
   * Saves current URL so user can return after login
   */
  const forceLogout = useCallback(async () => {
    // Save current URL for redirect after login (only if on a protected page)
    try {
      const currentPath = window.location.pathname + window.location.search;
      // Don't save auth pages as return URL
      if (!currentPath.startsWith('/auth')) {
        sessionStorage.setItem(RETURN_URL_KEY, currentPath);
      }
    } catch {
      // ignore storage errors
    }

    clearAuthStorage();
    await clearAuthCachesInServiceWorker();
    try {
      await dispatch(logout());
    } catch {
      // signOut can fail if already signed out; ignore
    }
    dispatch(setUser(null));
    redirectAfterLogout();
  }, [dispatch, redirectAfterLogout]);

  /**
   * Validate session by checking with server (getUser makes an API call)
   * This is more reliable than getSession which only reads localStorage
   */
  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      // First check localStorage session for quick expiry check
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        return false;
      }

      // Check if token is already expired based on expires_at
      const expired = isTokenExpired(sessionData.session.expires_at);
      if (expired) {
        return false;
      }

      // Validate with server - getUser() makes an actual API call
      // This catches cases where token was revoked server-side
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData.user) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }, []);

  // Fetch session on mount with validation
  useEffect(() => {
    const initAuth = async () => {
      initialFetchInFlight.current = true;
      let authSucceeded = false;

      // Check if there's stored auth data and validate it
      let isValid = await validateSession();

      if (!isValid) {
        // localStorage session is missing or expired.
        // Before logging out, check if httpOnly cookies are still valid —
        // this covers the common dev-server-restart case where cookies survive
        // but localStorage was cleared.
        try {
          const cookieRes = await fetch('/api/auth/session', {
            credentials: 'include',
            cache: 'no-store',
          });
          if (cookieRes.ok) {
            const cookieData = await cookieRes.json();
            if (cookieData?.data?.session && cookieData?.data?.user) {
              // Restore the client-side Supabase session from cookie-backed tokens
              await supabase.auth.setSession({
                access_token: cookieData.data.session.access_token,
                refresh_token: cookieData.data.session.refresh_token,
              });
              isValid = true;
            }
          }
        } catch {
          // Network error during cookie check — fall through to forceLogout
        }
      }

      if (!isValid) {
        // No valid session anywhere — clear and redirect
        await forceLogout();
      } else {
        // Valid session - sync cookies and fetch profile
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          // Try to sync cookies, but don't force logout on failure
          // Cookies will be synced automatically on next token refresh
          // This prevents logout when opening multiple tabs where cookies may not be ready
          await syncCookies(sessionData.session);
        }
        const result = await dispatch(fetchSession());

        if (fetchSession.fulfilled.match(result) && result.payload !== null) {
          authSucceeded = true;
        } else {
          // fetchSession failed (rejected) OR returned null.
          // Could be a transient error (dev server warm-up, brief API unavailability).
          // Retry once after a short delay.
          await new Promise(r => setTimeout(r, 400));
          const { data: retrySessionData } = await supabase.auth.getSession();
          if (retrySessionData.session) {
            await syncCookies(retrySessionData.session);
            const retryResult = await dispatch(fetchSession());
            authSucceeded = fetchSession.fulfilled.match(retryResult) && !!retryResult.payload;
          }
        }
      }

      initialFetchInFlight.current = false;

      // Safety net: useEffect([currentUser]) only re-runs when currentUser *changes*.
      // If fetchSession failed and currentUser was already null (initial Redux state),
      // the effect never fires again after initialFetchInFlight becomes false.
      // Redirect to /home (safe public page) when auth init ends without a user and
      // we are on a route that requires authentication.
      if (
        !authSucceeded &&
        typeof window !== 'undefined' &&
        shouldRedirectToLogin(window.location.pathname)
      ) {
        router.replace('/home');
      }
    };

    initAuth();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session || event === 'SIGNED_OUT') {
        dispatch(setUser(null));
        clearAuthStorage();
        await clearAuthCachesInServiceWorker();
        redirectAfterLogout();
        return;
      }

      if (event === 'SIGNED_IN') {
        if (currentUserRef.current) {
          return;
        }
        // Sync cookies on sign in, but don't force-logout if it fails.
        // On mobile PWA, cookies set by the login API may not yet be available
        // when this event fires after a page navigation (iOS timing quirk).
        // The session is already confirmed valid by Supabase — a sync failure
        // here does not mean the session itself is invalid.
        await syncCookies(session);
        dispatch(fetchSession());
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        // Sync cookies when token is refreshed
        const syncOk = await syncCookies(session);
        if (!syncOk) {
          // Cookies expired - localStorage session is orphaned, force logout
          dispatch(setUser(null));
          clearAuthStorage();
          await supabase.auth.signOut();
        }
      }
      // USER_UPDATED, PASSWORD_RECOVERY etc. will keep existing state
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, forceLogout, validateSession, redirectAfterLogout]);

  // Keep session fresh on visibility change/interval to avoid stale "logged-in" UI after expiry
  useEffect(() => {
    let cancelled = false;
    let lastCheckTime = 0;
    let pendingIdleCallback: number | null = null;
    const isMobile = isMobileDevice();
    const VISIBILITY_CHECK_DEBOUNCE_MS = 5000; // Don't check more than once every 5 seconds

    // Quick check on visibility - only validates localStorage expiry, no API call
    const quickCheckSession = async () => {
      if (initialFetchInFlight.current) {
        return;
      }
      if (!currentUser) {
        return;
      }

      // Debounce: don't check too frequently
      const now = Date.now();
      if (now - lastCheckTime < VISIBILITY_CHECK_DEBOUNCE_MS) {
        return;
      }
      lastCheckTime = now;

      const { data, error } = await supabase.auth.getSession();
      if (cancelled) {
        return;
      }

      // If the token is gone/invalid, clear user
      if (error || !data.session) {
        await forceLogout();
        return;
      }

      // Check token expiration from localStorage only (no API call)
      const expired = isTokenExpired(data.session.expires_at);

      if (expired) {
        await forceLogout();
      }
      // Note: We don't call fetchSession() here even if expiring soon.
      // Supabase handles token refresh automatically. Calling fetchSession
      // would cause isLoading to change, triggering re-renders that unmount
      // components like ActivityFeed, causing unwanted data refetches.
    };

    // Full validation with server - scheduled during idle time to not block interactions
    const fullCheckSession = () => {
      if (initialFetchInFlight.current) {
        return;
      }
      if (!currentUser) {
        return;
      }

      // Schedule the actual validation during browser idle time
      pendingIdleCallback = scheduleIdleCallback(async () => {
        if (cancelled) {
          return;
        }
        const isValid = await validateSession();
        if (cancelled) {
          return;
        }

        if (!isValid) {
          await forceLogout();
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void quickCheckSession();
        if (isMobile) {
          fullCheckSession();
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    const intervalId = isMobile
      ? null
      : window.setInterval(fullCheckSession, DESKTOP_SESSION_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (pendingIdleCallback !== null) {
        cancelIdleCallback(pendingIdleCallback);
      }
    };
  }, [dispatch, currentUser, forceLogout, validateSession]);

  // Idle logout after 1h of inactivity (only for authenticated users)
  // Skip on mobile devices to reduce event listener overhead
  useEffect(() => {
    // Skip idle timeout entirely on mobile (rely on server-side session expiry)
    if (isMobileDevice()) {
      return;
    }

    const IDLE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
    const ACTIVITY_DEBOUNCE_MS = 1000; // Only process activity once per second
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastActivityTime = 0;
    let cancelled = false;

    const resetTimer = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (cancelled) {
          return;
        }
        // If there is still a valid session, keep it; otherwise logout hard
        if (!data.session) {
          await dispatch(logout());
          dispatch(setUser(null));
          clearAuthStorage();
          await clearAuthCachesInServiceWorker();
          redirectAfterLogout();
        }
      }, IDLE_LIMIT_MS);
    };

    // Debounced activity handler - prevents excessive calls from mousemove etc.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityTime < ACTIVITY_DEBOUNCE_MS) {
        return;
      }
      lastActivityTime = now;
      resetTimer();
    };

    const isTouchDevice =
      window.matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0;
    const activityEvents = isTouchDevice
      ? ['click', 'keydown', 'focus', 'visibilitychange']
      : ['click', 'keydown', 'mousemove', 'focus', 'visibilitychange'];
    // Use passive listeners for better scroll/touch performance
    activityEvents.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    resetTimer();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      activityEvents.forEach(ev => window.removeEventListener(ev, onActivity));
    };
  }, [dispatch, redirectAfterLogout]);

  useEffect(() => {
    if (initialFetchInFlight.current) {
      return;
    }
    if (currentUser) {
      return;
    }
    redirectAfterLogout();
  }, [currentUser, redirectAfterLogout]);

  // This component doesn't render anything
  return null;
}
