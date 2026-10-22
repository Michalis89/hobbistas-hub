# External Integrations

## Architectural Principle

External APIs are **discovery and enrichment sources**, not the source of truth. The internal `media_items` table is the strategic content foundation. All integrations must reinforce the local-first model.

---

## Media Category Configurations

Defined in `src/lib/api/media/config.ts`:

| Category Key | Subcategories | External ID Field | External Source | Title Priority |
|-------------|---------------|-------------------|-----------------|---------------|
| `anime` | anime, manga | `mal_id` (number) | MyAnimeList API | title_english > title_romaji > title_native |
| `books` | books | `google_books_id` (string); alternates `open_library_id`, `nlg_id`, `isbn_13` | Google Books + Open Library + National Library of Greece | title > original_title |
| `games` | games | `igdb_id` (number) | IGDB API | title > title_english |
| `movies` | movies, tv | `tmdb_id` (number) | TMDB API | title > original_title > title_english > title_romaji > title_native |

---

## IGDB (Games)

**Files**: `src/lib/igdb/igdbClient.ts`, `src/lib/igdb/token.ts`, `src/lib/igdb/categories.ts`, `src/lib/services/igdbService.ts`, `src/lib/api/media/search/providers/games.ts`

**Capabilities**:
- Game search with strict and fallback modes (two-tier: category-filtered first, then broader)
- Game category filtering (`isAllowedIgdbGameCandidate`) — allowed categories: 0 (Main Game), 1 (DLC), 2 (Expansion), 3 (Bundle), 4 (Standalone Expansion), 8 (Remake), 9 (Remaster), 13, 14. Excludes titles containing "compilation", "collector", "mod", "season pass".
- Cover image URL construction: `https://images.igdb.com/igdb/image/upload/{size}/{imageId}.jpg`
- Game enrichment for external-source adds
- External games lookup: maps Steam App IDs to IGDB game IDs via `external_games` endpoint
- Rich data extraction: platforms, themes, game modes, player perspectives, developer/publisher, ratings, artwork/screenshot IDs

**Authentication**: Twitch OAuth (client credentials) with automatic token refresh. Requires `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` env vars. Uses IGDB Query Language (IQL) for complex queries via IGDB API v4 (`https://api.igdb.com/v4`).

**Caching**: External API responses cached via `cachedExternalFetch()` with 6-hour TTL. Stale-empty guard retries if cache returns empty array.

**Important rules**:
- Games search normalizes Roman numerals (e.g., "Final Fantasy 10" -> "Final Fantasy X") for better matching.
- The `igdb_slug` field is used as a secondary search key.
- `igdb_category` is stored on `media_items` for post-hoc filtering.

---

## TMDB (Movies & TV)

**Files**: `src/lib/tmdb/`, `src/lib/api/media/search/providers/movies.ts`

**Capabilities**:
- Movie and TV show search
- Metadata enrichment (runtime, episode counts, air dates)
- Cover image URL construction

**Authentication**: API key via `TMDB_API_KEY` env var.

---

## MyAnimeList (Anime & Manga)

**Files**: `src/lib/integrations/mal.ts`, `src/lib/api/media/search/providers/anime.ts`

**Capabilities**:
- Anime and manga search
- MAL ID matching for deduplication against local DB

**Authentication**: Via MAL API credentials.

---

## Books (Google Books, Open Library, National Library of Greece, Hardcover)

**Files**: `src/lib/api/media/search/providers/books.ts`, `src/lib/books/`

Books are the one category with more than one provider. Every provider result is mapped
to a provider-neutral `BookCandidate` (`src/lib/books/types.ts`) before it reaches the
search handler.

**Search** queries the providers in parallel and merges them (`src/lib/books/merge.ts`): a
book several know (shared ISBN-13, or same normalised title + first author) becomes one
result whose gaps are filled from the others; books only one knows are interleaved. The
merged list is then ranked (`rankBooksByQuery`): the best match of each provider first, so
one provider cannot crowd the others off the page (a provider whose best does not match the
title at all is not promoted, unless nothing does, e.g. an author search), then by title
match, then by Hardcover reader count. ISBN-shaped queries
are sent as exact ISBN lookups and also matched against local `isbn_13`.

- Google Books and Open Library take part in every search; Hardcover too when
  `HARDCOVER_API_TOKEN` is set.
- The National Library of Greece (ΕΒΕ) catalogue takes part only in Greek searches (Greek
  letters in the query, or a 978-960 / 978-618 ISBN), and is the primary source for them,
  so a Greek book keeps its Greek title, edition and publisher. Its queries replace the
  first letter of χτ/κτ and φτ/πτ inside a word with a `?` wildcard, so "δαχτυλίδι" also
  finds records spelled "δακτυλίδι".

**Pagination**: books set `paginated: true` in their `MediaSearchConfig`, so the search
handler honours `?page=` (capped at 10): the local query is paged with `range()`, the page is
passed to every provider (Google `startIndex`, Open Library `page`, ΕΒΕ `offset`, Hardcover
`page`), and the response carries `page` and `hasMore`. Other categories ignore `?page=`. The
Add Entry panel shows "Load more" and drops repeats, since providers page independently.

**Provenance (dev/preview only)**: each result carries `provenance: { origin, providers }`
(`src/lib/api/media/provenance.ts`), shown as a badge such as "DB · Google Books" or
"Google Books + Open Library". It is decided on the server and omitted from the response
in production (`VERCEL_ENV=production`, or `NODE_ENV=production` off Vercel).

**Identity**: `google_books_id` stays the primary external id; `open_library_id`, `nlg_id`,
`hardcover_id` and `isbn_13` are `alternateFields` in the category config. The search handler
deduplicates on all of them via `getLocalExternalIds` / `getExternalIds` (namespaced keys
`gb:`, `ol:`, `nlg:`, `hc:`, `isbn:`), and the add handler looks for an existing row by each in
order. When an add matches an existing row, the row's empty columns (`backfillFields`) are
filled from the payload, never overwritten. Books known only to Open Library are addressed
at `/media/books/OL…W`, books known only to the ΕΒΕ at `/media/books/NLG<biblionumber>`,
books known only to Hardcover at `/media/books/HC<id>`.

**Enrichment on add** (`enrichBookPayload` in `handlers/enrichers.ts`) mixes the
providers into one row, filling gaps only:

1. ΕΒΕ MARC record: page count, publisher, subjects, ISBN. A Greek-ISBN book that came
   from another provider is matched to its ΕΒΕ record by ISBN first. Cover URLs built from
   an ISBN (ΕΒΕ, Open Library by ISBN) are kept only if the image exists.
2. Open Library work: description and subjects.
3. Google Books by ISBN: description and cover of the same edition, plus its volume id.
4. Open Library by ISBN: a description as a last resort. Its work id is *not* stored: an
   Open Library work groups every edition and language, and a Greek edition must not be
   folded into the English work's row.

| Provider | Auth | Role |
|---|---|---|
| Google Books | `GOOGLE_BOOKS_API_KEY` | search + same-edition enrichment |
| Open Library | none (sends an identifying `User-Agent`) | search + work enrichment |
| National Library of Greece | none | Greek search (Koha OpenSearch RSS), record details (MARCXML), covers (`covers.nlg.gr`) |
| Hardcover | `HARDCOVER_API_TOKEN` (personal API token; `Bearer ` prefix optional). Unset = skipped | search: descriptions, genres, reader counts for ranking |

**Hardcover terms that shape the code** (`src/lib/books/hardcover.ts`): server-side only;
a public site may use book data and aggregate counts but not data owned by users
(libraries, reviews, ratings, lists); covers are user uploads, and the API docs' "Public Data
Warning" tells sites that show them publicly to "make absolutely sure" they list a DMCA takedown
policy (a strong recommendation in the docs, not a clause of a signed agreement) — the site's is
at `/copyright` (`src/app/(legal)/copyright`), so Hardcover covers (`assets.hardcover.app`) are used.
A cover taken down after a notice goes in `src/lib/books/coverBlocklist.ts` (with the SQL there to
clear stored rows); it is then filtered from search results, add payloads, enrichment and backfill,
so a later API fetch cannot bring it back. When providers are merged the best cover wins regardless
of whose data won: Hardcover > Open Library work cover > Google thumbnail > a URL guessed from an
ISBN. Titles from Hardcover's search index can arrive HTML-escaped and are decoded. Free plan: 5,000 requests/day,
60/minute. GraphQL errors arrive with HTTP 200 and are turned into a 502 before the cache,
so they are never cached.

**ΕΒΕ TLS**: `catalogue.nlg.gr` does not send its intermediate certificate, which Node
rejects. `src/lib/books/nlgTransport.ts` supplies that public intermediate (GEANT TLS ECC
1, from the certificate's AIA URL) alongside Node's root store, with verification fully
on. `covers.nlg.gr` has a correct chain and uses plain `fetch`. The catalogue is a public
service: it is asked only about Greek searches and every answer is cached for 6 hours.

---

## RAWG (Legacy Games)

**Files**: `src/lib/rawg/`

**Status**: Legacy integration. IGDB is the primary games API. RAWG fields (`rawg_id`) exist in the database schema but new additions use IGDB.

---

## PlayStation Network (PSN)

**Files**: Uses `psn-api` npm package.

**Capabilities**: Trophy/achievement data (used in gaming profile features).

---

## Steam

**Files**: `src/lib/integrations/steam.ts`, `src/lib/integrations/steam-sync-helpers.ts`

**Capabilities**: Steam library sync, `steam_app_id` matching.

---

## Admin Import Pipelines

**Files**: `src/app/api/admin/media/import/`

Import routes for bulk data ingestion (admin-only):

| Pipeline | Path | Source |
|----------|------|--------|
| IGDB Games | `/api/admin/media/import/igdb` | IGDB API |
| TMDB Movies/TV | `/api/admin/media/import/tmdb` | TMDB API |
| MAL Anime/Manga | `/api/admin/media/import/mal` | MAL API |
| Google Books | `/api/admin/media/import/books` | Google Books API |

These pipelines normalize and insert into `media_items` for curation.

---

## Email (Resend)

**Files**: `src/lib/email/resend.ts`, `src/lib/email/send.ts`, `src/lib/email/templates.ts`

Used for: email confirmation, password reset, notifications.

---

## Rate Limiting (Upstash Redis)

**Files**: `src/lib/rate-limit/`

- Production: Upstash Redis for shared state across serverless instances
- Development: in-memory fallback (no Redis required)
- Named limiters with per-endpoint configuration
- Rate limit headers included in responses

---

## Captcha (Cloudflare Turnstile)

**Files**: `src/lib/captcha/`

Used on: registration, potentially other public forms.

---

## Analytics

- **Vercel Analytics**: `@vercel/analytics` — production only, Vercel-hosted
- **Vercel Speed Insights**: `@vercel/speed-insights` — production only
- **Google Analytics**: Conditional on `NEXT_PUBLIC_GA_ID` env var

---

## External Image Domains

Registered in `next.config.ts` `images.remotePatterns`:

| Domain | Source |
|--------|--------|
| `image.api.playstation.com` | PSN |
| `psnobj.prod.dl.playstation.net` | PSN |
| `i.psnprofiles.com` | PSN Profiles |
| `media.rawg.io` | RAWG |
| `images.igdb.com` | IGDB |
| `cdn.cloudflare.steamstatic.com` | Steam |
| `s4.anilist.co` | AniList |
| `*.myanimelist.net` | MAL |
| `image.tmdb.org` | TMDB |
| `books.google.com` | Google Books |
| `covers.openlibrary.org` | Open Library covers |
| `covers.nlg.gr` | National Library of Greece covers |
| `assets.hardcover.app` | Hardcover covers |
| `jolfksxuhyktpwncniks.supabase.co` | Supabase Storage |
| `www.replacesmoke.com` | Vape content |
| `images.thedirect.com` | Article images |
| `c.scdn.gr` | Greek content |

Adding new external image sources requires adding them to both `next.config.ts` (remotePatterns) and potentially the service worker caching rules.

---

## Environment Variables (Required)

| Variable | Used By | Context |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase clients | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase clients | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client | Server-only |
| `IGDB_CLIENT_ID` | IGDB API | Server-only |
| `IGDB_CLIENT_SECRET` | IGDB API | Server-only |
| `TMDB_API_KEY` | TMDB API | Server-only |
| `UPSTASH_REDIS_REST_URL` | Rate limiting | Server-only |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | Server-only |
| `RESEND_API_KEY` | Email sending | Server-only |
| `NEXT_PUBLIC_SITE_URL` | SEO, auth redirects | Public |
| `NEXT_PUBLIC_GA_ID` | Google Analytics | Public (optional) |
