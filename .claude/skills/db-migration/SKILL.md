---
name: db-migration
description: Change the Supabase database — new table or column, index, RLS policy, trigger, constraint, or RPC function. Use whenever a feature needs schema work, when regenerating database types, when a query fails with a permission or constraint error, or when deciding which Supabase client may touch a table.
---

# Database changes

Supabase Postgres. Two migration directories exist and they are not interchangeable:

- `supabase-migrations/` — the historical numbered series (`01-create-tables.sql` … `35-create-steam-sync-jobs.sql`) plus feature files (`schema.sql`, `api_cache.sql`, `user_genre_affinity.sql`). This is the archive of how the schema was built.
- `supabase/migrations/` — the current convention: `YYYYMMDD_rcNNN_<short_description>.sql`, e.g. `20260425_rc050_user_media_entries_unique_constraint.sql`.

**Write new migrations in `supabase/migrations/` using the dated `rcNNN` convention.** Take the next free `rc` number and today's date. Never edit a migration that has already run — write a follow-up.

## Writing the migration

Make it idempotent so a re-run is harmless:

```sql
-- 20260822_rc051_add_media_items_foo.sql
-- Purpose: <one line — why this exists>

alter table public.media_items
  add column if not exists foo text;

create index if not exists media_items_foo_idx
  on public.media_items (foo);
```

Rules:
- Every new user-data table gets **RLS enabled plus explicit policies**. A table without RLS is readable by anyone holding the anon key. The pattern in this codebase is `user_id = auth.uid()` for owner-scoped rows, with separate policies per operation.
- Uniqueness that the application depends on must be a real constraint, not just application logic. `user_media_entries` relies on a unique `(user_id, media_id)` for its upserts — that guarantee lives in the DB.
- Adding a NOT NULL column to a populated table needs a default or a backfill step in the same migration.
- Destructive changes (drop column/table, narrow a type) need an explicit note in the migration header saying what data is lost and confirming it is intended.
- Triggers live alongside their table. The `diary_entries` table has a trigger enforcing encrypted-only writes — do not weaken it (see `CRITICAL_FLOWS.md` §1).

## After the migration

```
npm run db:types
```
Regenerates `src/lib/supabase/database.types.ts` from the live project. Commit it with the migration — the codebase types Supabase inserts against `Database['public']['Tables']['x']['Insert']`, so a stale types file silently breaks type safety instead of failing loudly.

Then run `npm run build`, which surfaces every call site the schema change invalidated.

## Choosing the client

| Context | Import |
|---|---|
| Client component (browser) | `@/lib/supabase-client` |
| React Server Component | `@/lib/supabase-server` |
| API route handler | `@/lib/supabase-route-handler` |
| Edge middleware | `@/lib/supabase-middleware` |
| Service role (server-only) | `@/lib/supabase/admin` |

The service-role client bypasses RLS entirely. Use it only for genuinely cross-user work — storage uploads, admin imports, system-initiated writes — and never import it anywhere reachable from the browser bundle. `SUPABASE_SERVICE_ROLE_KEY` must never appear in client code or a `NEXT_PUBLIC_` variable.

If a query "mysteriously returns nothing" through the normal client, the answer is almost always a missing RLS policy — fix the policy, do not switch the call to the admin client.

## Shared query helpers

Reusable queries belong in `src/lib/supabase/queries.ts` or a domain service under `src/lib/services/`, not inlined into a route for the second time.

## Checklist

- [ ] File in `supabase/migrations/` named `YYYYMMDD_rcNNN_*.sql`
- [ ] Idempotent (`if not exists` / `if exists`)
- [ ] RLS enabled + policies for any new user-data table
- [ ] Indexes for the columns the app actually filters and joins on
- [ ] Constraints backing every application-level upsert
- [ ] `npm run db:types` run and `database.types.ts` committed
- [ ] `npm run build` clean
