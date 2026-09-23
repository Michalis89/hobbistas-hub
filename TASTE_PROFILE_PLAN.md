# Taste Profile — Implementation Plan

Two independent tracks. Track A is purely algorithmic — no new dependencies. Track B adds Google Gemini Flash for narrative generation only; the scoring engine stays algorithmic in both cases.

---

## Track A — Fix Directors / Actors / Creators Logic

### The Problem

The current `recomputeCategoryProfiles` fetches TMDB credits for the top 8 scored movies and sums weights per person across all entries. This means if you rate all three Lord of the Rings films 10+favorite (12 pts each), Elijah Wood accumulates 36 pts and becomes your #1 "favorite actor" — but you like the LotR franchise, not Elijah Wood as an actor.

**Root cause:** no franchise deduplication, and actors have no breadth requirement.

### Fix Rules

**Directors** — franchise deduplication only:
- Group the `selected` entries by `extractFranchiseKey(title)`.
- Per franchise group, a director's contribution = `max(points)` across that group, not the sum.
- Rationale: directing all three LotR films is one creative vision, not three independent signals. Peter Jackson still surfaces correctly, but his weight reflects one franchise, not three.
- Minimum to surface: appears in **1+ franchise families** (no change — a director who made one masterpiece is valid).

**Actors** — breadth requirement:
- Same franchise deduplication as directors.
- Additionally, an actor only qualifies if they appear in the credits of **2+ distinct franchise families** in the user's library.
- Elijah Wood only appears in `lord-of-the-rings` → filtered out.
- Viggo Mortensen appears in `lord-of-the-rings` + any other rated film → qualifies.
- Rationale: a single-franchise actor signal means you like the franchise, not the performer.

**Games** — developers:
- Games have no director/actor concept. The equivalent is **developer studio**.
- `media_items.studios` is already populated by IGDB for games.
- Add games to `recomputeCategoryProfiles`: build a `developersMap` weighted by the same `buildEntryWeight` logic, deduped by franchise family.
- Franchise family for games: `extractFranchiseKey(title)` (already works for "Assassin's Creed Origins", "Assassin's Creed Odyssey" → same family).
- Store result as `profiles.games.favorite_developers`.

**Anime** — studios already exist, extend logic:
- Currently stores `favorite_studios` from `media_items.studios`.
- Apply the same franchise deduplication: if you watched 5 seasons of a Bones-produced show, that's 1 franchise point for Bones, not 5.

**Books** — authors already exist, no change needed.

**Manga** — skip (tags field stores synonyms, not creators — already noted in code).

### Files to Change

| File | Change |
|---|---|
| `src/lib/profile/recompute-category-profiles.ts` | Full rewrite of the movies/tv block; add games block; add franchise dedup helper |
| `src/lib/supabase/database.types.ts` | No change (profiles is `jsonb`) |
| `src/lib/dashboard/category-data.ts` | Add `directors`, `actors`, `favoriteStudios`, `favoriteDevelopers` to `TasteProfileResult` |
| `src/lib/dashboard/server-data.ts` | Read derived fields from `user_category_profiles.profiles` and include in dashboard section |
| `src/app/components/dashboard/CategoryTasteProfileCard.tsx` | Render the new fields as chip rows below genres |

### Step-by-Step

#### Step 1 — Franchise dedup helper in `recompute-category-profiles.ts`

Add a utility that, given a list of `{ title, points, credits }` objects, builds the weighted maps with franchise dedup applied:

```ts
// Groups entries by franchise family.
// Directors: per family, contribute max(points).
// Actors: per family, contribute max(points) — but track family count.
// After processing, filter actors to those with familyCount >= 2.
function buildCreditMaps(
  entries: Array<{ title: string; points: number; credits: { directors: string[]; actors: string[] } }>
): { directorsMap: Map<string, number>; actorsMap: Map<string, number> }
```

Internal structure during build:
```ts
// Per person, track per-family max weights
type PersonAccumulator = Map<string, Map<string, number>>;
// key = person name, value = Map<franchiseKey, maxPoints>
```

Final weight for a person = sum of their per-family max weights.
Actor is included only if their accumulator has `size >= 2` franchise families.

#### Step 2 — Add games developers block

After the `anime` block in the category loop:

```ts
if (category === 'games') {
  const developersMap = new Map<string, number>();
  // Group by franchise family, take max(points) per family per developer
  // Source: toStringArray(entry.media_items?.studios)
  applyDerivedValue(target, 'favorite_developers', topNames(developersMap, 5));
}
```

#### Step 3 — Increase `topNames` limit

Change default from `3` to `5` for all derived people fields. Three is too few — with franchise dedup active, fewer people will qualify, so showing up to 5 compensates.

#### Step 4 — Extend `TasteProfileResult` in `category-data.ts`

```ts
export type TasteProfileResult = {
  // ... existing fields ...
  directors?: string[];        // movies, tv
  actors?: string[];           // movies, tv
  favoriteStudios?: string[];  // anime
  favoriteDevelopers?: string[]; // games
};
```

These are optional because: (a) not every category has them, (b) not enough data → field absent.

#### Step 5 — Pass data through `server-data.ts`

In `getCategoryDashboardSection` (or wherever `user_category_profiles` is read), extract the derived fields from `profiles[category]` and attach them to the response shape. No new DB query needed — already fetched.

#### Step 6 — Render in `CategoryTasteProfileCard.tsx`

Below the existing genre/tag chip rows, add a conditional section:

- **Movies / TV**: "Directors" chips + "Actors" chips — two separate rows with labels.
- **Games**: "Studios" chips row.
- **Anime**: "Studios" chips row (rename from current if already shown).
- All chips use the same chip style as existing tag chips — no new UI primitives.
- If the array is empty / absent → render nothing (no empty section).

#### Step 7 — Threshold: "Not enough data"

If `completed + current < 5` for a category, skip the people derivation entirely for that category and store nothing. The UI already has a `DEFAULT_TASTE_PROFILE_MIN_ITEMS_THRESHOLD = 8` guard — extend it to also hide people fields at the same threshold.

### Test Cases to Write

Located alongside existing tests in `src/lib/profile/__tests__/`:

1. **Franchise dedup — directors**: 3 LotR entries (same franchise) → Peter Jackson gets `max(12)` = 12, not 36.
2. **Breadth gate — actors**: actor only in LotR franchise → filtered out. Actor in LotR + Interstellar → included.
3. **Games developers**: Witcher 3 + Witcher 3 CE (same franchise) → CD Projekt Red gets `max(points)` not doubled.
4. **Below threshold**: 4 completed movies → people fields absent.

---

## Track B — Gemini Flash Taste Narrative

### What It Does

The V3 algorithmic engine produces structured signals (top genres, clusters, tone profile, directors, actors). Gemini Flash turns those signals into a single human-readable paragraph — the "taste summary" shown at the top of the taste profile card.

The scoring engine does NOT change. AI only touches the presentation layer.

### Why Gemini Flash (free tier)

- **1,500 requests/day free**, 1M tokens/minute.
- `gemini-2.0-flash` is fast (<1s) and cheap enough to cache aggressively.
- Package: `@google/generative-ai` (official Google SDK).
- No model training, no vectors, no embedding storage.

### Architecture

```
User opens taste profile tab
        │
        ▼
Cache check: profiles[category].narrative_cached_at < 7 days?
        │
   Hit ──────────────────────────────► return cached narrative string
        │
   Miss ▼
Collect signals from existing data:
  - topGenres (from TasteProfileResult)
  - clusters + toneProfile (from RecommendationResponse.tasteProfile)
  - directors, actors, developers (from Track A)
  - avoidedGenres (from UserScoringContext)
        │
        ▼
POST to Gemini Flash with structured prompt
        │
        ▼
Store result in user_category_profiles.profiles[category].narrative
Store user_category_profiles.profiles[category].narrative_cached_at = now()
        │
        ▼
Return narrative string to UI
```

### Cache Strategy

- Stored in `user_category_profiles.profiles[category].narrative` (existing `jsonb` column — no migration needed).
- Regenerated only when: user opens the tab AND cache is older than 7 days OR the user has added ≥3 new entries since last generation.
- **Never** regenerate on every page load — that wastes the free quota.
- A background recompute (same pattern as `recomputeCategoryProfiles`) triggers regeneration after meaningful library mutations.

### API Route

New: `GET /api/dashboard/taste-narrative?category=movies`

- Auth: `requireAuth`
- Wrapped in `withApiRoute`
- Rate limited: 5 requests per user per hour (Upstash limiter, key = `taste-narrative-${userId}`)
- Returns: `{ narrative: string; cachedAt: string }`
- If Gemini fails (network error, quota exceeded): return the existing algorithmic `toneSummary` from V3 as fallback — no error shown to user.

### Prompt Structure

The prompt is deterministic and minimal — Gemini is not reasoning, just formatting:

```
You are writing a taste profile summary for a media tracking app.
Given the following signals extracted from a user's library, write
a 2-3 sentence summary of their taste. Be specific, not generic.
Reference actual patterns, not just genre names. Do not use "you" — write in third person.
Do not invent information not present in the signals.

Category: movies
Top genres: Adventure (42%), Fantasy (38%), Drama (29%), Science Fiction (24%)
Tone clusters: Epic Fantasy Adventure (strong), Prestige Reflective Sci-Fi (moderate)
Tone profile: prestige epic narrative
Favorite directors: Peter Jackson, Christopher Nolan
Favorite actors: Viggo Mortensen
Avoided patterns: Horror, Comedy-first

Output: one paragraph, plain text, no markdown, max 60 words.
```

Keeping the output under 60 words ensures the narrative fits in the UI card without truncation.

### Files to Create / Change

| File | Change |
|---|---|
| `src/lib/ai/taste-narrative.ts` | New — Gemini client, prompt builder, cache read/write |
| `src/app/api/dashboard/taste-narrative/route.ts` | New — API route with auth + rate limit |
| `src/app/components/dashboard/CategoryTasteProfileCard.tsx` | Add narrative display at top of card |
| `.env.local` | Add `GEMINI_API_KEY` |
| `src/lib/dashboard/category-data.ts` | Add `narrative?: string` to `CategoryDashboardSection` (optional, lazy-loaded) |

### `src/lib/ai/taste-narrative.ts` — Structure

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export type TasteNarrativeSignals = {
  category: string;
  topGenres: Array<{ name: string; percent: number }>;
  toneClusters: string[];
  tonePrimary: string;
  directors?: string[];
  actors?: string[];
  developers?: string[];
  studios?: string[];
  avoidedPatterns?: string[];
};

// Build the prompt string from signals
function buildPrompt(signals: TasteNarrativeSignals): string { ... }

// Call Gemini Flash, return narrative string
export async function generateTasteNarrative(signals: TasteNarrativeSignals): Promise<string> {
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(buildPrompt(signals));
  return result.response.text().trim();
}
```

### `src/lib/ai/taste-narrative.ts` — Cache helpers

```ts
// Read cached narrative from user_category_profiles.profiles[category]
export async function getCachedNarrative(
  supabase: SupabaseClient,
  userId: string,
  category: string,
): Promise<{ narrative: string; cachedAt: string } | null>

// Write narrative back into profiles jsonb
export async function storeCachedNarrative(
  supabase: SupabaseClient,
  userId: string,
  category: string,
  narrative: string,
): Promise<void>
```

### Step-by-Step

#### Step 1 — Install dependency

```bash
npm install @google/generative-ai
```

Add `GEMINI_API_KEY` to `.env.local` (get free key from Google AI Studio).

#### Step 2 — Create `src/lib/ai/taste-narrative.ts`

Implement `buildPrompt`, `generateTasteNarrative`, `getCachedNarrative`, `storeCachedNarrative`.

#### Step 3 — Create `src/app/api/dashboard/taste-narrative/route.ts`

```ts
// GET /api/dashboard/taste-narrative?category=movies
// 1. requireAuth
// 2. Rate limit check (5/hr per user)
// 3. Read cached narrative → return if fresh (< 7 days)
// 4. Collect signals: read user_category_profiles + run V3 taste profile
// 5. Call generateTasteNarrative
// 6. Store in cache
// 7. Return { narrative, cachedAt }
// Fallback: if Gemini errors, return V3 toneSummary string instead
```

#### Step 4 — Lazy fetch in `CategoryTasteProfileCard.tsx`

The narrative is **not** fetched as part of the main dashboard load (which would slow everything down). It fetches independently when the taste profile tab is opened:

```ts
// Inside the component, on mount:
const [narrative, setNarrative] = useState<string | null>(null);

useEffect(() => {
  fetch(`/api/dashboard/taste-narrative?category=${category}`)
    .then(r => r.json())
    .then(data => setNarrative(data.narrative));
}, [category]);
```

Show a subtle skeleton/shimmer while loading. If the request fails silently, show nothing — the rest of the card (genres, tags, people) remains fully functional.

#### Step 5 — Display

At the top of the taste profile card, above genres:

```
┌─────────────────────────────────────────────┐
│ Your Taste Profile                          │
│                                             │
│ "Gravitates toward authored epic worlds...  │  ← narrative (italic, muted)
│  consistently rewards games and films..."   │
│                                             │
│ Top Genres  ████████ Adventure 42%          │
│             ██████   Fantasy   38%          │
│ ...                                         │
└─────────────────────────────────────────────┘
```

Style: `text-sm italic text-[--text-secondary]`, no border, no label. If absent (loading or no data), section simply absent — no layout shift since genres follow immediately.

### Error & Quota Handling

| Scenario | Behavior |
|---|---|
| Gemini returns error | Fall back to V3 `toneSummary` string |
| Quota exceeded (1500/day) | Same fallback |
| `GEMINI_API_KEY` not set | Skip narrative silently |
| Cache hit | Return immediately, no API call |
| User has < 8 items | Skip narrative (same threshold as genres) |

### Environment Variables

```
# .env.local
GEMINI_API_KEY=your_key_from_aistudio.google.com
```

Key is **server-only** — never exposed to client. The API route is the only caller.

---

## Implementation Order

1. **Track A first** — fixes a correctness bug, no external dependencies.
2. **Track B second** — depends on Track A having populated the directors/actors fields that feed the narrative prompt.

Track A and Track B are independent branches — Track B can gracefully degrade (falls back to `toneSummary`) even if Track A is not done yet.
