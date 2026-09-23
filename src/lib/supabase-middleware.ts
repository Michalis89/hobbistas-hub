/**
 * @deprecated Do not use. Kept only as a warning marker.
 *
 * This built a `@supabase/ssr` client for the proxy, but that library reads its
 * own `sb-<ref>-auth-token` cookies. This app issues `sb-access-token` /
 * `sb-refresh-token` from `src/lib/auth/cookies.ts` and keeps the browser
 * session in localStorage (see `supabase-client.ts`), so the client here never
 * found a session and reported every visitor as signed out — which bounced
 * authenticated users off every protected route.
 *
 * `proxy.ts` now reads the access-token cookie directly and checks its expiry
 * locally, with no network call. If you need a Supabase client on the server,
 * use one of the supported variants instead:
 *   - `supabase-server.ts`        — React Server Components
 *   - `supabase-route-handler.ts` — API route handlers
 *   - `supabase/admin.ts`         — server-only service role
 */

export {};
