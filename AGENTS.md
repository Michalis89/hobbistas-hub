<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

# Hobbistas Project Rules

## Architecture

- Follow the **core + opt-in feature architecture** documented in `ARCHITECTURE.md`.
- Respect the Next.js App Router structure. Route groups: `(main)` for app shell, `(legal)` for legal pages, `api/` for API routes.
- Prefer Server Components by default unless client-side interactivity is required.
- Treat external APIs (IGDB, TMDB, MAL, Google Books) as discovery/enrichment sources. The internal database is the long-term source of truth. See `INTEGRATIONS.md`.
- New hobby verticals must follow the existing modular, opt-in pattern — isolated, lazy-loaded, removable without destabilizing core.
- Prefer extending existing feature slices and shared primitives over introducing parallel architecture paths.

## Auth & Security

- Preserve Supabase auth flows. Auth session lives in Redux (`authSlice.ts`); `/api/me` is the canonical source for the hydrated `User` object (includes `category_profile` and `genre_affinity`).
- Role hierarchy: `user < author < reviewer < moderator < admin < owner`. Role checks use `src/lib/roles.ts` utilities — never inline role string comparisons.
- Admin routes require `isAdminLike` or `isAdminOrModerator` checks. Never weaken these guards.
- All API route handlers must be wrapped in `withApiRoute` from `src/lib/observability/withApiRoute.ts`.
- Rate limiting: use named Upstash limiters (`rateLimit('loginIp', key)`) for production routes. Key limits: login 10/10min per IP, register 5/hr, forgot-password 3/hr, delete-account 1/hr.
- API auth checks: `requireAuth` (from `src/lib/api/auth.ts`) for user-level, `requireAdminRole`/`requireAuthorRole` (from `src/lib/api/permissions.ts`) for role-gated routes.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client. The admin client (`src/lib/supabase/admin.ts`) is server-only.
- Supabase client variants — use the correct one for each context:
  - `supabase-client.ts` — browser (client components)
  - `supabase-server.ts` — React Server Components
  - `supabase-route-handler.ts` — API route handlers
  - `supabase-middleware.ts` — edge middleware
  - `supabase/admin.ts` — server-only service role

## Diary Encryption — DO NOT BREAK

- Diary uses **client-side AES-256-GCM** encryption with PBKDF2 key derivation (250k iterations). See `CRITICAL_FLOWS.md`.
- The server never sees plaintext diary content. Encryption/decryption happens exclusively in `src/lib/diary/crypto.ts`.
- Never change the encryption algorithm, iteration count, salt handling, or AAD semantics without a migration plan.
- Offline diary drafts use IndexedDB (`src/lib/diary/offlineStorage.ts`).

## PWA & Offline

- Never regress PWA or offline support. Service worker config is in `next.config.ts` (workbox runtime caching).
- Auth/admin/me API routes are `NetworkOnly` — never cache authenticated responses.
- Public pages use `StaleWhileRevalidate`, static assets use `CacheFirst`.
- Offline fallback page: `src/app/offline/`. Custom worker: `src/worker/`.
- The worker manages a **library add queue** (IndexedDB `library-add-queue` store) with background sync for offline library additions (`src/lib/pwa/libraryAddQueue.ts`). Do not break this queue or the `library-add-sync` tag.
- Push notification handling, auth cache clearing on logout, and periodic feed refresh are all in the worker.

## Media System

- Media API routes use the **factory pattern** in `src/lib/api/media/factories.ts`. New categories must follow this — do not create one-off route handlers.
- Search follows **local-first** pattern: query internal DB first, fall back to external API, deduplicate by external ID. See `INTEGRATIONS.md`.
- When adding external media, always upsert into `media_items` first, then create `user_media_entries`.
- After library mutations, background-recompute `genre_affinity` and `category_profiles`. Never skip these.
- Games require `selected_platform` — enforced at the API level.
- Category configs in `src/lib/api/media/config.ts` define external ID fields, title priority, select fields, and enrichers per category.

## Design System

- Follow `UI-System.md`. `src/components/ui/` is the single source of truth for UI primitives.
- The project uses the **violet-bloom** theme — primary ~258deg violet in HSL.
- Use semantic CSS variables (`--surface-raised`, `--text-secondary`, `--accent-primary`) over raw color values.
- Prefer composition of existing shadcn/ui Radix-based components over custom implementations.
- Three font families: Plus Jakarta Sans (`--font-sans`), Lora (`--font-serif`), IBM Plex Mono (`--font-mono`).
- Dark mode is the default. Theme set via `data-theme` attribute on `<html>`, managed by `ThemeContext` + cookies.

## Data Fetching Patterns

- **Redux**: Auth state only (`authSlice`). Do not add new Redux slices for data fetching.
- **SWR**: Client-side data fetching with global config in `src/lib/swr/config.ts`.
- **Server Components**: Preferred for initial data loads. Use Supabase server client.
- **Cache invalidation**: Use `revalidateCache` helpers from `src/lib/cache/tags.ts` after mutations. Use `CACHE_TAGS` constants — never hardcode tag strings.

## Content Model

- Hobby categories defined in `src/config/hobbies.ts`: games, anime, manga, movies, tv, books, coding, pet, vape.
- Each category has modules (backlog, news, reviews) with availability flags and auth requirements.
- Articles have `ArticleCategory` and `ArticleTopic`. Reviews are articles with topic `reviews`.
- Media categories in DB: `anime | manga | movies | tv | books | games`.
- `media_items` is the unified entity model. `user_media_entries` is the per-user tracking layer.

## Testing & Workflow

- Prefer test-driven development for non-trivial logic and bug fixes.
- Tests co-locate with source in `__tests__/` directories.
- After meaningful changes, run: `npm run lint`, `npm run test`, `npm run build`.
- Fix issues at the source — do not bypass lint rules, tests, or type safety.
- Prefer targeted test execution for the affected domain before running the full suite.
- Use `npm run ci` for full validation.

## SEO & Redirects

- Metadata centralized in `src/utils/seo/metadata/`. Structured data uses JSON-LD.
- Sitemap and robots are App Router route handlers — `src/app/sitemap.ts` and `src/app/robots.ts`. There is no `next-sitemap` dependency and no postbuild step.
- Keeping a page out of search is the job of `noindex` (via `buildMetadata({ noindex: true })`, often on the section's `layout.tsx`), not of a `Disallow` in `robots.ts` — a blocked URL is never fetched, so its `noindex` is never read. Reserve `robots.ts` for paths that must not be fetched at all.
- Article translations are indexable URLs: the source language lives on the bare path, every other locale is `?lang=<locale>`. Each one canonicalises to itself and carries the full reciprocal `hreflang` set — see `articleLocalePath` / `articleLocaleAlternates` in `src/lib/articles/locales.ts`.
- Permanent redirects in `next.config.ts` preserve legacy URLs (`/news` -> `/articles`, `/reviews` -> `/review`). Do not remove these.

## Cross-Cutting Concerns

- Email: Resend integration (`src/lib/email/`).
- Observability: `src/lib/observability/` — `withApiRoute` wrapper and request logging.
- Captcha: Cloudflare Turnstile (`src/lib/captcha/`).
- Validation: Zod schemas in `src/lib/validation/`.

## Supporting Documentation

- `ARCHITECTURE.md` — Core + opt-in architecture, content acquisition model
- `UI-System.md` — Design system rules, theme tokens, component patterns
- `CRITICAL_FLOWS.md` — Do-not-break flows with specific invariants
- `INTEGRATIONS.md` — External API contracts, media factory system, import pipelines
