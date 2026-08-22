/**
 * Shared Auth Cookie Utilities
 * Centralized cookie management for authentication
 */

import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

const AUTH_COOKIE_NAMES = {
  ACCESS_TOKEN: 'sb-access-token',
  REFRESH_TOKEN: 'sb-refresh-token',
} as const;

/**
 * Get base cookie options for auth cookies
 * These are shared across all auth cookie operations
 */
export function getAuthCookieOptions(): Partial<ResponseCookie> {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}

/**
 * Get persistent cookie options (for "remember me" functionality)
 * Extends base options with 30-day expiry
 */
export function getPersistentAuthCookieOptions(): Partial<ResponseCookie> {
  return {
    ...getAuthCookieOptions(),
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}

/**
 * Set auth session cookies
 * Used after successful login or token refresh
 */
export async function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  persistent = false,
) {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const options = persistent ? getPersistentAuthCookieOptions() : getAuthCookieOptions();

  cookieStore.set(AUTH_COOKIE_NAMES.ACCESS_TOKEN, accessToken, options);
  cookieStore.set(AUTH_COOKIE_NAMES.REFRESH_TOKEN, refreshToken, options);
}

/**
 * Clear auth session cookies
 * Used during logout or after password change
 */
export async function clearAuthCookies() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();

  cookieStore.delete(AUTH_COOKIE_NAMES.ACCESS_TOKEN);
  cookieStore.delete(AUTH_COOKIE_NAMES.REFRESH_TOKEN);
}

/**
 * Set auth session cookies directly on a NextResponse.
 *
 * Use this instead of `setAuthCookies` whenever the handler returns a response
 * it constructed itself (notably `NextResponse.redirect`): cookies written via
 * `next/headers` are not reliably merged into such a response, which would send
 * the user onward without a session.
 */
export function setAuthCookiesOnResponse(
  response: import('next/server').NextResponse,
  accessToken: string,
  refreshToken: string,
  persistent = false,
) {
  const options = persistent ? getPersistentAuthCookieOptions() : getAuthCookieOptions();

  response.cookies.set(AUTH_COOKIE_NAMES.ACCESS_TOKEN, accessToken, options);
  response.cookies.set(AUTH_COOKIE_NAMES.REFRESH_TOKEN, refreshToken, options);
  return response;
}

/**
 * Clear auth cookies from NextResponse (for middleware)
 * Used when session is invalid or expired during middleware execution
 */
export function clearAuthCookiesFromResponse(response: import('next/server').NextResponse) {
  response.cookies.delete(AUTH_COOKIE_NAMES.ACCESS_TOKEN);
  response.cookies.delete(AUTH_COOKIE_NAMES.REFRESH_TOKEN);
  return response;
}

/**
 * Get auth cookie names (useful for reference)
 */
export function getAuthCookieNames() {
  return AUTH_COOKIE_NAMES;
}
