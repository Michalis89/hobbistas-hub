---
name: ship-check
description: Validate a change before committing, opening a PR, or deploying. Use when work is finished and needs verification, when asked whether something is safe to ship, or to check whether a diff touched one of the do-not-break critical flows. Runs lint/test/build and maps changed paths to the specific invariants that must be re-verified.
---

# Pre-ship validation

## 1. Run the gates

Targeted first — the full suite collects coverage and is slow:

```
npx jest <path of the affected domain>
npm run lint
npm run test
npm run build
```

`npm run ci` runs lint + test + build in sequence.

Rules:
- Fix failures **at the source**. Do not add eslint-disable comments, loosen types, skip tests, or relax an assertion to match broken behavior.
- `npm run build` is not optional. It is the only step that catches App Router mistakes: un-awaited `params`, server-only imports pulled into client components, and metadata type errors.
- Report results honestly. If a step failed or was skipped, say so with the output.

## 2. Map the diff to critical flows

Check `git status` / `git diff --name-only`, then re-verify the invariants for every area touched. Full detail in `CRITICAL_FLOWS.md`.

| Changed path | Must still hold |
|---|---|
| `src/lib/diary/crypto.ts` | AES-256-GCM, PBKDF2-SHA256 at **250,000** iterations, 12-byte IV, AAD `${userId}:${entryId}:${field}`, base64 salt handling unchanged. Any drift makes every existing entry undecryptable. No crypto operation may move server-side. |
| `src/lib/auth/`, `src/app/api/auth/`, `authSlice.ts` | `/api/me` still returns `category_profile` + `genre_affinity` + roles; cookie flags (httpOnly, secure in prod, sameSite=lax, 30-day persistent) unchanged; `update_user_last_login` RPC still called; `account_status` checks (deleted/suspended/banned → 403) still present. |
| `src/lib/api/media/` | Local-first search order; dedup by external ID; `media_items` upsert before `user_media_entries`; games require `selected_platform`; category mismatch → 422; upsert key `user_id,media_id`; genre-affinity + category-profile recompute; `media_added` activity log. |
| `next.config.ts` (workbox), `src/worker/` | The three `NetworkOnly` auth rules stay first; `purgeOnQuotaError` intact; `/offline` fallback intact; `library-add-queue` store name, keyPath, and `library-add-sync` tag unchanged; auth-cache clearing on logout intact. |
| `src/lib/roles.ts`, admin routes | `VALID_ROLES` unchanged; `normalizeRole` aliases kept; no admin guard weakened; server-side role checks present, not just Redux selectors. |
| `src/lib/cache/tags.ts`, any mutation route | Every mutation still revalidates; no hardcoded tag strings. |
| `next.config.ts` redirects | All permanent legacy redirects still present (`/news` → `/articles`, `/reviews` → `/review`, `/pages/*`). |
| `src/components/ui/`, `globals.css`, `tailwind.config.ts` | No hardcoded colors; both themes render; touch targets ≥ 44px. |
| `supabase/migrations/` | `database.types.ts` regenerated and committed; RLS on any new user-data table. |

## 3. Security pass

- No secret in client-reachable code. `SUPABASE_SERVICE_ROLE_KEY`, `IGDB_CLIENT_SECRET`, `TMDB_API_KEY`, `RESEND_API_KEY`, and the Upstash tokens are server-only; only `NEXT_PUBLIC_*` may reach the browser.
- Every new API route: `withApiRoute` wrapper, auth check, rate limit if public or expensive, and no raw Supabase error text returned to the client.
- Every new user-data table: RLS enabled with explicit policies.
- No new authenticated endpoint that the service worker could cache.

## 4. Committing

- Branch first if on `main`. The current working branch is typically a feature branch such as `deploy-vercel`.
- Commit only when asked. Message style in this repo is `type: short description` (`fix: reload issue on pwa`, `feat: recommendations v3`, `improvement: ...`).
- Do not commit generated output: `coverage/`, `.next/`, `tsconfig*.tsbuildinfo`, `public/sw.js` and its workbox siblings.
- `.github/workflows/version-bump-on-merge.yml` bumps the version on merge — do not hand-edit `package.json`'s version.

## 5. Deploy notes

Vercel-hosted. A new env var must be added in the Vercel project settings as well as `.env.local`, or the build passes locally and fails in production. The service worker is disabled in development, so any PWA change needs `npm run build && npm run start` before it can be called verified.
