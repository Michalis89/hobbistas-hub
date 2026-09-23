/**
 * The shared read-only demo account.
 *
 * Three layers keep it read-only, and each one covers a gap the others leave:
 *
 *  1. Restrictive RLS policies (`supabase/migrations/20260923_demo_account.sql`)
 *     are the actual boundary. They catch the writes the browser makes straight
 *     to Supabase, which never pass through this codebase at all.
 *  2. `withApiRoute` refuses mutating requests from a demo session, so routes
 *     that write with the service role - which bypasses RLS - are covered too.
 *  3. The UI hides or disables write affordances, so nobody has to discover the
 *     rule by hitting an error.
 */

export const DEMO_ACCESS_COOKIE = 'sb-access-token';

/**
 * The demo user's id is public on purpose: it is a shared account, the client
 * needs it to recognise its own session, and a single variable keeps the server
 * and the browser from ever disagreeing about who the demo user is.
 */
export function getDemoUserId(): string | null {
  return process.env.NEXT_PUBLIC_DEMO_USER_ID || null;
}

/** Whether the demo entry point should be offered at all. */
export function isDemoEnabled(): boolean {
  return Boolean(getDemoUserId());
}

// The sign-in credentials live in `./credentials.server`, not here: this
// module is imported by client components, and secrets should not be one
// careless edit away from the browser bundle.

export function isDemoUserId(userId: string | null | undefined): boolean {
  const demoUserId = getDemoUserId();
  return Boolean(demoUserId && userId && userId === demoUserId);
}

/**
 * Reads the subject out of a Supabase access token without verifying it.
 *
 * Unverified is fine here precisely because this check only ever takes access
 * away. A forged token could hide that it is the demo user, but it would then
 * fail signature verification at Supabase and write nothing. Trusting it to
 * *grant* anything would be a different matter.
 */
export function readUserIdFromAccessToken(token: string | undefined): string | null {
  if (!token) {
    return null;
  }
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) {
      return null;
    }
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

/** True when this request carries the demo account's session. */
export function isDemoRequest(request: Request): boolean {
  if (!getDemoUserId()) {
    return false;
  }
  const token = readCookie(request.headers.get('cookie'), DEMO_ACCESS_COOKIE);
  return isDemoUserId(readUserIdFromAccessToken(token));
}

/** Methods that cannot change anything, so a demo session may use them. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Routes a demo session may POST to. Signing in is the obvious one; signing
 * out has to work or a visitor could never leave the demo, and the token
 * refresh is a POST that keeps a long browsing session alive.
 */
const DEMO_WRITE_ALLOWLIST = new Set([
  '/api/auth/demo-login',
  '/api/auth/logout',
  '/api/auth/refresh',
]);

export function isDemoWriteBlocked(request: Request): boolean {
  if (READ_ONLY_METHODS.has(request.method.toUpperCase())) {
    return false;
  }
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return false;
  }
  if (DEMO_WRITE_ALLOWLIST.has(pathname)) {
    return false;
  }
  return isDemoRequest(request);
}

export const DEMO_WRITE_BLOCKED_MESSAGE =
  'This is the read-only demo account. Create your own account to save changes.';
