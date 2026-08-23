create table if not exists public.ai_taste_profiles (
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  input_hash text not null,
  model text not null,
  prompt_version text not null,
  schema_version integer not null,
  profile jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create index if not exists idx_ai_taste_profiles_user_category
  on public.ai_taste_profiles(user_id, category);

alter table public.ai_taste_profiles enable row level security;

drop policy if exists "Users can select own ai taste profiles" on public.ai_taste_profiles;
create policy "Users can select own ai taste profiles"
  on public.ai_taste_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own ai taste profiles" on public.ai_taste_profiles;
create policy "Users can insert own ai taste profiles"
  on public.ai_taste_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own ai taste profiles" on public.ai_taste_profiles;
create policy "Users can update own ai taste profiles"
  on public.ai_taste_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ai taste profiles" on public.ai_taste_profiles;
create policy "Users can delete own ai taste profiles"
  on public.ai_taste_profiles
  for delete
  using (auth.uid() = user_id);
