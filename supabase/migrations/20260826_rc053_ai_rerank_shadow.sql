-- Phase 2 shadow reranking storage.
--
-- Two tables with deliberately different jobs:
--
--   ai_rerank_cache      one live row per (user, category, input hash). A spend gate: if the
--                        provider has already answered this exact question, do not ask again.
--
--   ai_rerank_shadow_runs  append-only observation log, one row per shadow execution including
--                        cache hits and failures. This is the evidence base for deciding whether
--                        AI reranking is worth showing anyone, so it must never be overwritten.
--
-- Combining them would force one to compromise: the cache wants upsert-by-hash and exactly one
-- row per input, the log wants many rows over time.
--
-- No titles in either table. media_id joins to media_items; copying titles here would turn an
-- analytics log into a duplicate of the user's library.

create table if not exists public.ai_rerank_cache (
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  rerank_input_hash text not null,
  ranking jsonb not null,
  model text not null,
  prompt_version text not null,
  schema_version integer not null,
  payload_version text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, category, rerank_input_hash)
);

-- Retention sweeps run oldest-first.
create index if not exists idx_ai_rerank_cache_created
  on public.ai_rerank_cache(created_at);

alter table public.ai_rerank_cache enable row level security;

drop policy if exists "Users can select own ai rerank cache" on public.ai_rerank_cache;
create policy "Users can select own ai rerank cache"
  on public.ai_rerank_cache
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own ai rerank cache" on public.ai_rerank_cache;
create policy "Users can insert own ai rerank cache"
  on public.ai_rerank_cache
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own ai rerank cache" on public.ai_rerank_cache;
create policy "Users can update own ai rerank cache"
  on public.ai_rerank_cache
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ai rerank cache" on public.ai_rerank_cache;
create policy "Users can delete own ai rerank cache"
  on public.ai_rerank_cache
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------------------------

create table if not exists public.ai_rerank_shadow_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  rerank_input_hash text not null,
  taste_input_hash text,
  -- Parallel arrays, all indexed by shortlist position.
  shortlist_media_ids bigint[] not null default '{}',
  deterministic_order bigint[] not null default '{}',
  deterministic_raw_scores numeric[] not null default '{}',
  ai_order bigint[] not null default '{}',
  blended_order bigint[] not null default '{}',
  -- What the user actually saw in the discovery slots, so behaviour can be joined back.
  served_slot_media_ids bigint[] not null default '{}',
  blend_version text,
  ai_weight numeric,
  -- { "<mediaId>": "one-line reason" }. Model text about the user's taste: user data, RLS-only.
  rationales jsonb,
  model text,
  prompt_version text,
  latency_ms integer,
  status text not null,
  failure_category text,
  cache_hit boolean not null default false,
  -- Whether the blend would have pushed the deterministic #1 below position 3. Recorded rather
  -- than clamped, so the rate at which the blend "wants" to do it is observable.
  rank_one_guard_triggered boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ai_rerank_shadow_runs_status_check
    check (status in ('success', 'skipped', 'failed'))
);

create index if not exists idx_ai_rerank_shadow_runs_user_created
  on public.ai_rerank_shadow_runs(user_id, created_at desc);

create index if not exists idx_ai_rerank_shadow_runs_hash
  on public.ai_rerank_shadow_runs(rerank_input_hash);

-- Retention sweeps.
create index if not exists idx_ai_rerank_shadow_runs_created
  on public.ai_rerank_shadow_runs(created_at);

alter table public.ai_rerank_shadow_runs enable row level security;

drop policy if exists "Users can select own ai rerank shadow runs" on public.ai_rerank_shadow_runs;
create policy "Users can select own ai rerank shadow runs"
  on public.ai_rerank_shadow_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own ai rerank shadow runs" on public.ai_rerank_shadow_runs;
create policy "Users can insert own ai rerank shadow runs"
  on public.ai_rerank_shadow_runs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ai rerank shadow runs" on public.ai_rerank_shadow_runs;
create policy "Users can delete own ai rerank shadow runs"
  on public.ai_rerank_shadow_runs
  for delete
  using (auth.uid() = user_id);

-- Deliberately no UPDATE policy: an observation that can be rewritten after the fact is not
-- evidence. Same reasoning as recommendation_events.
