---
name: recommendations
description: Work on the recommendation and taste-profile engines under src/lib/recommendations/ — V3 adapters and pipeline, V2 scoring, genre affinity, category profiles, taste clusters, tone inference, continuations, or discovery scoring. Use when tuning why an item was or was not suggested, adding a category to the recommender, or changing what the dashboard/backlog suggestion endpoints return.
---

# Recommendation engines

Three layers coexist. Know which one you are in before editing.

```
src/lib/recommendations/
├── core/genre-normalization.ts     shared genre canonicalization
├── v2/                             multi-factor scorer (still serving some routes)
│   ├── core/     preference-analyzer · scoring-engine · genre-coverage · genre-quality
│   ├── games/    games-recommender · games-scorer
│   └── generic/  generic-recommender
└── v3/                             current engine — adapter + shared pipeline
    ├── recommender.ts              orchestrator, entry point
    ├── types.ts                    response contract
    ├── adapters/                   games · anime · manga · movies · tv · books
    ├── pipeline/                   cluster-extractor · tone-inferrer · continuation-detector
    │                               backlog-scorer · discovery-scorer · explanation-generator
    ├── utils/                      franchise · genre
    └── games/, anime/, tv/, books/ category-specific engines
```

**Design constraint** (a deliberate product decision, not an accident): the personal recommender uses **only the user's own data**. Community signals are a separate, opt-in layer gated behind `community_suggestions_enabled`. Do not mix community popularity into the personal scoring path. V3 is the free algorithmic core; anything embedding- or LLM-based belongs to the paid premium tier described in `PREMIUM_AI_PLAN.md` — keep that boundary intact.

## V3 pipeline

`generateRecommendationsV3(userId, category)` in `v3/recommender.ts`. Categories: `games | anime | manga | movies | tv | books`.

Flow:
1. `adapter.loadData(supabase, userId)` → `{ history, candidates }`
2. Build `UserScoringContext` — `extractClusters`, `inferToneProfile`, preferences
3. `scoreBacklogItems` → top 4
4. `detectContinuationCandidates` (sequels, next entries in a franchise)
5. `scoreDiscoveryCandidates` + `selectDiverseDiscovery`
6. Fill `possibleNext`: 2 continuation + 2 discovery, with fallback rules
7. `generateExplanations` + `generateTasteSummary`
8. Assemble `RecommendationResponse`

Tuning constants sit at the top of `recommender.ts`: `BACKLOG_LIMIT`, `POSSIBLE_NEXT_LIMIT`, `CONTINUATION_SLOTS`, `DISCOVERY_SLOTS`, `MIN_CONTINUATION_CONFIDENCE`.

### Response contract

`RecommendationItem` is `{ id: `${category}-${mediaDbId}`, mediaDbId, title, cover, slug, category, source, confidence (0–1), reason, matchedSignals[] }` with `source: 'backlog' | 'continuation' | 'discovery'`. `RecommendationResponse` carries a `tasteProfile` (topGenres, topTags, topClusters, toneProfile, summaries; games additionally topPlayerStyles/topPlatforms).

`reason` and `matchedSignals` are user-visible. Every scoring change must keep the explanation truthful — a score that no longer matches its stated reason is a bug even if the ranking improved.

## Adding a category to V3

Implement `CategoryAdapter` (`v3/adapters/adapter.types.ts`) in `v3/adapters/<category>.adapter.ts`:
- `category`
- `clusterPrototypes` — the taste clusters that make sense for this medium
- `toneDefinitions` — tone signals
- `continuationPatterns` — regex patterns for sequels/seasons/volumes
- `loadData(supabase, userId)` — the category's Supabase queries, returning history + candidates
- optional score overrides for category-specific signals

Then register it in the `ADAPTERS` map in `recommender.ts`. Everything else in the pipeline is shared — resist adding a category branch outside the adapter.

## Where the inputs come from

- `genre_affinity` and `category_profile` hang off the user object served by `/api/me`, and are recomputed in the background after every library add (`refreshGenreAffinity`, `recomputeCategoryProfiles` — see the `media-category` skill). If recommendations look frozen, check that recomputation ran.
- Genre strings must be canonicalized through `core/genre-normalization.ts` / `v3/utils/genre.ts` before comparison. Raw provider genre labels differ per API and will not match.
- Franchise/edition handling is in `v3/utils/franchise.ts` (`extractBaseTitle`, `isEditionVariant`) — this is what stops "Game of the Year Edition" being recommended alongside the base game the user already owns.

## Changing scoring — always test-first

`v3/__tests__/` holds the behavioral spec: taste engines, recommendation engines, backlog scorer, continuation detector, franchise, adaptive mode. These tests encode the intended output for real-shaped input.

```
npx jest src/lib/recommendations
```

Procedure for any tuning change:
1. Add or extend a test expressing the desired outcome for a concrete profile.
2. Watch it fail.
3. Change the weight/rule.
4. Re-run the **whole** recommendations suite — weights are global; fixing one category's ranking routinely breaks another's.

`games-debug.ts` exists for tracing why a specific title scored what it did — use it rather than adding `console.log` calls that end up committed.

## Consumers

`/api/dashboard/suggestions`, `/api/dashboard/game-suggestions`, `/api/backlog/personal-suggestions`, and the per-category `/api/{category}/suggestions` factory routes. Changing the response shape means updating those consumers and the dashboard/backlog components together.
