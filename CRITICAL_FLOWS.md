# Critical Flows — Do Not Break

This document lists flows with hard invariants. Breaking these causes data loss, security regressions, or user-facing corruption.

---

## 1. Diary Encryption Flow

**Files**: `src/lib/diary/crypto.ts`, `src/lib/diary/offlineStorage.ts`, `src/lib/diary/types.ts`, `src/lib/diary/hooks/`

**Invariants**:

- All diary content is encrypted **client-side** before being sent to the server. The server stores only ciphertext.
- Algorithm: AES-256-GCM via Web Crypto API.
- Key derivation: PBKDF2 with SHA-256, **250,000 iterations**, from a user-supplied passphrase + per-user salt.
- Each field encryption uses a unique random 12-byte IV.
- AAD (additional authenticated data) format: `${userId}:${entryId}:${field}` — binds ciphertext to its owner, entry, and field to prevent reassignment attacks.
- Salt is base64-encoded and stored in the `diary_key_salts` table (one-to-one with user). It is NOT secret, but must never change after key derivation.
- A database trigger enforces encrypted-only writes — plaintext content cannot be written to `diary_entries`.

**What will break if you change**:

- Iteration count change = all existing entries become undecryptable.
- Algorithm change (AES-GCM -> anything else) = all existing entries become undecryptable.
- IV length change = decryption failure.
- Salt encoding change (base64 normalization logic) = key derivation produces wrong key.
- Moving any crypto operation to the server = privacy contract violation.

**Offline support**:

- Diary drafts are persisted in IndexedDB (`hobbistas-pwa` database, `diary_offline_drafts` store).
- Offline drafts store plaintext locally (user's device) for sync when online.
- The `offlineEvents.ts` module handles sync lifecycle.

---

## 2. Authentication Flow

**Files**: `src/store/slices/authSlice.ts`, `src/lib/auth/`, `src/lib/supabase/`, `src/app/api/auth/`, `src/app/(main)/auth/`

**Invariants**:

- Login flow: `supabase.auth.signInWithPassword` -> `update_user_last_login` RPC -> fetch `/api/me` for full user profile -> Redux state update.
- Registration is multi-step (3 steps: basic info, personal info, gaming info). Signup posts to `/api/auth/signup` which creates user via admin client, generates confirmation link, sends email via Resend.
- Email confirmation is required before full access. `src/app/(main)/auth/confirm-email/` handles the confirmation redirect with a 6-second auto-redirect to login.
- Logout: `supabase.auth.signOut()` -> POST `/api/auth/logout` to clear server cookies -> Redux state reset.
- Session hydration: `fetchSession` thunk calls `supabase.auth.getSession()` then `/api/me` — if either fails, user is logged out.
- `RouteAwareAuthInit` component in root layout handles session initialization on navigation.
- Account deletion (`/api/auth/delete-account`) requires password re-verification.
- Account statuses (`active`, `suspended`, `banned`, `deleted`) are enforced during login and session checks.

**Auth API routes**:

| Route                       | Method | Rate Limit                         |
| --------------------------- | ------ | ---------------------------------- |
| `/api/auth/signup`          | POST   | 5/hr per IP                        |
| `/api/auth/login`           | POST   | 10/10min per IP, 5/10min per email |
| `/api/auth/logout`          | POST   | —                                  |
| `/api/auth/session`         | GET    | —                                  |
| `/api/auth/refresh`         | POST   | —                                  |
| `/api/auth/forgot-password` | POST   | 3/hr per IP and email              |
| `/api/auth/update-password` | POST   | —                                  |
| `/api/auth/delete-account`  | POST   | 1/hr per user                      |

**Cookie handling**: Auth cookies (`sb-access-token`, `sb-refresh-token`) are httpOnly, secure (prod), sameSite=lax. Persistent mode (remember me) uses 30-day expiry.

**What will break if you change**:

- Removing or changing the `/api/me` endpoint = auth state missing critical fields (category_profile, genre_affinity, roles).
- Changing cookie handling in `src/lib/auth/cookies.ts` = session loss across tabs/refreshes.
- Removing the `update_user_last_login` RPC call = last_login tracking breaks.
- Changing the Supabase middleware client cookie flow = edge auth checks fail.
- Removing account status checks during login = banned/suspended users can access the app.

---

## 3. Media Add Flow (Local-First)

**Files**: `src/lib/api/media/handlers/add.ts`, `src/lib/api/media/config.ts`, `src/lib/api/media/utils/`

**Invariants**:

- **Local source**: Verify media exists in `media_items`, validate category match, upsert `user_media_entries`.
- **External source**: Validate external ID, find-or-insert into `media_items` (with optional enrichment), then upsert `user_media_entries`.
- Games require `selected_platform` — returns 400 without it.
- IGDB game candidates are filtered by `isAllowedIgdbGameCandidate` — DLC, bundles, and mods are excluded.
- Category mismatch (e.g., trying to add an anime media_item via the games endpoint) returns 422.
- After successful add: background `refreshGenreAffinity` + `recomputeCategoryProfiles`.
- Activity logging is mandatory — every add must log a `media_added` activity.

**What will break if you change**:

- Removing the category mismatch guard = data integrity violation.
- Skipping the `media_items` upsert for external sources = orphaned `user_media_entries`.
- Removing genre affinity recomputation = stale recommendation data.
- Changing the `onConflict: 'user_id,media_id'` upsert key = duplicate entries.

---

## 4. Media Search Flow (Local-First)

**Files**: `src/lib/api/media/handlers/search.ts`, `src/lib/api/media/search/providers/`

**Invariants**:

- Always query local DB first using the category-specific `buildLocalOrFilter`.
- If local results are insufficient, query external API via `fetchExternal`.
- Deduplicate: external results that match local entries by external ID are excluded.
- Search normalization (e.g., Roman numeral conversion for games) is applied before external fallback.
- Response includes `source` field: `'local'`, `'external'`, or `'mixed'`.

**What will break if you change**:

- Removing local-first query = violates content acquisition architecture.
- Removing deduplication = duplicate entries in search results.

---

## 5. PWA Service Worker Caching

**Files**: `next.config.ts` (workbox config), `src/worker/`, `src/lib/pwa/`

**Invariants**:

- Auth endpoints (`/api/auth/*`, `/api/admin/*`, `/api/me/*`) are `NetworkOnly` — authenticated data must never be cached.
- Requests with `Authorization` headers are `NetworkOnly`.
- Supabase storage images are `CacheFirst` with 7-day TTL.
- External media images are `CacheFirst` with 14-day TTL, 500 entries max, with `purgeOnQuotaError`.
- Offline fallback document: `/offline`.
- `skipWaiting: true` and `clientsClaim: true` ensure immediate activation.
- **Library add queue**: The service worker manages an IndexedDB queue (`hobbistas-pwa` DB, `library-add-queue` store) for offline library additions, with background sync (tag: `library-add-sync`). Client-side queue management in `src/lib/pwa/libraryAddQueue.ts`.
- **Push notifications**: The worker handles push events with received/open/dismiss tracking and click-through routing to target URLs.
- **Auth cache clearing**: The worker clears auth-related caches on logout messages.

**What will break if you change**:

- Caching auth endpoints = serving stale/wrong user data.
- Removing `purgeOnQuotaError` from image caches = storage quota errors on low-memory devices.
- Changing offline fallback = broken offline experience.
- Breaking the library add queue or background sync tag = offline library additions silently lost.
- Removing auth cache clearing on logout = stale authenticated data served after logout.

---

## 6. Role-Based Access Control

**Files**: `src/lib/roles.ts`, `src/store/slices/authSlice.ts` (selectors)

**Invariants**:

- Roles are stored as `string[]` on the user object.
- `normalizeRole` handles aliases (e.g., `'mod'` -> `'moderator'`).
- Role checks: `hasRole`, `hasAnyRole`, `isAdminLike`, `isAdminOrModerator`, `isOwner`.
- Redux selectors derive UI permissions: `selectCanQuickAdd`, `selectCanAccessAdminPanel`, `selectCanEditArticles`, `selectIsAdmin`.
- Server-side admin checks must also verify roles — do not rely on client-side selectors alone.

**What will break if you change**:

- Changing `VALID_ROLES` array = existing users with those roles lose access.
- Removing `normalizeRole` aliases = role check failures for legacy data.
- Weakening admin guards = unauthorized access to admin features.

---

## 7. Cache Invalidation

**Files**: `src/lib/cache/tags.ts`

**Invariants**:

- All cache tags use `CACHE_TAGS` constants — never hardcode tag strings.
- `revalidateCache` helpers are called after mutations to ensure consistency.
- Article mutations invalidate: article tags, activity feed, public stats.
- Library mutations invalidate: user backlog/library tags, user activity, activity feed.
- Profile mutations invalidate: user profile tag, user activity.

**What will break if you change**:

- Removing revalidation calls after mutations = stale data served to users.
- Changing tag naming conventions = orphaned cache entries.

---

## 8. Legacy URL Redirects

**Files**: `next.config.ts` (redirects section)

**Invariants**:

- `/news` -> `/articles` (permanent)
- `/reviews` -> `/review` (permanent)
- `/pages/backlog` -> `/backlog` (permanent)
- `/pages/news/:slug` -> `/articles/:slug` (permanent)
- Several one-off redirects for specific articles that moved between sections.

**What will break if you change**:

- Removing these = broken links from search engines and external sites (SEO damage).
- Changing permanent to temporary = search engines keep indexing old URLs.

## 9. Demo Account Read-Only

**Files**: `supabase/migrations/20260923_demo_account.sql`, `src/lib/demo/`, `src/lib/observability/withApiRoute.ts`, `src/app/api/auth/demo-login/route.ts`, `scripts/seed-demo.mjs`

**Invariants**:

- The demo account is a real signed-in user. Read-only is enforced in the database, never in the UI.
- `users.is_demo` marks it. `public.is_demo_account()` reads that flag for the current `auth.uid()`.
- The lockdown uses **restrictive** RLS policies (`demo_account_no_insert` / `_no_update` / `_no_delete`). Restrictive policies are AND-ed with existing ones and can only remove access, so they compose with whatever else a table has.
- `withApiRoute` refuses non-GET requests carrying the demo session. This is the only thing covering routes that write with the service role, because the service role bypasses RLS.
- `/api/auth/demo-login`, `/api/auth/logout` and `/api/auth/refresh` are allowlisted, or a visitor could not enter, leave, or stay signed in.
- `NEXT_PUBLIC_DEMO_USER_ID` is the single source of truth for who the demo user is, shared by server and client so they cannot disagree.
- Demo sessions are never "remembered": `setAuthCookies(..., false)`.

**What will break if you change**:

- Adding a user-writable table without adding it to the migration's `targets` array = that table is writable by anyone using the demo.
- Turning the restrictive policies into permissive ones = they would _grant_ access instead of removing it, opening every listed table.
- Enabling the demo without running the migration = the UI says read-only while the database happily accepts writes. The migration warns about tables that have RLS disabled; a policy on such a table is silently ignored.
- Removing the `withApiRoute` guard = service-role routes (account deletion, comments, imports) become writable from the demo.

## 10. Article Reading Language

**Files**: `supabase/migrations/20260923_article_translations.sql`, `src/lib/articles/locales.ts`, `src/app/(main)/pages/_shared/ArticleDetailPage.tsx`, `src/app/api/articles/[id]/translations/route.ts`

**Invariants**:

- The `articles` row **is** the source language (English). A locale is never stored twice: `PUT /api/articles/[id]/translations` rejects `locale: 'en'`, and `findTranslation` returns null for it.
- Only reader-facing fields are translatable. Slug, category, topic, tags, cover and score stay on the article, so the URL space and the taxonomy do not fork per language.
- Empty translated fields fall back **per field**, but `content_rich` and `content_html` move **together** (`applyArticleTranslation`). A Greek rich doc beside an English HTML fallback would render one language and cache the other.
- Language resolution order is `?lang=` → saved preference → `Accept-Language` → English, then narrowed to the locales the article actually has.
- Page metadata resolves from the URL only. It is cached per URL, so it must never depend on the reader's saved preference.
- The switcher renders only when a translation has a non-empty title, so a blank studio draft does not advertise a language that is not there.
- `users.language_preference` is constrained to `en`/`el` in the database and re-typed as `ArticleLocale` on `User`.

**What will break if you change**:

- Adding a locale = update `ARTICLE_LOCALES`, the `article_translations_locale_check` constraint, and the `users_language_preference_check` constraint together. Miss one and writes fail or unreachable content is created.
- Letting metadata read the saved preference = the first visitor's language gets cached and served to everyone.
- Storing English as a translation row = two sources of truth, one silently shadowing the other.
