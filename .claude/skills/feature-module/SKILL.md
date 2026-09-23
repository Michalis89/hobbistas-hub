---
name: feature-module
description: Add a new opt-in feature module or hobby vertical end-to-end, or add/rename a user-facing feature flag. Use when building something like the diary, D&D, social, or explore modules — anything that needs a user_settings toggle, a gated route, navbar entry, its own tables, and isolation from the core platform.
---

# Adding an opt-in feature module

Hobbistas is **core + opt-in modules**. The core (auth, profile, dashboard, media model, backlog, design system, shell, PWA) must stay stable; everything else is an additive slice that can be removed without destabilizing it.

A module qualifies as opt-in if a user who never enables it pays nothing: no navbar entry, no queries, ideally no bundle. Existing examples and their coupling: D&D (low, own tables), Diary (medium, own crypto), Social (medium, reads core data), Support (low, always on), Explore (medium), Reviews (medium, built on articles).

## The feature-flag chain — all six steps or the flag is half-wired

Flags live in a `user_settings` row. Adding one touches, in order:

1. **`src/lib/settings/types.ts`** — add the field to `UserSettingsValue`, and a value to `USER_SETTINGS_DEFAULTS`. **Default to `false`** for a new module; `true` only for something every existing user should already have.
2. **Migration** — add the column to `user_settings` with the matching default (see the `db-migration` skill), then `npm run db:types`.
3. **`src/app/api/settings/route.ts`** — add the field to the zod `settingsSchema` as `.optional()`. A field missing here is silently dropped on PATCH — the classic half-wired symptom: the toggle flips, then resets on reload.
4. **`src/app/(main)/settings/SettingsForm.tsx`** — initial state, the sanitizer branch, destructuring, and the `Switch` with `onCheckedChange={checked => handleToggle('<flag>', checked)}`.
5. **`src/app/components/Navbar.tsx`** — gate the nav entry on the flag so disabled modules are invisible.
6. **The page itself** — server-side guard (below).

## Page guard

Every gated page repeats this exact order — session, then flag, then data:

```tsx
const supabase = await createRouteHandlerClient();
const { data: { session } } = await supabase.auth.getSession();
if (!session) redirect('/auth/login');

const settings = await getUserSettings(session.user.id, { supabase });
if (!settings.my_feature_enabled) redirect('/settings');
```

Redirecting a disabled feature to `/settings` (not to home) is the established convention — it lands the user where they can enable it. See `src/app/(main)/dnd/page.tsx` and `src/app/(main)/explore/page.tsx`.

Client components inside the module read the flag through `useUserSettings(enabled: boolean)` (`src/lib/settings/useUserSettings.ts`, SWR-immutable over `/api/settings`; pass `false` when there is no session so it does not fetch) and render an "enable this in settings" state rather than blanking out — see `DiaryPageClient.tsx`.

**The flag is not a security boundary.** Any API route the module calls must independently enforce auth (and roles, if applicable). A flag controls whether a user *wants* the feature, not whether they are *allowed* it.

## Isolation rules

- Own tables, prefixed by the module (`dnd_campaigns`, `dnd_campaign_members`, `support_tickets`, …), with RLS.
- Routes under a single path segment (`/dnd/*`, `/diary/*`) and API routes under a matching prefix.
- Components in `src/app/components/<module>/`; module-only logic in `src/lib/<module>/`.
- Lazy-load heavy client code (`next/dynamic`) so users without the flag do not download it.
- Core files may reference the module in at most two places: the settings form and the navbar. If a third core file needs to know the module exists, the boundary is wrong.
- Reuse core primitives — `src/components/ui/`, the layout components, the media factory, `withApiRoute`, the roles helpers. A parallel implementation inside a module is the thing this architecture exists to prevent.

## New hobby vertical specifically

A hobby (as opposed to a generic feature) also needs:
- An entry in `src/config/hobbies.ts`: `slug`, `title`, `description`, Lucide `icon` name, `modules` (`backlog` / `news` / `reviews`, each `true | false | 'under-construction'`), `routes` per module, and `requiresAuth` per module.
- If it tracks media: a full category through the media factory — see the `media-category` skill. Do not build parallel add/search/library routes.
- Dashboard/backlog category lists in `src/lib/dashboard/category-data.ts`.

## Order of work

1. Migration + `npm run db:types`
2. Flag chain (steps 1, 3, 4, 5 above)
3. API routes (`api-route` skill) with tests
4. Pages (`app-page` skill) with guards and `noindex` metadata
5. Components (`ui-component` skill)
6. Tests, then `npm run ci`

Document the module in `ARCHITECTURE.md`'s opt-in table (key paths, coupling, flag name) as part of the same change. If it has do-not-break invariants, add a section to `CRITICAL_FLOWS.md`.
