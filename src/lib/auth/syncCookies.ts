import { isAuthPersistenceEnabled } from '@/lib/supabase-client';

export type SyncableSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

async function postTokens(session: SyncableSession): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in || 3600,
        remember: isAuthPersistenceEnabled(),
      }),
    });
    // If server returns 401, cookies have expired - session is invalid
    if (response.status === 401) {
      return false;
    }
    return response.ok;
  } catch {
    // Network errors - not critical, don't force logout
    return true;
  }
}

let inflight: Promise<boolean> | null = null;
let inflightAccessToken: string | null = null;
let queued: SyncableSession | null = null;
let queuedResult: Promise<boolean> | null = null;

/**
 * Copies the browser's Supabase session into the httpOnly auth cookies that
 * API routes and server components read.
 *
 * Latest tokens win. Requests are sent one at a time, so a slower response can
 * never overwrite fresher cookies. When newer tokens arrive while a request is
 * in flight, they are sent right after it, and only the newest of them: tokens
 * that were superseded in the meantime are never written. (Previously a call
 * made during an in-flight request was dropped, which could leave the cookies
 * holding a refresh token the browser had already rotated away.)
 *
 * Resolves false only when the server rejects the sync with 401 (the cookie
 * session is gone).
 */
export function syncCookies(session: SyncableSession): Promise<boolean> {
  if (!inflight) {
    inflightAccessToken = session.access_token;
    inflight = postTokens(session).finally(() => {
      inflight = null;
      inflightAccessToken = null;
    });
    return inflight;
  }

  // The same tokens are already on their way.
  if (session.access_token === inflightAccessToken && !queued) {
    return inflight;
  }

  // Newer tokens: remember them (replacing any older queued ones) and send
  // them once the current request has finished. Everyone who called in the
  // meantime shares that result.
  queued = session;
  if (!queuedResult) {
    queuedResult = inflight.then(() => {
      const next = queued as SyncableSession;
      queued = null;
      queuedResult = null;
      return syncCookies(next);
    });
  }
  return queuedResult;
}
