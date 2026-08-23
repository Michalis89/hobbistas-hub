-- Recommendation impression / interaction log.
--
-- Purpose: make it possible to say whether one ordering of recommendations performed better than
-- another. Nothing today records that a recommendation was ever shown, so no ranking change can be
-- evaluated against behaviour.
--
-- Design notes:
--   * serve_id is derived deterministically by the application from (user, surface, category,
--     ordered slots, coarse time bucket). Re-rendering the same recommendations produces the same
--     serve_id, so the unique index below collapses duplicates instead of inflating counts.
--   * No titles. media_id joins to media_items; duplicating titles here would turn this table into
--     a copy of the user's library.
--   * deterministic_rank is the rank the deterministic engine gave the item within its own
--     candidate list, kept so a later comparison has a baseline to measure against.

create table if not exists public.recommendation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  serve_id uuid not null,
  media_id bigint not null,
  category text not null,
  surface text not null,
  slot_index smallint not null,
  source text not null,
  subtype text not null,
  deterministic_rank smallint,
  event_type text not null,
  created_at timestamptz not null default now(),
  constraint recommendation_events_event_type_check
    check (event_type in ('impression', 'click', 'add', 'status_change')),
  constraint recommendation_events_slot_index_check
    check (slot_index >= 0 and slot_index < 64)
);

-- Collapses re-renders of an identical serve, and caps clicks at one per card per serve.
create unique index if not exists uq_recommendation_events_serve_media_type
  on public.recommendation_events(serve_id, media_id, event_type);

-- Evaluation reads are always "this user's events, most recent first".
create index if not exists idx_recommendation_events_user_created
  on public.recommendation_events(user_id, created_at desc);

-- Correlating a later library add back to the impression that preceded it.
create index if not exists idx_recommendation_events_user_media
  on public.recommendation_events(user_id, media_id, created_at desc);

alter table public.recommendation_events enable row level security;

drop policy if exists "Users can select own recommendation events" on public.recommendation_events;
create policy "Users can select own recommendation events"
  on public.recommendation_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own recommendation events" on public.recommendation_events;
create policy "Users can insert own recommendation events"
  on public.recommendation_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own recommendation events" on public.recommendation_events;
create policy "Users can delete own recommendation events"
  on public.recommendation_events
  for delete
  using (auth.uid() = user_id);

-- Deliberately no UPDATE policy: this is an append-only observation log. A row that can be
-- rewritten after the fact is not evidence of anything.
