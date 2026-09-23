---
name: media-category
description: Work on the media system — add a new media category or subcategory, wire a new external provider (IGDB/TMDB/MAL/Google Books style), change search/add/library/suggestions behavior, or debug why a title is missing, duplicated, or unaddable. Use for anything touching media_items, user_media_entries, src/lib/api/media/, or the /api/{category}/ routes.
---

# The media factory system

Four categories exist today, each grouping subcategories:

| Key | Subcategories | External ID | Provider |
|---|---|---|---|
| `anime` | anime, manga | `mal_id` (number) | MyAnimeList |
| `books` | books | `google_books_id` (string) | Google Books |
| `games` | games | `igdb_id` (number) | IGDB |
| `movies` | movies, tv | `tmdb_id` (number) | TMDB |

DB categories are `anime | manga | movies | tv | books | games`. `media_items` is the unified entity table; `user_media_entries` is the per-user tracking layer.

**Never hand-write a `/api/{category}/{add,library,search,suggestions}` route.** Each is a one-liner over a factory:

```ts
// src/app/api/anime/add/route.ts
export const { POST } = createMediaAddRoute('anime');
// src/app/api/anime/library/route.ts
export const { GET, PATCH, DELETE } = createMediaLibraryRoute('anime');
// src/app/api/books/search/route.ts
export const { GET } = createMediaSearchRoute(booksSearchConfig);
// src/app/api/games/suggestions/route.ts
export const { GET } = createSuggestionsRoute(gamesSuggestionsConfig);
```

Factories: `src/lib/api/media/factories.ts`. Shared handlers: `src/lib/api/media/handlers/{add,library,search,suggestions}.ts`.

## Layout

```
src/lib/api/media/
├── config.ts              MEDIA_CATEGORY_CONFIGS — the per-category contract
├── factories.ts           route builders
├── types.ts
├── suggestionsConfigs.ts
├── handlers/              add · library · search · suggestions · enrichers · suggestionsMappers
├── search/providers/      anime · books · games · movies (MediaSearchConfig per category)
└── utils/                 title-resolver · media-lookup · entry-mapper · revalidation
```

## Adding a category

1. **DB first** — add the category value and any provider-specific columns on `media_items` via a migration (see the `db-migration` skill), then regenerate types with `npm run db:types`.

2. **`config.ts`** — add a `MediaCategoryConfig` entry:
   - `key`, `subcategories`, `defaultCategory`
   - `externalId: { field, type }` — the column that identifies the item in the provider
   - `titlePriority` — ordered fallback list resolved by `utils/title-resolver.ts`
   - `logPrefix` — used in every `console.error` for the category
   - `librarySelectFields` / `suggestionsSelectFields` — explicit column lists with a `media_items!inner(...)` join. Keep these tight; they are the payload size of every library request.

3. **`search/providers/<category>.ts`** — export a `MediaSearchConfig` with:
   `defaultCategory`, `supportedCategories`, `limit`, `logPrefix`, `buildLocalOrFilter(query)`, `mapLocalItem`, `mapExternalItem`, `getLocalExternalId`, `getExternalId`, `fetchExternal(query, { category, limit })`, and optionally `normalizeSearchTerm`, `shouldIncludeLocalItem`, `shouldIncludeExternalItem`.
   `mapLocalItem` and `mapExternalItem` **must produce the same result shape** — the UI cannot tell the two apart.

4. **`handlers/enrichers.ts`** — register the `enricher` and/or `payloadMapper` here, not in `config.ts`. They are assigned at import time specifically to avoid a circular dependency; `handlers/add.ts` imports this module for its side effect.

5. **Routes** — four thin files calling the factories.

6. **Client integration** — category config in `src/config/hobbies.ts`, plus dashboard/backlog category lists (`src/lib/dashboard/category-data.ts`).

7. **Tests** — provider mapping, and add/library behavior. Model on `src/lib/api/media/handlers/__tests__/`.

## Invariants — breaking these corrupts data

**Search is local-first** (`handlers/search.ts`):
- Query `media_items` first with `buildLocalOrFilter`.
- Only then `fetchExternal`.
- Deduplicate: external results matching a local entry by external ID are dropped. `getLocalExternalId` and `getExternalId` must return comparable values or duplicates appear.
- `normalizeSearchTerm` runs as a **retry** when the raw query returns nothing (this is how games map "Final Fantasy 10" → "Final Fantasy X").
- Response carries `source: 'local' | 'external' | 'mixed'`.

**Add** (`handlers/add.ts`):
- `source: 'local'` → verify the item exists, verify the category matches, upsert `user_media_entries`.
- `source: 'external'` → validate external ID, find-or-insert `media_items` (enriching if configured), *then* upsert `user_media_entries`. Skipping the first step orphans the entry.
- Games without `selected_platform` → 400. This is enforced at the API level, not the UI.
- Category mismatch → 422.
- Upsert conflict key is `user_id,media_id`. Changing it produces duplicates.
- After every successful add: `refreshGenreAffinity` + `recomputeCategoryProfiles` in the background, and a mandatory `media_added` activity log via `insertActivity`.
- Revalidate via `utils/revalidation.ts` / `revalidateCache`.

**IGDB specifics**: candidates are filtered by `isAllowedIgdbGameCandidate` (`src/lib/igdb/categories.ts`) — DLC-only noise, bundles, compilations, collector editions, mods and season passes are excluded. `igdb_category` is persisted for post-hoc filtering; `igdb_slug` is a secondary search key.

**External API calls** go through `cachedExternalFetch()` (`src/lib/api-cache/external.ts`, 6h TTL) with a stale-empty guard that retries when the cache holds an empty array. Do not call provider endpoints with bare `fetch` from a handler.

## Debugging checklist

| Symptom | Look at |
|---|---|
| Title missing/wrong | `titlePriority` in `config.ts`, `utils/title-resolver.ts` |
| Duplicate search results | `getLocalExternalId` vs `getExternalId` type mismatch (string vs number) |
| Item found externally but add fails | external ID validation, enricher throwing, category mismatch guard |
| Library row missing a field | `librarySelectFields` in `config.ts` |
| Game rejected | `isAllowedIgdbGameCandidate` |
| Recommendations stale after add | `refreshGenreAffinity` / `recomputeCategoryProfiles` not awaited or erroring silently |
| No results for a valid title | provider `fetchExternal`, then `normalizeSearchTerm` |

New external image host? Register it in `next.config.ts` `images.remotePatterns` **and** check the workbox image caching rules.
