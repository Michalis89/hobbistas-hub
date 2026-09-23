/**
 * Proxy — Next.js 16's name for what used to be `middleware.ts`.
 *
 * Two jobs: send the Content-Security-Policy header, and run an *optimistic*
 * auth gate so protected pages redirect on the server instead of flashing their
 * skeleton and bouncing from the client. As the Next.js docs stress, a proxy is
 * not an authorization boundary — the API routes and Supabase RLS remain the
 * real enforcement, and this must never be the only check.
 *
 * Only one proxy file is supported per project; all routing logic belongs here.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getLoginUrl, shouldRedirectToLogin } from '@/lib/routes/authRoutes';
import { clearAuthCookiesFromResponse } from '@/lib/auth/cookies';

const ACCESS_TOKEN_COOKIE = 'sb-access-token';

/**
 * Next.js serves hydration data as inline `<script>` tags. Blocking those stops
 * the app from ever hydrating, so script-src has to permit them.
 *
 * The alternative — per-request nonces — forces every page into dynamic
 * rendering, which would disable the static generation, ISR and CDN caching this
 * app is built around. `'unsafe-eval'` is dev-only: React uses eval there to
 * rebuild server error stacks in the browser.
 */
function buildCsp(isDev: boolean) {
  const scriptSrc = [`'self'`, `'unsafe-inline'`, ...(isDev ? [`'unsafe-eval'`] : [])];

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https: wss:`,
    `media-src 'self' https:`,
    `worker-src 'self' blob:`,
    `form-action 'self'`,
  ].join('; ');
}

type SessionState = 'active' | 'expired' | 'none';

/** Decodes a JWT payload without verifying it — expiry is all we need here. */
function readTokenExpiry(token: string): number | null {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) {
      return null;
    }

    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { exp?: number };

    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Reads the session straight from the auth cookie, with no network call.
 *
 * This deliberately does not use `@supabase/ssr`: that library looks for its own
 * `sb-<ref>-auth-token` cookies, while this app issues `sb-access-token` /
 * `sb-refresh-token` from its login route and keeps the browser session in
 * localStorage. Asking Supabase to read cookies it never wrote reported every
 * visitor as signed out, which bounced authenticated users off every protected
 * route.
 */
function readSessionState(request: NextRequest): SessionState {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return 'none';
  }

  const expiry = readTokenExpiry(token);
  // An unparseable token counts as active: the client refresh flow and the API
  // routes will sort it out, and we would rather not evict a valid session.
  if (expiry === null) {
    return 'active';
  }

  return expiry * 1000 > Date.now() ? 'active' : 'expired';
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const csp = buildCsp(process.env.NODE_ENV !== 'production');

  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set('Content-Security-Policy', csp);
    return response;
  };

  const sessionState = readSessionState(request);
  const signedIn = sessionState === 'active';

  if (!signedIn && shouldRedirectToLogin(pathname)) {
    const response = withCsp(
      NextResponse.redirect(new URL(getLoginUrl(`${pathname}${search}`), request.url)),
    );
    // An expired token is worth clearing: it is httpOnly, so the browser cannot
    // drop it itself, and leaving it behind keeps this guard seeing a session.
    return sessionState === 'expired' ? clearAuthCookiesFromResponse(response) : response;
  }

  // Deliberately one-way: this guard keeps anonymous visitors out of private
  // routes and never redirects a seemingly-signed-in visitor anywhere.
  //
  // Both redirects that used to live here caused lockouts, because this cookie
  // check and the client's own session state can disagree — a token revoked
  // server-side, or a failed /api/me, still leaves a cookie that parses and has
  // not expired:
  //   /home -> /dashboard  cycled against AuthInit's fallback to /home.
  //   /auth/login -> /dashboard  bounced people away from the very form they
  //   needed to recover, while the navbar was showing them "Sign in".
  // Whenever the two disagree, the user must be able to reach the login page.
  return withCsp(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Everything except:
     * - api routes (they do their own auth and must return JSON, not redirects)
     * - _next internals and image optimization
     * - the PWA surface (service worker, workbox chunks, manifest, offline page)
     * - files with an extension (icons, fonts, images)
     */
    '/((?!api/|_next/static|_next/image|sw\\.js|workbox-|fallback-|manifest\\.|offline|.*\\.[\\w]+$).*)',
  ],
};
