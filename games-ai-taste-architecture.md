# Games AI Taste & Reranking — Architecture Analysis

Status: analysis only. No code changed.
Date: 2026-08-22

---

## 1. Current Architecture

### 1.1 Entry point

`generateGamesRecommendationsV3()` lives in `src/lib/recommendations/v3/games/games-recommender.ts:59`.

It is **not** part of the generic V3 adapter pipeline. `generateRecommendationsV3()`
(`src/lib/recommendations/v3/recommender.ts:71`) short-circuits for `games` (and `anime`)
before the adapter path runs:

```
generateRecommendationsV3(userId, 'games')
  └─► generateGamesRecommendationsV3(userId)          // bespoke path
        ├─ loadUserMediaHistory()
        ├─ loadUserCategoryProfile()
        ├─ loadDatabaseGames()          ← full media_items games scan
        ├─ buildGamesTasteProfile()     ← games-taste-engine.ts
        └─ buildGamesRecommendations()  ← games-recommendation-engine.ts
              ├─ pickBacklogRecommendations()
              └─ pickPossibleNextRecommendations()
  └─► mapGamesResultToRecommendationResponse()  // recommender.ts:660+
```

Consequence: `src/lib/recommendations/v3/adapters/games.adapter.ts` (432 lines) and the shared
pipeline modules (`pipeline/cluster-extractor.ts`, `pipeline/tone-inferrer.ts`,
`pipeline/backlog-scorer.ts`, `pipeline/discovery-scorer.ts`,
`pipeline/explanation-generator.ts`) are **dead code for games**. They still run for
movies/tv/manga/books. Anyone reading "the V3 pipeline" and assuming games uses it will be wrong.

Callers:
- `src/lib/dashboard/category-data.ts:829` — server-side, on **every dashboard render**.
- `src/app/api/backlog/personal-suggestions/route.ts:38` — dynamic import, per request.

### 1.2 How history is loaded

`loadUserMediaHistory()` (`games-recommender.ts:95`): one query on `user_media_entries`
with `media_items!inner(...)`, filtered `category in ('games','game')`, `user_id = userId`.
All statuses come back in a single set. Fields pulled: `status, score, progress, priority,
is_favorite, pinned_rank, updated_at, selected_platform` plus `genres`, `igdb_themes`,
`platforms`, covers.

Two robustness notes:
- **No `.range()` / no explicit limit.** PostgREST caps at its configured max rows (1000 by
  default). A user with a 1000+ game library silently gets a truncated history and therefore a
  silently wrong taste profile.
- `studios` is **not selected**, even though `recomputeCategoryProfiles` already derives
  `profiles.games.favorite_developers` from it. The recommender is blind to developers.

`loadUserCategoryProfile()` reads `user_category_profiles.profiles` but uses exactly one field:
`profiles.games.favorite_platform`.

### 1.3 Statuses

App-level union is `'planned' | 'current' | 'completed' | 'dropped'`
(`src/types/database.ts:331`, mirrored in `games-types.ts:47`). Mapping to your terms:

| Your term | Value in DB |
|---|---|
| completed | `completed` |
| in progress / current | `current` |
| backlog / planned | `planned` |
| dropped | `dropped` |

The DB column is plain `text` with no CHECK constraint. `tasteWeight()` uses an
if/else chain whose **final else is the dropped branch** — any unexpected status value
(an import writing `on_hold`, say) is scored as negative evidence. Latent, not currently firing.

### 1.4 Scores and favorites → taste

`tasteWeight()` in `src/lib/recommendations/v3/games/games-taste-engine.ts:196`:

| Status | Weight |
|---|---|
| `planned` | `0` |
| `current` | `0.7` |
| `completed` | `1`, `+1` if score ≥ 8, `+2` if score ≥ 9, `+3` if favorite |
| `dropped` | `-1`, `-1` more if score ≤ 5 |

So the full range is `-2 … +6`. `isHighSignal()` = completed AND (favorite OR score ≥ 9).

The weight is applied **whole, per genre**. A game with 4 genres contributes its full weight to
each of the 4. Nothing normalizes by genre count.

### 1.5 Genres, themes, player styles

**Genres.** `toCanonicalGenres()` → `getCanonicalKey()` (`v3/utils/genre.ts`) normalizes IGDB
genre strings. Per canonical genre the engine accumulates `positiveWeight`, `negativeWeight`,
`positiveCount`, `highSignalCount`. Classification:

- `noise` if `negativeWeight > positiveWeight && negativeWeight >= 2`
- `core` if `(net >= 4 && highSignalCount >= 2) || (net >= 6 && positiveCount >= 2)`
- `secondary` if `net >= 2 && positiveCount >= 2`

Top 3 core, top 3 secondary are kept.

**Themes.** Two sources, summed into one map:
1. Real `igdb_themes` strings from completed/current entries with positive weight.
2. `synthesizeThemes()` (`games-taste-engine.ts:225`) — hardcoded arithmetic on genre nets:
   - `rpg + adventure >= 5` → `narrative-driven worlds` at `(rpg+adventure) * 0.7`
   - `rpg + hack >= 5` → `dark fantasy action` at `* 0.6`
   - `adventure + shooter >= 4` → `cinematic single-player campaigns` at `* 0.6`
   - `tactical + strategy >= 3` → `choice-driven progression` at `* 0.7`

Then `.filter(theme => !theme.includes('psychological'))` — a hardcoded content suppression —
and `.slice(0, 3)`.

**Player styles.** `buildPlayerStyles()` — four hardcoded formulas, top 2 kept:
- `single-player narrative immersion` = `net(adventure) + net(rpg) + net(hack-and-slash)`
- `franchise continuation focus` = `Σ over completed/current of (favorite ? 1.5 : 0.8)`
- `challenge-driven action RPG` = `(net(rpg)+net(hack)+net(tactical)) * 0.8`
- `cinematic campaign preference` = `(net(adventure)+net(shooter)) * 0.7`

**Negative signals.** Three hardcoded substring rules on dropped games' genre string
(`moba|rts` → "multiplayer live-service aversion", `simulation|simulator` → "cozy simulator
aversion", `indie && puzzle` → "puzzle-first indie aversion"), plus two derived from "noise"
genres, with `indie`/`platform`/`adventure`/`role-playing-rpg` explicitly exempted.

### 1.6 Backlog scoring

`scoreBestFitBacklog()` (`games-recommendation-engine.ts:277`), clamped 0–100:

```
+ coreMatch * 20
+ secondaryMatch * 8
+ favoriteFranchiseSimilarity * 8
+ highRatedFranchiseAffinity * 8
+ progressionFit            (0 / 3 / 8 / 12)
+ narrativeSinglePlayerFit ? 12 : 0
+ strongRpgCinematicAffinity * 12     (count of rpg/adventure/shooter, 0–3)
+ platformTieBreaker        (0–6, hardwired PlayStation ladder)
- familyClutterPenalty      (0 / 4 / 8)
- puzzleNoisePenalty        (22 if puzzle+indie+no core match)
- cozyPenalty               (16 if simulation without rpg)
```

If `findBacklogContinuation()` matches, score becomes
`min(100, fit + 8 + continuationConfidence*12 + immediateNextBonus(12) - skipAheadPenalty(6))`.
Continuations are picked first (max 2), then best-fit fills to 4, with one-per-franchise-family
diversity via `pickFranchiseDistinctBacklog()`.

### 1.7 Discovery candidate selection

`loadDatabaseGames()` **paginates the entire `media_items` games table**, 500 rows at a time,
until exhausted. Then:
1. Drop rows already in the library by id or by `normalizeGameIdentityKey`.
2. `loadPopularityScores()` — a second query pulling **every `user_media_entries` row for every
   remaining candidate id**, cross-user, to compute `tracked/completed/favorite` rates
   (min 3 trackers to score).
3. Reorder so preferred-platform candidates come first.

Then `scoreDiscoveryCandidate()` on each, keeping those ≥ `DISCOVERY_MIN_SCORE = 58`:

```
+ coreMatch * 22
+ secondaryMatch * 10
+ narrativeFit ? 14 : 0
+ darkFantasyCinematic * 8
+ min(16, historyStrength)
+ popularityBoost           (min 8)
+ platformBoost             (0–6)
- multiplayerPenalty        (24 for moba/rts)
- cozyPenalty               (18)
- puzzleNoisePenalty        (20)
```

Final `possibleNext` = up to 2 external continuations + discovery fill to 4, one per franchise
family.

**This is the single biggest performance problem in the feature.** Two unbounded table scans
per dashboard render, with zero caching anywhere in the path (`unstable_cache` is documented in
`src/lib/cache/tags.ts` but never actually used in `src/lib`).

### 1.8 Franchise continuation detection

`src/lib/recommendations/v3/games/games-continuations.ts`, three tiers:

1. `KNOWN_FOLLOWUPS` — four hand-written rules (god-of-war→ragnarok, horizon→forbidden west,
   dark-souls→ds2, ff7→rebirth). Confidence `0.97` backlog / `0.94` external.
2. Mainline numbering — `extractMainlineSequence()` reads trailing arabic/roman numerals, plus
   a hardcoded marker table (`ragnarok`→2, `forbidden west`→2, `rebirth`→2, `remake`→1,
   `phantom liberty`→3, `scholar of the first sin`→2). If a completed entry in the same family
   has a lower sequence → confidence `0.94` / `0.90`.
3. `CONTINUATION_MARKERS` regex + fuzzy substring family match → `0.82` / `0.78`.

Family keys come from `normalizeFranchiseFamilyKey()` (`games-normalizers.ts:171`), a token-
stripping heuristic with a `FRANCHISE_FAMILY_FALLBACKS` escape hatch for cases it gets wrong
(currently Ghost of Tsushima/Yotei and FF7).

### 1.9 Confidence values

There is no probability model anywhere. Confidence is one of:

- **Backlog & discovery:** `Math.min(1, score / 100)` — the heuristic point total, divided by
  100. `games-recommendation-engine.ts:87, 105, 210, 222`.
- **Continuations:** the hardcoded literals above (0.78–0.97).
- **Taste profile as a whole:** `recommender.ts:673` — `coreGenres.length > 0 ? 0.85 : 0.35`.

The `/api/backlog/personal-suggestions` route then renders `(confidence * 10).toFixed(1)` as a
user-facing "score" (`route.ts:44`), turning an arbitrary point total into what looks like a
10-point rating.

### 1.10 Reasons / explanations

`src/lib/recommendations/v3/games/games-reasoning.ts` — pure string templates, 69 lines. Two
functions, ~6 possible sentence shapes total, e.g.

> `Matches your highest-confidence ${core.join(' + ')} taste built from ${evidence[0]} and ${evidence[1]}.`

They interpolate genre slugs (`role-playing-rpg`) which the UI then patches with
`TRAIT_LABEL_OVERRIDES` and a regex in `formatIdentitySummary()`.

### 1.11 UI

`src/app/components/dashboard/CategoryTasteProfileCard.tsx`, rendered from
`CategoryDashboardTabs.tsx`. The games branch is around line 430:

```ts
{ label: 'Core Genres',  traits: toIdentityTraits(gamesIdentity.coreGenres) },
{ label: 'Top Themes',   traits: toIdentityTraits(gamesIdentity.themes) },
{ label: 'Player Styles',traits: toIdentityTraits(gamesIdentity.playerStyles) },
{ label: 'Lower-Confidence Avoid Patterns', traits: negativeTraits },
```

Data arrives as `recommenderTasteProfile` on the dashboard section
(`category-data.ts:904`), parsed defensively by `parseGamesIdentityProfile()`.

`toIdentityTraits()` (line 373) is where your percentages are born — see §3.1.

The card also renders `profileNote.favorite_developers` as a "Favorite Studios" chip row
(line ~200), fed from `user_category_profiles`, entirely separate from the V3 engine.

### 1.12 Migrations

Two directories, per `.claude/skills/db-migration/SKILL.md`:
- `supabase-migrations/` — historical archive.
- `supabase/migrations/` — **current convention**: `YYYYMMDD_rcNNN_<description>.sql`,
  idempotent (`create table if not exists`, `add column if not exists`), RLS + explicit
  per-operation policies mandatory on user-data tables, `npm run db:types` afterwards to
  regenerate `src/lib/supabase/database.types.ts`.

Latest is `20260823_article_scheduling.sql`; next free number is `rc051`.

### 1.13 Existing caching infrastructure

Three things exist and one of them is directly reusable:

1. **`api_cache` table** (`supabase/api_cache.sql`) — `key text primary key, data jsonb,
   expires_at timestamptz`. Driven by `src/lib/api-cache/external.ts:cachedExternalFetch()`,
   which already does SHA-256 key hashing, TTL, service-role client, and graceful degradation
   when the table is missing (`42P01`). This is close to what an AI cache needs but it's
   TTL-only and keyed by URL, not by input hash — and it has no `user_id`, so no RLS story.
2. **Upstash Redis** — present (`src/lib/rate-limit/upstash.ts`) but wired only for rate limits.
3. **`src/lib/cache/tags.ts`** — Next.js tag constants and `revalidateTag` helpers. Grep shows
   **no `unstable_cache` call sites in `src/lib`**, so the tag system is invalidation-only right
   now; nothing in the recommendation path is cached.

Net: no recommendation-layer caching exists. Every dashboard load recomputes everything.

### 1.14 Existing AI/provider abstraction

**None.** `src/lib/ai/` does not exist. No `gemini`, `@google/generative-ai`, `@anthropic-ai`,
`openai`, or `GEMINI_API_KEY` anywhere in `src/` or `package.json`. This is greenfield.

### 1.15 Environment variables

Raw `process.env.X` at point of use, no zod env schema, no central `env.ts`. Server-only modules
guard with `import 'server-only'` (see `api-cache/external.ts:1`). Files: `.env.local`,
`.env.production`. Existing secret-shaped keys: `TMDB_API_KEY`, `MAL_CLIENT_ID`,
`GOOGLE_BOOKS_API_KEY`, `RESEND_API_KEY`, `TWITCH_CLIENT_*`, `SUPABASE_SERVICE_ROLE_KEY`,
`UPSTASH_REDIS_REST_*`. `GEMINI_API_KEY` would follow the same shape — server-only, no
`NEXT_PUBLIC_` prefix.

---

## 2. Current Strengths

Genuine, keep them:

1. **Clean separation of concerns per file.** taste engine / scoring engine / continuations /
   normalizers / reasoning are separate modules with explicit types. An AI layer can slot in
   without a rewrite.
2. **`normalizeGameIdentityKey()` is good work.** The iterative edition-stripping loop
   (`goty`, `director's cut`, `remastered`, `definitive edition`, roman→arabic, possessives)
   is the correct deduplication primitive, and it's already used to prevent recommending a game
   the user owns under a different edition. **This is exactly the "merge remaster editions"
   behavior you're asking about — it already exists.**
3. **Franchise-family diversity in output.** `pickFranchiseDistinctBacklog()` and the
   `selectedFamilyKeys` guard stop the classic "here are 4 Assassin's Creed games" failure.
4. **Progression awareness.** `computeNextStepPriority()` distinguishing "the literal next
   entry" (3) from "skipping ahead" (2) is a real, non-obvious insight most recommenders miss.
5. **Backlog is genuinely excluded from the taste engine.** `tasteWeight()` returns 0 for
   `planned`. Correct decision, already made.
6. **Hard exclusions are deterministic and reliable** — owned-id and identity-key filtering
   happens in three places, belt-and-braces.
7. **Every scoring decision is inspectable.** `toDebugMap()` attaches the full component
   breakdown to each recommendation. This makes AI-vs-deterministic A/B comparison cheap.
8. **Every consumer already parses defensively.** `parseGamesIdentityProfile()` returns `null`
   on bad shape and the card renders nothing. An AI layer that fails will degrade, not crash.

---

## 3. Current Weaknesses

### 3.1 The percentages are not what they look like — this is the headline problem

`toIdentityTraits()` (`CategoryTasteProfileCard.tsx:373`):

```ts
const total = signals.reduce((sum, item) => sum + item.weight, 0);
const pct = (item.weight / total) * 100;
```

`signals` has **already been sliced to the top 3** (top 2 for player styles). So:

- **They are shares of a truncated list, not of the library.** "Adventure 51%" means Adventure
  holds 51% of the weight *among the three genres that survived the cut*. Add a fourth genre
  and all three numbers change even though nothing about your taste changed.
- **They always sum to 100% by construction.** That's why Player Styles reads 71/29 — there are
  exactly two of them, so the split is forced. If only one style qualified it would read 100%.
- **They are not probabilities and not confidences.** The denominator is arbitrary.
- **The underlying weights are dimensionally incomparable.** `single-player narrative immersion`
  is a sum of genre net weights (unbounded, integer-ish). `franchise continuation focus` is
  `0.8 × completed_count`. Putting them in one normalization and rendering a percentage split
  is a category error — the "71% / 29%" is comparing apples to a headcount.
- **A user with 40 games and a user with 6 games get identically confident-looking numbers.**
  No sample-size term enters the percentage anywhere.

Verdict: **misleading, and I'd treat fixing this as higher priority than adding AI.** It is the
kind of number a user will screenshot and then discover is unstable.

### 3.2 It measures metadata frequency, not taste

Your suspicion is correct, and it's structurally correct — here's the proof:

- `Adventure` and `RPG` are literally IGDB genre strings, canonicalized. Nothing infers them.
- The **whole** entry weight is added to **every** genre. Baldur's Gate 3 tagged
  `[rpg, adventure, strategy, turn-based-strategy]` contributes its full favorite-weighted 6
  to four different genres. A game tagged only `[rpg]` contributes 6 to one. The first game is
  4× louder than the second for no reason related to taste.
- IGDB tags `Adventure` on almost every narrative game, which is exactly why Adventure lands at
  51%. That's a metadata prior, not a preference.
- **Your central example is exactly the failure mode.** Baldur's Gate 3, The Witcher 3, Final
  Fantasy X and Bloodborne all canonicalize to `role-playing-rpg`. The system sees one genre and
  four data points. It cannot represent "turn-based systemic freedom" vs "authored open world"
  vs "JRPG melodrama" vs "punishing atmospheric action" — those distinctions do not exist in
  its vocabulary. This is the strongest argument for the AI layer.

### 3.3 Labels are half-inferred, half-invented

Genres: directly from metadata. Themes: partly from `igdb_themes`, mostly **synthesized from
genre arithmetic** — "Narrative-Driven Worlds" is literally `(rpg_weight + adventure_weight) *
0.7` and appears whenever that sum ≥ 5. Player styles: **100% invented by four hardcoded
formulas** over the same genre weights.

So "Top Themes" and "Player Styles" are largely a *relabeling of the same two genre numbers*.
Core Genres shows `Adventure 51% / RPG 37%`; Themes shows `Narrative-Driven Worlds 35%`; Player
Styles shows `Single-Player Narrative Immersion 71%`. **These are three renderings of one
underlying variable.** They look like independent corroborating evidence to a user. They aren't.

Also: the vocabulary is closed. There are exactly 4 possible player styles and 4 possible
synthesized themes across all users on the platform.

### 3.4 Negative signals are not reliable

- Only **three** hardcoded dropped-game patterns exist, all substring matches on a joined genre
  string (`lowered.includes('moba')` against `genres.join(',')` — which will also match a genre
  containing "moba" as a substring anywhere).
- `adventure`, `role-playing-rpg`, `indie`, `platform` are **explicitly exempted** from ever
  becoming negative signals (`games-taste-engine.ts:120`). So the system is structurally
  incapable of learning "you drop RPGs" — the single most useful negative signal for an
  RPG-heavy user.
- Dropped weight (`-1` or `-2`) is applied whole to every genre of the dropped game, so
  dropping one 5-genre game emits 5 negative signals of full strength.
- The UI labels this section "Lower-Confidence Avoid Patterns" — which is honest, and also an
  admission that nobody trusts it.

### 3.5 Dropped games are weighted wrong in two directions at once

Under-weighted in the taste engine (`-1` / `-2` against a positive scale that reaches `+6`) and
then, separately, **counted as positive evidence in discovery scoring**:

```ts
// scoreDiscoveryCandidate → historyStrength, games-recommendation-engine.ts:414
const historyStrength = history.reduce((acc, entry) => {
  const overlap = ...;
  if (overlap === 0) return acc;
  const base = entry.isFavorite ? 2 : 1;
  const scoreBoost = entry.status === 'completed' ? (entry.score ?? 0) / 10 : 0.5;
  return acc + base + scoreBoost;
}, 0);
```

`history` here is the **full** history. A dropped game whose genres overlap the candidate adds
`+1.5` to that candidate's score. A **planned** game adds `+1.5` too. So:

> **Bug: dropped games increase discovery scores for similar games, and backlog games leak into
> discovery scoring.** Capped at 16 points, but 16 out of a 58-point threshold is decisive.

This is the concrete answer to "do backlog games accidentally influence taste": not in the
taste *profile* (correctly zeroed), but **yes in the recommendation scoring**, plus via
`familyClutterPenalty` and `sameFamilyBacklogCount`. Worth fixing regardless of AI.

### 3.6 Favorites and 9–10 ratings are under-weighted relative to noise

A favorite completed 10/10 game scores `1 + 2 + 3 = 6`. Six merely-completed unrated games score
`6` too. Given IGDB tags most narrative games `Adventure`, six shrugged-through completions can
out-vote your favorite game on any genre they happen to share. The `highSignalCount >= 2` gate
on core genres helps, but only for the core/secondary classification — not for the weights that
drive the percentages.

There is also no **recency** term anywhere. A game completed in 2016 and one completed last month
weigh identically. `updated_at` is loaded and never used.

And there is no **franchise deduplication in the taste engine**. Completing 5 Assassin's Creed
games emits 5 independent full-weight votes for `action`/`adventure`. Note that
`recomputeCategoryProfiles` already solved exactly this problem for developers/directors/actors
via `extractFranchiseKey` + per-family `max(points)` — **the fix exists in the codebase and was
never applied to the V3 taste engine.**

### 3.7 Confidence values are not meaningful

`score / 100` where `score` is a sum of hand-tuned integers clamped to 100. Concretely:
`coreMatch * 22` maxes at ~66 for 3 core genres; adding `narrativeFit`(14) and
`darkFantasyCinematic`(24) already clamps. So most good discovery candidates land at
confidence 1.00 and most marginal ones at 0.58–0.70 — **the distribution is bimodal and
saturated at the top**, which is the worst possible shape for a number displayed to users.
Then `/api/backlog/personal-suggestions` prints it as `score: "10.0"`.

Continuation confidences (0.97, 0.94, 0.90, 0.82, 0.78) are more defensible because they encode
*rule strength*, which is a real thing. Those are fine. Everything else is not calibrated.

### 3.8 Hardwired to one user's taste

Several constants are not general-purpose:
- The platform ladder is **PlayStation-first, hardcoded**: `ps5 → 6, ps4 → 4, ps3 → 2, ps2 → 0,
  pc → 2` in both `scorePlatformPreference` and `scoreCandidatePlatformPreference` — and it
  *ignores* the user's actual `preferredPlatforms` unless none of those match.
- `compareBacklogRank()` tie-breaks on `/ragnarok|forbidden west|rebirth|phantom liberty/`.
- `synthesizeThemes()` drops anything containing "psychological".
- All four `KNOWN_FOLLOWUPS` are PS-exclusive-ish AAA franchises.

This is fine as a bootstrap for a single-user product. It will not survive a second user with
different tastes, and no AI layer will fix it — it's downstream of the AI.

### 3.9 Performance

Full `media_items` games scan + full cross-user `user_media_entries` fetch for every remaining
candidate, on every dashboard render, uncached, in the request path. This is the constraint that
should shape the cache design more than the AI cost does.

---

## 4. Best AI Integration Point

**Your proposed architecture is right.** Concretely:

```
user_media_entries (games)
        │
        ▼
[D] deterministic preprocessing        ← franchise dedup, edition merge, evidence weighting
        │                                 NEW: this layer does not exist yet
        ├──────────────► [AI-1] semantic taste profile ──► cached by tasteHash
        │                                                        │
        ▼                                                        │
[D] candidate generation                                         │
    (loadDatabaseGames + scoring + continuations + exclusions) ◄──┘  (profile feeds scoring)
        │
        ▼
   top ~20 shortlist
        │
        ▼
[AI-2] reranker ──► cached by recHash          [D] fallback: deterministic top 4
        │
        ▼
   final 4 (+ AI explanations)
```

Division of responsibility — **agreed, with one adjustment**:

| Deterministic keeps | Why |
|---|---|
| Candidate retrieval | AI can't scan 10k rows; and it's the expensive part to cache |
| Hard exclusions (owned, edition variants, backlog dedupe) | Correctness, must be provable |
| Franchise continuation detection | Rule-based, already 0.9+ reliable, and *cheap* |
| Fallback path | Must work with the AI entirely absent |
| **Numeric percentages / any number shown as a quantity** | See §8 — do not let the model invent these |
| **Franchise dedup + evidence weighting** | Must be deterministic so the cache hash is stable |

| AI owns | Why |
|---|---|
| Semantic clustering across identical metadata (your BG3/Witcher/FFX/Bloodborne case) | Impossible deterministically without embeddings |
| Identity label + description | Genuine language task |
| Cross-metadata pattern naming ("authored cinematic worlds") | The current `synthesizeThemes` is a 4-branch parody of this |
| Negative-pattern *interpretation* from drops (deterministic supplies the drops) | The current 3 hardcoded rules are the weakest part of the system |
| Explanations / reasons | 6 templates today; this is the highest-value/lowest-risk win |
| Reranking a ≤20 shortlist | Semantic tie-breaking where the heuristic saturates at 1.00 |

**The one adjustment:** put a real deterministic preprocessing stage between the DB and the AI
that (a) merges editions via the existing `normalizeGameIdentityKey`, (b) applies franchise
`max()` dedup like `recomputeCategoryProfiles` already does, (c) computes the evidence tiers from
§6, and (d) emits a *stable, canonically-ordered* evidence document. That document is both the AI
input and the hash input. Without it, your cache key is unstable and your AI input is noisy —
you'd be paying a model to look at the same metadata-frequency problem.

Explicitly agreed on the anti-goal: no `entire database → AI`. Beyond cost, it makes exclusions
unprovable and every output unauditable.

---

## 5. Recommended Data Flow

Two independent AI calls, two independent caches, two independent kill switches.

**Call 1 — Taste Profile (slow path, rarely runs)**
1. Load history (all statuses, plus `studios`, plus `updated_at`).
2. Preprocess: edition merge → franchise grouping → evidence tiers → canonical evidence doc.
3. `tasteHash = sha256(canonical(evidenceDoc) + PROFILE_PROMPT_VERSION + MODEL_ID)`.
4. Hit `ai_taste_profiles` on `(user_id, category, hash)` → return.
5. Miss → provider call → zod validate → store → return.
6. Any failure → return the deterministic `buildGamesTasteProfile()` output, unchanged.

**Call 2 — Reranking (fast path, runs more often)**
1. Deterministic pipeline produces backlog + discovery candidates as today.
2. Take top ~20 (see §9), **excluding continuations** which bypass AI.
3. `recHash = sha256(tasteHash + canonical(candidateIds+scores) + backlogSignature +
   RERANK_PROMPT_VERSION + MODEL_ID)`.
4. Cache lookup → miss → provider call → validate → store.
5. Failure → deterministic order, unchanged.

Both AI calls **must be off the dashboard's synchronous render path.** Given
`generateGamesRecommendationsV3` is currently awaited inline in
`category-data.ts:829`, the profile card should follow the pattern the old plan already
proposed: render deterministic immediately, fetch the AI layer from a separate route, swap in
when it lands. That also makes the feature trivially killable.

---

## 6. Taste Evidence Weighting

### Verdict on your proposed rules

The tier *ordering* is right. Three problems with it as written.

**Problem 1 — "completed + score ≤ 4 → strong negative" is dangerous.** Someone who finishes a
game they rate 3/10 is usually finishing it *because* they're invested in the franchise, the
genre, or the story. Completion is itself a positive engagement signal fighting the rating.
Make it **mild negative** and let `dropped` carry the strong negative — dropping is the honest
behavioral rejection.

**Problem 2 — "dropped without rating → weak negative" is right, but for the wrong reason,
and it needs a progress gate.** Dropped at 5% progress means "didn't click, probably didn't
even sample the thing the genre is about." Dropped at 80% means "engaged deeply, then something
specific broke it" — a much stronger and much more *specific* signal. `progress` is already
loaded and currently unused. Use it.

**Problem 3 — "in progress → weak positive" undercounts.** Something the user actively chose to
start *right now* is a strong signal of *current* intent, which is what a recommender needs.
The risk is that they'll drop it — so weight it meaningfully but flag it as provisional.

### Recommended weighting

| Evidence | Weight | Note |
|---|---|---|
| completed + favorite + score ≥ 9 | **+10** | ceiling; the anchor titles |
| completed + favorite (no score / any) | **+8** | favorite is a deliberate act, trust it |
| completed + score 9–10 | **+7** | |
| completed + score 8–8.5 | **+5** | |
| completed + score 7–7.5 | **+2.5** | |
| completed + score 5–6.5 | **+0.5** | near-neutral, keeps it in the corpus |
| completed + score ≤ 4 | **−1.5** | mild, not strong — see Problem 1 |
| completed, no score | **+1.5** | see below |
| current, progress > 25% | **+2.5** | provisional |
| current, progress ≤ 25% or unknown | **+1.5** | |
| dropped + score ≤ 5 | **−7** | the strongest negative available |
| dropped + score 6+ | **−3** | "good but not for me" |
| dropped, no score, progress > 40% | **−5** | engaged then rejected |
| dropped, no score, progress ≤ 40% | **−2** | weak |
| planned | **0** | no taste evidence — agreed |

Then apply, in order:

1. **Franchise family max-collapse.** Group by `normalizeFranchiseFamilyKey`. A family
   contributes `max(weight) + 0.5 × (n_completed_in_family − 1)`, capped at `max × 1.6`.
   This is the `recomputeCategoryProfiles` pattern, softened so repeated completion *does*
   count — see below.
2. **Recency decay** on the *positive* side only: `× (0.75 + 0.25 × e^(−age_years / 4))`.
   Never decay negatives — "I don't like X" doesn't expire the way "I loved X" fades.
3. **No per-genre splitting.** Don't divide weight across genres and don't multiply it either —
   this weight attaches to the *title*, and the AI reads titles, not genre-weight vectors.
   Genre-count normalization is only needed if you keep feeding a numeric genre histogram, which
   §8 says you should for the deterministic bars.

### Your specific questions

**Should favorite multiply rating influence?** **No — use max/additive-with-ceiling, not
multiply.** Multiplication makes `favorite × 10/10` explode relative to `favorite × 8/10`, and
users favorite things for reasons uncorrelated with score (nostalgia, first-of-genre, comfort).
Treat favorite as a **separate axis** that raises the floor: `weight = max(scoreWeight,
FAVORITE_FLOOR) + FAVORITE_BONUS`. Also pass `isFavorite` to the model as a **flag**, not folded
into a number — "the user marked this a favorite" is semantically richer than any weight.

**Should repeated franchise completion matter?** **Yes, but sublinearly, and it means something
different from what the raw sum implies.** Completing 5 Assassin's Creed games is strong evidence
about *that franchise* and *comfort-loop tolerance*, and weak evidence about "action-adventure"
as a genre preference. Hence the `max + 0.5 × (n−1)` shape: the family stays loud, but not 5×
loud. Also surface `franchiseCompletionCount` to the model as an explicit field — "completed 5
entries in one series" is a personality trait the model can name, and the current
`franchise continuation focus` player-style is a crude attempt at exactly this.

**Should completion without rating count positively?** **Yes, mildly (+1.5).** Finishing a game
costs 20–60 hours. That is a costly signal and it is real. But most users rate selectively, so
unrated completions are the *majority* class for many libraries — weight them low enough that 10
of them can't out-vote two favorites. The current system gives them `+1` against a `+6` max,
which is roughly right; my table keeps that ratio.

**Should dropped-without-score count negatively or only weakly?** **Weakly by default, strongly
when progress is high.** See Problem 2. Also: exclude drops where `updated_at` is within ~7 days
of creation and progress is 0 — those are list-management noise (added, changed mind, never
launched), not taste.

**Should old and recent games weigh equally?** **No.** Mild decay on positives only, floor at
0.75 so a 15-year-old favorite still counts substantially. Taste evolves but formative games
stay formative — an aggressive half-life would be wrong. Include the completion date in the AI
payload regardless; "their last four completions are all X" is a pattern the model can spot that
no weight function will.

**Should duplicate/remaster editions be merged semantically?** **Yes — and you already have the
function.** `normalizeGameIdentityKey()` handles GOTY/Definitive/Remastered/Director's Cut/
Remake. Apply it in preprocessing: merge to one entry, take the **strongest** status
(completed > current > dropped > planned) and the **best** score, union the favorite flag. Note
one nuance: `Remake` is stripped by `normalizeGameIdentityKey` but *Final Fantasy VII Remake* and
*Final Fantasy VII* are genuinely different games. Flag remake-collapses in the payload rather
than silently merging them, and let the model see both titles.

**Should games with very different genres still be clustered semantically?** **Yes — this is the
entire justification for the AI layer.** Deterministic clustering operates on shared genre
tokens, so Disco Elysium (`rpg, adventure, point-and-click`) and Papers Please (`indie,
simulation, puzzle`) can never cluster, despite both being "authored, text-heavy, morally
uncomfortable systems." Only a semantic model bridges that. The corollary is that the *reverse*
also matters and is equally valuable: splitting one genre token into distinct preferences,
which is your BG3/Witcher/FFX/Bloodborne example.

---

## 7. Cache Design

### Is the two-hash split correct?

**Yes.** The taste profile changes on a different timescale than the candidate set, and the
expensive/slow call is the one that changes rarely. Splitting means adding one backlog item
doesn't burn a profile generation.

One correction to your proposal: **`tasteHash` should be an input to `recHash`, and you have that
right — but `recHash` also needs the deterministic candidate scores, not just a "candidate pool
version".** If the media library gains 200 games and the deterministic top-20 changes, the rerank
must invalidate. A coarse pool version won't catch that.

### What exactly to hash

**Taste hash** — over the *post-preprocessing* evidence document, never raw rows:

```
{
  v: 3,                       // preprocessing algorithm version
  entries: [                  // sorted by canonicalKey ascending
    {
      k: "<normalizeGameIdentityKey>",
      s: "completed",
      sc: 9.5 | null,
      f: true,
      p: 87 | null,           // progress bucket, see below
      fam: "<franchiseFamilyKey>"
    },
    ...
  ],
  prompt: "taste-v1",
  model: "gemini-2.5-flash"
}
```

- **Exclude `planned` entirely.** Agreed — matches `tasteWeight()` returning 0.
- **Exclude `updated_at`** and any raw timestamp. It changes on every trivial edit and would
  thrash the cache. If you want recency, bucket it: `completedYear` (integer) or a
  `recencyBucket` of `recent | mid | old`.
- **Bucket `progress`** to deciles. A 61%→62% progress tick must not invalidate a profile.
- **Exclude `mediaId`** — use the canonical identity key so re-adding a game under a different
  edition doesn't invalidate.
- **Round scores** to one decimal (they already are).

**Should genres/themes be in the taste hash?** **Yes, but as a stable per-title digest, not the
raw arrays.** The model sees the genres, so if `media_items.genres` gets re-enriched from IGDB
the profile *should* regenerate. But raw arrays are order-unstable across enrichment runs —
hash `sha256(sorted(canonicalGenres).join('|'))` truncated to 8 chars per title. That keeps the
hash stable under reordering and sensitive under real change.

**Recommendation hash:**

```
sha256({
  tasteHash,
  backlog: [sorted canonical keys of planned entries],
  candidates: [ {id, score:round(score)} sorted by id ],   // the deterministic top-N
  scorerVersion: "games-v3.1",
  prompt: "rerank-v1",
  model: "gemini-2.5-flash"
})
```

### Canonical sorting strategy

Sort by a stable string key (the canonical identity key, or `id` for candidates), ascending,
before serializing. Serialize with explicit field order — do **not** rely on `JSON.stringify`
of an object literal for ordering; write a small `canonicalize()` that emits arrays of tuples.
`Object.keys` order is insertion-order for string keys in practice, but relying on it across a
refactor is how cache bugs happen.

### SHA-256 or something else?

**SHA-256, via `node:crypto` `createHash`.** Reasons: `src/lib/api-cache/external.ts:44`
already does exactly this, so it's a codebase idiom; it's fast enough (microseconds on a few KB);
collisions are a non-issue; and it's server-only so no bundle-size argument for a faster
non-crypto hash. Store the full hex, index it. Don't reach for xxhash/murmur — there is no
performance problem here worth a dependency.

### Should model name affect cache validity?

**Yes, absolutely.** Different models produce materially different taste profiles. If you swap
Gemini Flash for Haiku and the cache doesn't invalidate, half your users are on one model's
output and half on the other's, with no way to tell which. Include the **exact model ID**, not
the provider name. Also store the model ID as a **column** on the cache row, not only inside the
hash — you'll want to query "how many users are on the old model" during a rollout.

### Should prompt version affect cache validity?

**Yes, and make it a manual constant, not a hash of the prompt string.** A hash of the prompt
text would invalidate every user's cache on a whitespace change. A hand-bumped
`PROFILE_PROMPT_VERSION = 3` gives you deliberate control over when to pay for a full
regeneration. Same for the output schema version — bump when you add a field.

### Separate tables, and one row per user or versioned rows?

**Two separate tables.** They have different write frequencies, different sizes, different TTLs,
and different failure semantics. One table with a `kind` column would work but you'd be
`jsonb`-typing two unrelated shapes and losing type safety in `database.types.ts`.

```sql
-- 20260824_rc051_ai_taste_profiles.sql
create table if not exists public.ai_taste_profiles (
  user_id       uuid not null references public.users(id) on delete cascade,
  category      text not null,
  input_hash    text not null,
  model         text not null,
  prompt_version int  not null,
  profile       jsonb not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, category)
);
create index if not exists ai_taste_profiles_hash_idx
  on public.ai_taste_profiles (user_id, category, input_hash);
alter table public.ai_taste_profiles enable row level security;
-- select policy: user_id = auth.uid();  writes: service role only
```

**One row per (user, category), overwritten on regeneration.** Not versioned rows. Reasoning:
you only ever read the current profile; versioned history means unbounded growth and a
`order by created_at desc limit 1` on every read. If you want history for evaluation, write it
to a separate append-only `ai_generation_log` gated behind a flag, and keep the hot path a
single-row primary-key lookup.

`ai_recommendation_cache` gets the same shape plus `expires_at` — the rec cache should have a
TTL *in addition* to the hash, because the global media library changes underneath it in ways the
hash captures only at generation time. 6–24h is right.

### Should this live in `user_category_profiles.profiles`?

**No.** See §16.7 — that's the old plan's approach and it's the wrong call now.

---

## 8. AI Output Schema

### Should the LLM invent percentages?

**No. Categorically no.** This is the most important recommendation in this document.

Reasons:
1. **They will not be reproducible.** Same input, same model, different day → 47% instead of
   51%. Users will notice the number moving with no library change, which reads as broken.
2. **They will not be calibrated.** LLMs produce numbers that *look* like a distribution because
   distributions appear in their training data. There is no estimator behind them.
3. **They will not sum correctly** without you post-processing them, at which point you're
   normalizing an invented number — worse than normalizing a computed one.
4. **You'd lose the one thing the current system has**: the percentages today are wrong in an
   *explainable* way. AI percentages would be wrong in an unexplainable way.
5. **Anchoring.** "RPG 37%" invites the user to reason about the 37. Nothing supports that.

**Recommendation: split the responsibility.**

- **Deterministic produces every number the user sees.** And fix it while you're there: compute
  the percentage over the **full weight mass**, not the top-3 slice, so a residual "Other"
  exists and the bars stop summing to a forced 100%. Cap at 5 shown, keep the denominator whole.
- **AI produces every label, grouping, and sentence.** Including — importantly — *which titles
  belong to which pillar*, which is a semantic judgment the deterministic layer cannot make.
- **For AI-originated concepts that have no deterministic weight** (a pillar like "authored
  cinematic worlds" spanning several genres), show a **band, not a number**: `Defining /
  Strong / Present / Emerging`. Derive the band from the **count and quality of evidence titles
  the AI cites**, computed deterministically:

  ```
  evidenceMass = Σ deterministicWeight(title) for cited titles
  Defining ≥ 60% of total positive mass
  Strong   ≥ 35%
  Present  ≥ 15%
  Emerging  < 15%   // or fewer than 3 evidence titles → always Emerging
  ```

  The model picks the titles; your code picks the band. The band is then *defensible*, and the
  user can click through to see the evidence.

This also solves §3.3: pillars stop being a relabeling of genre numbers, because their strength
is derived from *cited titles*, not from the genre weights.

### Critique of your proposed schema

```ts
interface GamingTasteProfile {
  identity:        { label; confidence; description }
  corePillars:     Array<{ name; confidence; description; evidenceTitles }>
  playerStyles:    Array<{ name; confidence }>
  negativeSignals: Array<{ name; confidence; description; evidenceTitles }>
  summary:         string
}
```

**Keep:**
- `identity.label` + `identity.description` — this is the headline feature and exactly the kind
  of thing a model does better than a formula. Keep it short (label ≤ 4 words).
- `corePillars` with `evidenceTitles` — **`evidenceTitles` is the single most valuable field in
  the schema.** It makes the output verifiable, enables the band computation above, and gives
  the UI something clickable. Make it **required, min 2**.
- `negativeSignals` with `evidenceTitles` — biggest upgrade over the current 3 hardcoded rules.
- `summary` — but cap it hard (≤ 45 words) or it will not fit the card.

**Remove:**
- **Every `confidence: number`.** Same argument as percentages — the model has no basis for
  emitting 0.82 vs 0.79. Replace with a `strength: 'defining' | 'strong' | 'present' |
  'emerging'` **computed by your code** from evidence mass. If you must have a model-side
  signal, let it emit `evidenceStrength: 'high' | 'medium' | 'low'` as a *qualitative
  self-assessment* and treat it as a tiebreak only, never as a displayed number.
- `playerStyles` as a **separate** array. Today it's a relabeled genre sum; in the new schema
  it would overlap `corePillars` heavily and the user sees the same idea twice. Fold it into
  pillars with a `kind: 'content' | 'behavior'` discriminator, or drop it. If you keep it, it
  must also carry `evidenceTitles` — a style claim with no evidence is the current system's
  problem restated.

**Missing — add these:**
- `contrasts: Array<{ within: string; distinction: string; titlesA: string[]; titlesB: string[] }>`
  — **the field that would actually deliver your stated goal.** "Within RPGs, you gravitate to
  systemic freedom (BG3, Divinity) over authored linearity (FFX)." No current output can express
  this and it is the most differentiated thing the model can produce.
- `dataQuality: { titleCount, ratedRatio, favoriteCount, sufficiency: 'rich'|'adequate'|'sparse' }`
  — **deterministic**, and it should gate the UI. A profile built from 6 games must present
  differently from one built from 80.
- `openQuestions: string[]` (0–2) — "you've only played one strategy game, so this is
  unconfirmed." Turns a limitation into a feature and sets user expectations honestly.
- `generatedAt`, `model`, `promptVersion`, `inputHash` on the envelope — required for debugging
  and rollout, kept out of the AI's output object.

**Should be deterministic, not AI:**
- All numbers and percentages.
- `dataQuality` (pure counting).
- Preferred platforms (already computed, correctly).
- Favorite developers/studios (already computed by `recomputeCategoryProfiles`).
- Franchise completion counts.
- Evidence-mass → strength band mapping.

### Suggested final shape

```ts
type AiGamingTasteProfile = {
  schemaVersion: 1;
  identity: { label: string; description: string };          // ≤4 words / ≤30 words
  pillars: Array<{
    name: string;                                            // ≤4 words
    kind: 'content' | 'behavior';
    description: string;                                     // ≤25 words
    evidenceTitles: string[];                                // 2–5, MUST exist in library
  }>;                                                        // 2–4 items
  contrasts: Array<{
    within: string;
    distinction: string;
    titlesA: string[]; titlesB: string[];
  }>;                                                        // 0–2
  negativeSignals: Array<{
    name: string;
    description: string;
    evidenceTitles: string[];                                // MUST be dropped/low-rated
  }>;                                                        // 0–3
  summary: string;                                           // ≤45 words
  openQuestions: string[];                                   // 0–2
};

// computed by your code after validation, never by the model:
type EnrichedProfile = AiGamingTasteProfile & {
  pillars: Array<... & { strength: 'defining'|'strong'|'present'|'emerging'; evidenceMass: number }>;
  dataQuality: { titleCount: number; ratedRatio: number; favoriteCount: number;
                 sufficiency: 'rich'|'adequate'|'sparse' };
};
```

---

## 9. Reranking Strategy

**Is 20 reasonable?** **Yes for discovery; 20 is a good number.** It's ~2–4k tokens of candidate
metadata, well inside a single cheap call, and large enough that the reranker has real choice.
Below ~12 the deterministic ordering dominates and you're paying for nothing; above ~40 you get
position bias and the model starts skimming. If you want a rule: **shortlist ≈ 5× the final
count.** For backlog, the pool is usually small enough to send whole (cap at 20 anyway).

**Should continuations bypass AI?** **Yes.** They're already 0.90+ confidence rule matches, they
are the highest-satisfaction recommendation type, and letting a model demote "God of War
Ragnarök after you finished God of War" is pure downside. Reserve their slots deterministically
(max 2, as today) and rerank only the remaining slots. Exception worth allowing later: let the
AI *reorder among* multiple competing continuations, never remove one.

**Should AI rank backlog and discovery separately?** **Yes, two separate calls.** They answer
different questions — "what should I play next from what I own" vs "what should I acquire" — and
the judgment criteria differ (backlog weighs mood/length/fit-right-now; discovery weighs novelty
and taste-extension). Mixing them into one ranked list means the model implicitly trades them
off, and the UI presents them as separate sections anyway. Two calls also means one can fail
independently. Cost is not a real objection at these token counts.

**Should final score combine deterministic + AI?** **Yes — never let AI order alone.** A pure AI
ordering has no floor and no auditability.

```
final = 0.6 × deterministicNormalized + 0.4 × aiNormalized
```

Start at **60/40 deterministic-favoured** and hold it there through Phase 2. Rationale: the
deterministic score encodes hard-won domain rules (progression priority, platform, franchise
clutter) that the model doesn't see; 40% is enough for the reranker to move an item several
places but not enough to let one bad generation wreck a list. Normalize both to 0–1 over the
shortlist (min-max within the 20) before combining — the raw deterministic score saturates at
100 for many candidates (§3.7), so min-max is doing real work here.

Revisit the weight only with A/B data, and move in 10-point steps.

**Should AI be allowed to reject a candidate entirely?** **Soft reject only.** Let it return
`exclude: true` with a `reason`, and treat that as a large score penalty (e.g. −0.5 on the
normalized AI term) rather than a hard removal. Two safeguards: **cap total exclusions at 25% of
the shortlist**, and **never let exclusions drop the final list below the requested count** —
if they would, fill from deterministic order. A model that returns `exclude: true` for 18 of 20
candidates should be treated as a failed generation, not obeyed.

**Preventing hallucinated candidate IDs.** Layered:
1. **Use short opaque indices, not DB ids.** Send `[{ ref: "c1", title, genres, year }, ...]`
   and require the model to return `ref` values. `c1..c20` is a tiny closed vocabulary that's
   much harder to hallucinate into than a 6-digit integer, and it prevents the model from
   pattern-matching on real IGDB ids.
2. **Validate every returned ref against the sent set.** Drop unknown refs silently, log a
   metric.
3. **Require a permutation.** If the returned set isn't a subset of the sent set, or if
   `returned.length < 0.7 × sent.length`, discard the whole generation and fall back.
4. **Never let AI output introduce a title.** The reranker reorders; it does not suggest. Any
   title the model names that wasn't in the input is a validation failure.

**Validating AI output — the full ladder:**
1. **Structured output at the provider level.** Gemini `responseSchema` /
   `responseMimeType: 'application/json'`; Anthropic tool-use with an `input_schema`. Never
   parse free text.
2. **Zod schema** in `src/lib/validation/` — the codebase already standardizes on Zod. Parse,
   don't trust. Reject on extra/missing fields.
3. **Referential integrity.** Every `evidenceTitles` entry must match a real library title
   (compare via `normalizeGameIdentityKey`, not raw string equality). Every `ref` must exist.
   Every negative-signal evidence title must actually be `dropped` or low-scored — a model
   citing a favorite as evidence of aversion is a hard fail.
4. **Sanity bounds.** Array lengths, string lengths (a 300-word "summary" breaks the card),
   no markdown, no `you`-address if the copy voice is third person.
5. **On any failure: use the deterministic result and log.** Do not retry inline on the request
   path — a retry doubles latency to save an output the user will never notice is missing. One
   retry is acceptable in a background job.

---

## 10. Gemini vs Claude Haiku

| | Gemini 2.5 Flash / Flash-Lite | Claude Haiku 4.5 |
|---|---|---|
| Structured JSON | `responseSchema` — constrained decoding, schema enforced by the API. Strongest guarantee of the two. | Tool-use with `input_schema`; very reliable in practice, enforced by the model rather than the decoder. |
| Semantic taste analysis | Good. Flash-Lite is noticeably weaker at the nuanced "these four RPGs are different" judgment — that's the hard part of your ask. | Stronger at nuanced qualitative distinctions and at writing prose that doesn't read as generated. This is the differentiating task. |
| Reranking a 20-item list | Fine. Reranking is an easier task than profiling. | Fine. |
| Latency | Flash-Lite is the fastest option available. Both are sub-2s at these token counts. | Comparable; slightly behind Flash-Lite. |
| Token usage | Identical inputs. Gemini's tokenizer is marginally more compact on structured input. | — |
| Price | Cheapest of the two, meaningfully so at Flash-Lite tier. | Higher per token, still trivial at this volume. |
| Free tier | **Yes** — real free tier via AI Studio, which is the decisive practical difference for prototyping. | No free tier. |
| Implementation complexity | `@google/generative-ai` SDK; `responseSchema` uses a restricted OpenAPI subset, so schema translation needs care. | `@anthropic-ai/sdk`; tool-use JSON schema is more expressive. Prompt caching available if the evidence doc grows. |
| Reliability | Good; occasional schema-subset friction on nested unions. | Good; well-behaved on complex nested schemas. |

**Cost is not a deciding factor here.** At ~3k input / ~800 output tokens, cached by hash and
regenerating only on real library change, a 1,000-user base generates a few thousand calls a
month on either provider. Both are in the low single-digit dollars.

### Recommendation

**Yes — start with Gemini.** You have the key, the free tier removes the "is this worth paying to
find out" question entirely, and `responseSchema` gives the strongest structural guarantee while
you're still discovering what the schema should be. Use **Flash, not Flash-Lite**, for the taste
profile — Flash-Lite's weakness is precisely the semantic-nuance task you care about. Flash-Lite
is fine for reranking.

**But build the abstraction on day one.** Not a heavy one — a single interface:

```ts
// src/lib/ai/provider.ts
export interface AiProvider {
  readonly id: string;                        // exact model id → goes in the cache hash
  generateStructured<T>(args: {
    system: string;
    user: string;
    schema: ZodSchema<T>;
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<T>;
}
```

with `src/lib/ai/providers/gemini.ts` and, later, `anthropic.ts`. Zod is the source of truth;
each provider translates it to its own schema format. Selection via `AI_PROVIDER` env var. That's
maybe 120 lines and it makes the eventual comparison a config change instead of a refactor.

The real reason to keep the door open: **taste profiling and reranking may want different
providers.** Profiling is a quality-sensitive, once-a-month, cache-heavy call where Haiku's
better qualitative judgment could be worth paying for. Reranking is a frequent, cheap,
latency-sensitive call where Flash-Lite is ideal. The abstraction lets you split them.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **AI call lands on the synchronous dashboard render path** | **High** | `generateGamesRecommendationsV3` is already awaited inline in `category-data.ts:829`. Adding a network call there adds its full latency to first paint. Separate route + client fetch, or background job. Non-negotiable. |
| Users perceive AI output as authoritative and it's subtly wrong | High | `evidenceTitles` everywhere; strength bands not percentages; `openQuestions` field; visible "based on 12 games" data-quality line. |
| Hallucinated evidence titles | High | Validate against library via `normalizeGameIdentityKey`; drop the whole generation on mismatch. |
| Cache thrash → cost blowup and inconsistent UX | Medium | Exclude timestamps, bucket progress, hash the post-preprocessing doc. Add a hard per-user generation rate limit (`LIMITER_CONFIGS`, e.g. 5/day) as a backstop independent of the hash. |
| Prompt injection via game titles from `media_items` | Medium | Titles are user-influenced (via admin import, and any future user-submitted media). Never place them where they can be read as instructions; wrap in a delimited data block; treat all model output as data. Existing schema validation catches most of the blast radius. |
| Cost scaling with user growth | Low-Medium | Hash cache + rate limit + `dataQuality` gate (don't generate below ~8 titles — the existing `DEFAULT_TASTE_PROFILE_MIN_ITEMS_THRESHOLD`). |
| Reranker degrades quality vs deterministic | Medium | 60/40 blend, continuations bypass, exclusion cap, and log both orderings for offline comparison before trusting it. |
| PWA/offline regression | Medium | Any new AI route must be `NetworkOnly` in the workbox config, like the other authenticated routes (`AGENTS.md` §PWA). A cached AI profile served to the wrong user would be a serious bug. |
| Provider lock-in | Low | The 120-line abstraction above. |
| Existing unbounded table scans get worse under new load | Medium | Independent of AI, but the profile/rec caches are the natural place to fix it — cache the *deterministic* result too. |

---

## 12. Migration / Rollout Strategy

1. **Deterministic fixes first, no AI.** §3.5's discovery-scoring leak, the 1000-row history cap,
   and the §8 percentage denominator. These are bugs; ship them independently so the AI rollout
   isn't credited or blamed for their effects.
2. **Preprocessing layer, no AI.** Build and unit-test the evidence document (dedup, franchise
   collapse, weighting, canonicalization, hashing). It's pure and fully testable. At this point
   nothing user-visible has changed.
3. **Provider abstraction + one route, feature-flagged off.** Env-gated on `GEMINI_API_KEY`
   presence — absent key means the feature simply doesn't exist, no error path.
4. **Shadow mode.** Generate profiles for your own account only, log them, render nothing.
   Compare against the deterministic output by hand for a week. This is where you find out
   whether the model actually distinguishes BG3 from FFX or just says it does.
5. **Opt-in for real users.** A `user_settings` flag, following the `feature-module` pattern.
   Deterministic profile stays visible; AI section renders beneath it, clearly attributed.
6. **Reranking, shadow first.** Log AI order vs deterministic order and the blended result
   without changing what's displayed. Only enable when you've looked at ~50 real comparisons.
7. **Default-on** only after both have run opt-in without incident.

Each step is independently revertible, and every step leaves the deterministic system as the
thing that renders if anything is missing.

---

## 13. Concrete Implementation Plan

**Phase 0 — deterministic corrections** (no new deps)
- Fix `historyStrength` in `scoreDiscoveryCandidate` to exclude `planned` and to subtract for
  `dropped` rather than add.
- Add explicit `.range()` pagination to `loadUserMediaHistory`.
- Add `studios` and keep `updated_at` in the history select.
- Change `toIdentityTraits` to normalize over full weight mass with an "Other" residual.
- Make `tasteWeight`'s dropped branch an explicit `status === 'dropped'` check with a safe
  default for unknown statuses.
- Tests in `src/lib/recommendations/v3/__tests__/`.

**Phase 1 — preprocessing** (no new deps)
- `src/lib/recommendations/v3/games/games-evidence.ts` — `buildGameEvidence(history)` →
  edition merge, franchise collapse, evidence tiers (§6), canonical ordering.
- `src/lib/ai/hash.ts` — `canonicalize()` + `sha256Hex()`, reusing the `node:crypto` idiom from
  `api-cache/external.ts`.
- Heavy unit tests: these two files are the foundation of both the AI input and the cache key.

**Phase 2 — provider abstraction**
- `src/lib/ai/provider.ts` (interface), `src/lib/ai/providers/gemini.ts`,
  `src/lib/ai/config.ts` (model ids, prompt versions, timeouts, `isAiEnabled()`).
- `npm i @google/generative-ai`; `GEMINI_API_KEY` in `.env.local` and Vercel.
- `import 'server-only'` at the top of every file here.

**Phase 3 — taste profile**
- Migration `20260824_rc051_ai_taste_profiles.sql` (§7) + `npm run db:types`.
- `src/lib/ai/taste/prompt.ts`, `schema.ts` (Zod), `generate.ts`, `cache.ts`.
- `src/app/api/dashboard/ai-taste-profile/route.ts` — `withApiRoute`, `requireAuth`, named
  rate limiter, returns `{ profile, source: 'ai'|'deterministic' }`.
- Add the route to the workbox `NetworkOnly` list.
- `CategoryTasteProfileCard.tsx` — lazy client fetch, deterministic card renders immediately.

**Phase 4 — reranking**
- Migration `rc052` for `ai_recommendation_cache`.
- `src/lib/ai/rerank/{prompt,schema,generate,cache}.ts`; `blendScores()` at 60/40.
- Wire into `pickPossibleNextRecommendations` behind a flag, continuations bypassing.
- `src/lib/ai/explain.ts` for reasons — fold into the rerank response, not a third call.

**Phase 5 — observability**
- Log per generation: latency, tokens, cache hit/miss, validation outcome, fallback reason.
- These are the numbers that tell you whether Phase 2 is worth keeping.

---

## 14. Files That Would Likely Need Modification

**New:**
```
src/lib/ai/provider.ts
src/lib/ai/config.ts
src/lib/ai/hash.ts
src/lib/ai/providers/gemini.ts
src/lib/ai/taste/{prompt,schema,generate,cache}.ts
src/lib/ai/rerank/{prompt,schema,generate,cache}.ts
src/lib/recommendations/v3/games/games-evidence.ts
src/app/api/dashboard/ai-taste-profile/route.ts
supabase/migrations/20260824_rc051_ai_taste_profiles.sql
supabase/migrations/20260824_rc052_ai_recommendation_cache.sql
+ co-located __tests__ for each
```

**Modified:**
```
src/lib/recommendations/v3/games/games-recommender.ts     accept optional AI profile; use evidence layer
src/lib/recommendations/v3/games/games-recommendation-engine.ts  historyStrength fix; shortlist export; blend
src/lib/recommendations/v3/games/games-taste-engine.ts    franchise dedup; weighting per §6
src/lib/recommendations/v3/games/games-types.ts           new result fields
src/app/components/dashboard/CategoryTasteProfileCard.tsx percentage denominator; AI section; strength bands
src/lib/dashboard/category-data.ts                        keep AI off the sync path
src/lib/rate-limit/upstash.ts                             add aiTasteProfile / aiRerank limiters
src/lib/supabase/database.types.ts                        regenerated
next.config.ts                                            NetworkOnly for the AI route
package.json / .env.local / .env.production               dep + GEMINI_API_KEY
AGENTS.md, ARCHITECTURE.md, CRITICAL_FLOWS.md             document the new layer + its invariants
```

---

## 15. Things That Should NOT Be Changed

1. **`normalizeGameIdentityKey()`** — it is the deduplication contract. It's used for library
   exclusion, franchise families, and (proposed) cache keys. Changing it silently invalidates
   every cached profile and can un-exclude owned games.
2. **Backlog contributing zero taste weight.** Correct today, keep it.
3. **Hard exclusion of owned titles and edition variants.** Three redundant checks; keep all
   three. AI must never be able to reintroduce an owned game.
4. **Continuation detection.** Rule-based, high precision, cheap. Don't hand it to a model.
5. **The deterministic path as an unconditional fallback.** Every consumer must render correctly
   with zero AI involvement, forever.
6. **`withApiRoute` + `requireAuth` on every new route** (`AGENTS.md`).
7. **PWA caching rules.** Authenticated routes stay `NetworkOnly`; the library-add queue and
   `library-add-sync` tag are untouchable (`CRITICAL_FLOWS.md`).
8. **Diary encryption.** Unrelated, but any `src/lib/` refactor must not drift near it.
9. **`recomputeCategoryProfiles` franchise dedup logic.** It's correct and it's the template for
   the taste-engine fix — extend it, don't rewrite it.
10. **The legacy redirects in `next.config.ts`.**

---

## 16. Comparison Against `TASTE_PROFILE_PLAN.md`

### 16.1 What of the old plan was implemented

**Track A: fully implemented, and correctly.** Verified in
`src/lib/profile/recompute-category-profiles.ts` (423 lines):

| Old plan step | Status |
|---|---|
| `extractFranchiseKey` helper | Done — line 28 |
| `buildCreditMaps` with per-family `max(points)` for directors | Done — lines 45–105 |
| Actors gated at 2+ distinct franchise families | Done — line 97ff |
| `buildStudioMap` franchise-deduped | Done — lines 108–133 |
| Games `favorite_developers` from `media_items.studios` | Done — lines 396–407 |
| Anime `favorite_studios` with the same dedup | Done — lines 379–390 |
| `topNames` limit raised 3 → 5 | Done — line 191, `limit = 5` |
| Render in `CategoryTasteProfileCard` | Done — "Favorite Studios" / "Favorite Directors" / "Favorite Actors" chip rows |
| Threshold guard | Done — `DEFAULT_TASTE_PROFILE_MIN_ITEMS_THRESHOLD = 8` |

**Track B: not implemented at all.** No `src/lib/ai/`, no Gemini dependency, no
`GEMINI_API_KEY`, no `/api/dashboard/taste-narrative` route, no `narrative` field anywhere in
`user_category_profiles`. Zero lines exist.

### 16.2 What was never implemented

All of Track B. Plus, notably, **Track A's insight was never carried into the V3 taste engine** —
franchise dedup exists for people/studios and does not exist for genres/themes, which is where
it matters most for the numbers users actually see.

### 16.3 Which deterministic ideas are still valuable

**Still valuable, high priority:**
- **Franchise `max()` collapse instead of summing.** The plan's core insight — "directing all
  three LotR films is one creative vision, not three independent signals" — is *exactly* the
  §3.6 problem in the games taste engine. The reasoning transfers verbatim from Elijah Wood to
  "Adventure 51%".
- **Breadth requirement before a signal is trusted.** The 2+-franchise-families gate for actors
  is the right shape for a general rule: *a signal that appears in only one franchise describes
  the franchise, not the user*. Apply it to genres and especially to negative signals.
- **The data-sufficiency threshold.** Already implemented; extend it to gate AI generation.

**Still valuable, lower priority:**
- Showing derived people/studio chips — done, works, keep.

**Superseded:**
- The narrative-only framing (see §16.8).

### 16.4 Should franchise dedup run before building AI taste evidence?

**Yes — and it's more important for the AI than it was for the deterministic path.**

Two independent reasons:

1. **Signal quality.** An evidence document listing 5 Assassin's Creed entries as 5 equal data
   points will lead the model to conclude that AC-style action-adventure is the user's defining
   pillar. That's the Elijah Wood bug reappearing in a more expensive form. The model has no way
   to know that four of those were completed on autopilot.
2. **Cache stability and cost.** Fewer, canonical entries → shorter, more stable hash input →
   fewer regenerations → lower cost. Edition merging in particular (Witcher 3 vs Witcher 3
   Complete Edition) prevents a re-import from invalidating the cache for no semantic reason.

Two cautions: dedup for *weighting*, but still **show the model the full title list per family**
(`"Assassin's Creed ×5: Origins, Odyssey, Valhalla, ..."`) — the count is itself meaningful
(§6, "repeated franchise completion"). And keep remakes distinguishable rather than silently
collapsed.

### 16.5 Should developer/studio signals feed the new Gaming Taste Profile?

**Yes — this is the most under-used signal in the codebase.** `profiles.games.favorite_developers`
is already computed, already franchise-deduped, already rendered on the card — and
`generateGamesRecommendationsV3` reads exactly one field from that table
(`favorite_platform`) and ignores the rest.

Why it's valuable specifically for the AI layer: **studio is a much better proxy for design
sensibility than genre.** "FromSoftware, Larian, CD Projekt Red" tells a model far more about
taste than "RPG, Adventure, Action" does — it encodes difficulty philosophy, systemic vs
authored design, and narrative density in three tokens. It is precisely the semantic bridge that
distinguishes BG3 from Final Fantasy X, which genre metadata cannot.

Implementation notes: `media_items.studios` needs to be added to the history select (§13 Phase 0).
Include studios both in the evidence document **and** in the candidate metadata sent to the
reranker — "this candidate is by a studio whose other games you rated 9+" is a strong, cheap
signal. Do **not** add studio as another deterministic scoring term without measurement; let the
AI use it first.

### 16.6 Should the old 7-day cache be replaced by input hashing?

**Yes, replaced — but keep a TTL as a secondary bound.**

The old plan's rule was "regenerate if older than 7 days **OR** ≥3 new entries since last
generation." Both halves are wrong:
- **Time-based expiry regenerates when nothing changed.** A user who added no games in 3 months
  pays for ~13 pointless generations, each of which may return a *different* profile — so their
  identity label drifts for no reason. That's a UX bug, not just a cost bug.
- **"≥3 new entries" ignores what changed.** Adding 3 backlog items triggers regeneration despite
  zero taste evidence changing. Rating a single game 10/10 and favoriting it — the single
  strongest possible signal — triggers nothing.

Input hashing fixes both: it regenerates **exactly when taste-relevant input changed**, and it
makes the output deterministic-ish and stable. That directly serves the user-facing property you
want: *your profile changes when your library changes, and only then.*

Keep a long TTL (30–90 days) purely as a safety valve for model/prompt drift you forgot to
version-bump, and keep the rate limiter as an independent cost backstop. The old plan's *cache-
first, never-on-every-load* instinct was right; only the invalidation trigger was wrong.

### 16.7 Is `user_category_profiles.profiles` still the right home?

**No. Use a separate table.** The old plan chose the jsonb column to avoid a migration — a
reasonable trade for a single 60-word string, and the wrong trade for what you're building now.

Against reusing it:
- **Write contention.** `recomputeCategoryProfiles` rewrites `profiles` after every library
  mutation. An AI writer touching the same jsonb races with it; last-write-wins silently drops
  one side. The old plan's payload was one string, so this barely mattered. A full profile object
  plus hash plus model metadata makes it a real corruption risk.
- **Different lifecycles.** Derived profiles are recomputed cheaply and often; AI profiles are
  expensive and rare. Different invalidation, different cost, different failure modes.
- **No queryability.** "How many users are on prompt version 2?" or "which profiles are stale?"
  requires scanning and unpacking jsonb for every user. Columns + indexes make this trivial, and
  you *will* need it during rollout.
- **Row size.** Six categories × a rich profile object in one row makes every read of
  `favorite_platform` drag the whole payload. The recommender reads that column on every
  dashboard load.
- **Different access control.** AI rows are service-role-written, user-read. Mixing them with
  user-derived data muddies the RLS story.
- **The migration is cheap.** `.claude/skills/db-migration/SKILL.md` makes this a 20-line
  idempotent file plus `npm run db:types`. Avoiding it is not a real saving.

Keep `user_category_profiles` for what it is: cheap deterministic derivations. **Do** read
`favorite_developers` and `favorite_platform` from it as AI *input*.

### 16.8 Is the narrative-only approach now too limited?

**Yes — but it was the right first step, and one piece of it should survive.**

Where it's too limited: the old plan explicitly says *"Gemini is not reasoning, just formatting"*
and the prompt is fed pre-computed percentages (`Adventure (42%), Fantasy (38%)`). That means the
model can only paraphrase the metadata-frequency output. **It would launder §3.2's weakness into
confident prose** — the exact failure you're trying to escape. A fluent sentence built on
"Adventure 51%" makes the underlying problem *less* visible, not more.

It also can't do the thing you actually want. "Understand that BG3, Witcher 3, FFX and Bloodborne
are all RPGs but represent different preferences" requires the model to see **titles**, and the
old plan's prompt never sends a single title — only aggregated genre percentages. No prompt
engineering fixes that; it's an input problem.

What should survive from Track B, unchanged, because it was well-designed:
- **Lazy client-side fetch**, off the dashboard's critical path.
- **Silent degradation** to the deterministic summary on any failure.
- **Skip when the key is absent** — feature simply doesn't exist.
- **Skip below the data threshold.**
- **Rate limiting per user.**
- **Server-only key handling.**
- **`src/lib/ai/` as the module location.**

That error-handling table in the old plan is genuinely good and maps almost one-to-one onto §17.

### 16.9 Track B: discard / retain / upgrade

| Piece | Verdict |
|---|---|
| 7-day TTL cache | **Discard** → input hashing + long TTL backstop (§16.6) |
| Storage in `profiles` jsonb | **Discard** → dedicated table (§16.7) |
| "Gemini is not reasoning, just formatting" framing | **Discard** — it's the core limitation |
| Prompt fed percentages, no titles | **Discard** — makes the goal unreachable |
| Free-text output, no schema | **Discard** → structured output + Zod |
| `gemini-2.0-flash` | **Upgrade** → current Flash generation, model id in the hash |
| Direct SDK call in one file | **Upgrade** → provider abstraction (§10) |
| 60-word narrative | **Retain, as one field** — becomes `summary` in the richer schema |
| `src/lib/ai/` location | **Retain** |
| Lazy fetch off critical path | **Retain — important** |
| Fallback to deterministic on any error | **Retain — non-negotiable** |
| Per-user rate limit | **Retain**, add a hash-independent daily cap |
| Data-sufficiency threshold | **Retain**, and expose it in output as `dataQuality` |
| Server-only key | **Retain** |
| `GET /api/dashboard/taste-narrative` | **Upgrade** → `/api/dashboard/ai-taste-profile`, richer payload |

### 16.10 Does existing code conflict with the new architecture?

**No hard conflicts. Track B left no code behind, so there is nothing to unwind.** Track A's code
is an asset, not an obstacle. Four things to be deliberate about:

1. **`extractFranchiseKey` (recompute-category-profiles.ts:28) vs
   `normalizeFranchiseFamilyKey` (games-normalizers.ts:171) are two different franchise
   implementations.** They will disagree on edge cases. Pick one for the AI evidence layer — the
   V3 one is more sophisticated — and note the divergence rather than discovering it via a cache
   bug later. Unifying them is worthwhile but is its own task with its own test surface.
2. **`recomputeCategoryProfiles` writes `user_category_profiles.profiles` after library
   mutations.** That's the natural trigger point to invalidate/regenerate the AI profile — but
   don't make it *call* the AI synchronously; it runs in the mutation path.
3. **`games.adapter.ts` and the shared V3 pipeline are dead for games** (§1.1). Don't build the
   AI integration against them assuming games flows through — it doesn't. Either wire games into
   the generic pipeline first (larger task, out of scope here) or integrate against
   `games-recommender.ts` directly. Recommend the latter.
4. **Two taste-profile systems coexist** — `buildTasteProfile` in
   `src/lib/dashboard/category-data.ts` (bucket/percentage bars) and `buildGamesTasteProfile` in
   V3 (identity signals). The games card renders the V3 one; other categories render the
   dashboard one. Decide explicitly which the AI layer sits on top of, or the "which percentage
   is authoritative" question comes back later. Recommend: V3 for games.

### 16.11 Verdict on the two designs

The old plan and the new direction are not competitors — the new one is what the old one grows
into once you accept that the input, not the phrasing, is the limiting factor.

- Track A was **correct and is done**. Its central idea (franchise dedup before aggregation) is
  still the highest-value unapplied fix in the system — it just needs to move from
  people/studios to genres and themes.
- Track B was **the right shape at the wrong depth**. Its operational design (lazy, cached,
  degradable, key-gated, rate-limited) should be copied almost verbatim. Its model design
  (formatting-only, percentage-fed, title-blind, schema-less) should be discarded entirely.

Your proposed flow is a strict improvement, with one addition: **the "deterministic
preprocessing / deduplication" box is where Track A's proven insight belongs**, and it's the step
that makes both the AI input and the cache key sound.

---

## 17. Failure Handling

Governing rule: **the AI layer is additive. Its absence is a valid, complete state.** Never
surface an AI error to the user; the deterministic profile and recommendations are the product,
and the AI is an enhancement on top.

| Failure | Behavior |
|---|---|
| `GEMINI_API_KEY` missing | `isAiEnabled()` returns false at module load. Route returns `{ source: 'deterministic' }`. No error log beyond one boot-time info line. |
| Provider timeout | Hard `AbortController` at 8s (profile) / 4s (rerank). On abort: deterministic result, warn-level log with the hash. **No inline retry.** |
| HTTP 429 | Deterministic result. Set a short-lived Redis circuit-breaker key (`ai:cooldown:{provider}`, 5 min) so subsequent requests skip the call entirely rather than queueing behind a rate limit. |
| Invalid JSON | Provider-level structured output should prevent this. If it happens: discard, deterministic result, log the raw response (truncated) at error level — this indicates a real provider or schema problem worth alerting on. |
| Unknown candidate refs | Drop the unknown refs. If ≥30% are unknown, or the returned set isn't a subset of the sent set, discard the whole generation → deterministic order. Log a metric. |
| Provider down / network error | Deterministic result; circuit-breaker as with 429. |
| Zod validation fails | Discard, deterministic result, log the specific field path. This is the metric that tells you a prompt change regressed — track it. |
| Evidence titles don't match the library | Treat as validation failure (hallucination). Discard the whole profile — do not partially repair, because a model that invented one title is not trustworthy on the rest. |
| Cache table missing (not yet migrated) | Follow `api-cache/external.ts`'s pattern: detect `42P01`, log once, continue without cache. Feature works, just uncached. |
| Stale cache + provider down | **Serve the stale cache.** A slightly outdated AI profile beats no profile. Only the hash decides *whether to regenerate*, never *whether to serve*. |
| Generation succeeds but is empty (0 pillars) | Treat as failure → deterministic. An AI profile with nothing in it is worse than none. |

Every fallback path returns the same response shape with `source: 'deterministic'`, so the UI has
exactly one branch to handle and can optionally show a subtle "basic profile" affordance.

---

## Recommended Phase 1

**The smallest useful AI integration: a cached, evidence-grounded AI Gaming Taste Profile —
labels and prose only, no numbers, no reranking.**

Scope:
1. Deterministic preprocessing (`games-evidence.ts`): edition merge, franchise collapse,
   evidence weighting per §6, canonical ordering. **Fully testable with zero AI.**
2. `sha256` hashing of that document + prompt version + model id.
3. Minimal provider abstraction + Gemini Flash implementation.
4. One migration: `ai_taste_profiles`, one row per `(user_id, category)`.
5. One route: `GET /api/dashboard/ai-taste-profile?category=games`, `withApiRoute` +
   `requireAuth` + rate limit, returns `{ profile, source }`.
6. Output = `identity`, `pillars` (with required `evidenceTitles`), `negativeSignals`,
   `summary`, `openQuestions`. **No confidence numbers from the model** — strength bands
   computed from evidence mass.
7. UI: deterministic card renders exactly as today; AI section lazy-fetched and appended.

Explicitly **not** in Phase 1: reranking, explanations for individual recommendations, the
`contrasts` field, cross-category taste, any change to what the deterministic engine recommends.

Why this first: it's the highest-value/lowest-risk slice, it validates the two things you can't
know in advance — *does the model actually distinguish BG3 from FFX given your evidence
document*, and *does the hash cache behave* — and it cannot degrade the recommendations, because
it doesn't touch them. It also forces the preprocessing layer to exist, which every later phase
depends on.

Ship Phase 0's deterministic bug fixes alongside or before it, so the two effects are separable.

## Recommended Phase 2

**Once Phase 1 is validated (cache hit rate sane, evidence titles always real, output quality
holds across several real libraries):**

1. **AI reranking of the discovery shortlist.** Top 20 → AI → 60/40 blend → final 4.
   Continuations bypass. Shadow-logged for ~50 comparisons before it changes what's displayed.
2. **AI-generated recommendation explanations**, returned in the same rerank call — replacing
   the 6 templates in `games-reasoning.ts`. Highest perceived-quality-per-token in the whole
   design.
3. **Backlog reranking** as a second, separate call.
4. **The `contrasts` field** — "within RPGs you prefer X over Y". Once pillars are proven,
   this is the differentiating output.
5. **Extend to a second category** (anime has the same bespoke-engine shape), which is where the
   provider abstraction and the evidence-document pattern prove they generalize.
6. **Provider comparison** — run Haiku against the same cached inputs, compare profiles offline,
   and decide whether profiling and reranking should use different models.

Phase 3+, out of scope here: cross-category Taste DNA (`docs/PREMIUM_AI_PLAN.md`), embeddings,
and the premium tier — all of which the Phase 1 preprocessing layer sets up cleanly.
