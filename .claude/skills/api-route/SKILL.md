---
name: api-route
description: Create or modify a route handler under src/app/api/. Use whenever the task involves an API endpoint, route.ts, a new backend action for the client, auth-gated or admin-gated server logic, rate limiting, or the ok/fail response envelope. Covers the withApiRoute wrapper, requireAuth/requireAdminRole, the correct Supabase client, rate limiters, cache revalidation, and the co-located jest test.
---

# Building an API route in Hobbistas

Every handler under `src/app/api/` follows one shape. Deviating breaks observability, error contracts, or security.

## 1. Pick the right primitives before writing

| Concern | Import | Notes |
|---|---|---|
| Observability | `withApiRoute` from `@/lib/observability/withApiRoute` | **Mandatory** on every exported method |
| Supabase client | `createRouteHandlerClient` from `@/lib/supabase-route-handler` | The only correct client in a route handler |
| Service role | `getSupabaseServer` from `@/lib/supabase-server` | Server-only. Storage writes, cross-user reads, admin work |
| User auth | `requireAuth` from `@/lib/api/auth` | Throws `UnauthorizedError` |
| Role gate | `requireAdminRole` / `requireAuthorRole` from `@/lib/api/permissions` | Throws `ForbiddenError`. Never inline role strings |
| Responses | `ok`, `okWithMeta`, `okWithPagination`, `fail` from `@/lib/api/response` | `ok` wraps in `{ data }`; `fail` returns the error object flat |
| Error catalog | `API_ERRORS` from `@/lib/api/errors` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `INTERNAL` |
| Rate limit | `rateLimit`, `getClientIp`, `rateLimitHeaders` from `@/lib/rate-limit` | Named limiter only |
| Cache | `revalidateCache` / `CACHE_TAGS` from `@/lib/cache/tags` | After every mutation |

If it is a media add/library/search/suggestions endpoint for a category, **do not write a handler** — use the factory. See the `media-category` skill.

## 2. Template

```ts
import { withApiRoute } from '@/lib/observability/withApiRoute';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { API_ERRORS } from '@/lib/api/errors';
import { ok, fail } from '@/lib/api/response';

async function GETHandler(req: Request) {
  try {
    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);

    const { data, error } = await supabase
      .from('some_table')
      .select('id, field')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('<Domain> fetch error:', error);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    return ok(data ?? []);
  } catch (error) {
    console.error('<Domain> error:', error);
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const GET = withApiRoute(GETHandler);
```

Rules the template encodes:
- Handlers are **named `<METHOD>Handler`** and only wrapped at export time. Tests import the wrapped export but stub `withApiRoute` to identity.
- One `try/catch` per handler. `UnauthorizedError` → 401, `ForbiddenError` → 403, anything else → 500 with a `console.error` prefixed by the domain.
- Never let a Supabase error object leak to the client. Log it, return `API_ERRORS.INTERNAL`.
- Validation errors return `fail({ error: 'Human readable sentence.' }, 400)` — plain, user-facing, no stack detail.

### Segment config

Add only what the route actually needs. Present in the existing routes:

```ts
export const runtime = 'nodejs';        // required for Buffer / service-role / storage work
export const dynamic = 'force-dynamic'; // any route reading cookies or session
export const maxDuration = 60;          // long-running: uploads, imports, syncs
```

Routes that only read public data may stay on defaults so they can be cached.

## 3. Rate limiting

Public/unauthenticated or expensive endpoints must rate limit **before** the `try` block, so a limiter failure never falls into the generic 500 path:

```ts
const clientIp = getClientIp(req);
const result = await rateLimit('loginIp', clientIp);
if (!result.success) {
  return fail({ error: 'Too many attempts. Please try again later.' }, 429, {
    headers: rateLimitHeaders(result),
  });
}
```

Limiter names live in `LIMITER_CONFIGS` in `src/lib/rate-limit/upstash.ts`. Existing: `loginIp` (10/10min), `loginEmail` (5/10min), `forgotIp`/`forgotEmail` (3/hr), `registerIp` (5/hr), `resendVerificationIp` (5/hr), `resendVerificationEmail` (3/hr), `deleteAccount` (1/hr), `apiGeneral` (100/min), `apiStrict` (10/min).

Need a new limit? Add a named entry to `LIMITER_CONFIGS` with a `rl:{context}:{type}` prefix. Never pass an ad-hoc `{ limit, windowMs }` object in a production route — that path is the in-memory fallback and is wrong on serverless.

Sensitive endpoints commonly limit on **two** axes (IP *and* email/user). Follow that when the endpoint can be targeted per-account.

## 4. Mutations

After any write, revalidate:

```ts
import { revalidateCache } from '@/lib/cache/tags';
revalidateCache.userLibrary(userId, 'anime');
```

Available helpers in `src/lib/cache/tags.ts`: `article(id?)`, `articleComment(id)`, `articleLike(id)`, `game(id?, slug?)`, `userBacklog(userId)`, `userProfile(userId)`, `userLibrary(userId, 'anime' | 'books' | 'movies')`, `publicStats()`, `path(path, type?)`, `allArticlePages()`, `allGamePages()`.

Never hardcode a tag string — use `CACHE_TAGS`. If a mutation has no matching helper, add one there rather than calling `revalidateTag` from the route. Cache durations come from `CACHE_CONFIG` (public 5min, user 1min, realtime 0).

## 5. Auth-sensitive routes

`/api/auth/*`, `/api/admin/*`, `/api/me/*` are `no-store` via `next.config.ts` headers and `NetworkOnly` in the service worker. If you add a route under those prefixes it inherits that; if you add an auth-bearing route **outside** them, check `next.config.ts` headers and the workbox `runtimeCaching` config so it is never cached.

Login/session routes additionally must preserve: `update_user_last_login` RPC, `setAuthCookies` from `@/lib/auth`, and the `account_status` checks (`deleted` / `suspended` / `banned` → 403). See `CRITICAL_FLOWS.md` §2.

## 6. Always write the test

Co-locate at `src/app/api/<path>/__tests__/<name>.test.ts`. See the `write-tests` skill for the mock scaffold — the key move is `jest.mock('@/lib/observability/withApiRoute', () => ({ withApiRoute: (h) => h }))` plus a hand-built Supabase chain mock. Model it on `src/app/api/auth/__tests__/login.test.ts`.

## 7. Verify

```
npx jest src/app/api/<path>
npm run lint
```
