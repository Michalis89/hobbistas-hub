-- Adds ai_rerank_shadow_runs.blended_slot_media_ids.
--
-- The column is also declared in 20260826_rc053_ai_rerank_shadow.sql, but that file creates the
-- table with `create table if not exists`, so any environment where the table already existed
-- skipped it silently. This migration is the one that actually adds the column everywhere.
--
-- What it holds: the discovery slots the blend would have filled, produced by replaying the
-- deterministic selection rules (franchise dedup, continuation families already claimed, slot
-- budget) over the blended order. Stored rather than derived later, because replaying it after the
-- fact would need the continuation families that particular serve happened to claim, which is not
-- otherwise recorded. Without it the evaluator cannot compute top-slot divergence, which is the
-- headline number the shadow phase exists to produce.

alter table public.ai_rerank_shadow_runs
  add column if not exists blended_slot_media_ids bigint[] not null default '{}';
