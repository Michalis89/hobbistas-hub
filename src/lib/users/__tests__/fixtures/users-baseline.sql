-- Test fixture: public.users as it stands in production BEFORE
-- 20261123_rc057_users_privileged_columns.sql.
--
-- LOCAL TEST DATABASES ONLY. This drops and recreates public.users.
-- The integration test refuses to run against anything but localhost.
--
-- Reconstructed from the repo migrations (01, 03, 05, 08, 11, 28, 29, 49,
-- 20260923_demo_account) and the read-only production catalog checks:
--   - authenticated holds UPDATE on public.users, including roles and
--     account_status (here: Supabase's default privileges grant it, exactly as
--     in a real project);
--   - the only UPDATE policy is "Users can update own profile" USING
--     (auth.uid() = id), with no WITH CHECK;
--   - the only non-internal trigger updates updated_at.
-- Columns follow src/lib/supabase/database.types.ts.
--
-- One deliberate worst case: an own-row INSERT policy. The repo has none, but
-- the login fallback upserted with the user's JWT, so production may. With it
-- present, the tests prove INSERT is closed by privileges, not by luck.
-- Run as `postgres`, the role Supabase migrations run as.

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_verified on auth.users;
drop table if exists public.users cascade;
drop function if exists public.users_guard_privileged_columns() cascade;
drop function if exists public.update_user_last_login(uuid);
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_user_email_verified() cascade;
drop function if exists public.is_demo_account();
drop function if exists public.is_admin();
drop function if exists public.has_any_role(text[]);
drop function if exists public.update_updated_at_column() cascade;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null unique,
  display_name text,
  full_name text,
  bio text,
  avatar_url text,
  date_of_birth date,
  country text,
  timezone text,
  language_preference text,
  location_city text,
  privacy_settings jsonb,
  social_links jsonb,
  notification_settings jsonb,
  roles text[] not null default array['user']::text[],
  account_status text default 'active'
    check (account_status in ('active', 'suspended', 'banned', 'deleted')),
  email_verified boolean default false,
  is_demo boolean not null default false,
  last_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint users_roles_check
    check (roles <@ array['user', 'author', 'reviewer', 'moderator', 'admin', 'owner']::text[])
);

-- 03: updated_at
create function public.update_updated_at_column() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_users_updated_at
  before update on public.users
  for each row execute function public.update_updated_at_column();

-- 29: role helpers
create function public.has_any_role(required_roles text[]) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.roles && required_roles);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select public.has_any_role(array['admin', 'owner']);
$$;

-- 05 / 11: RLS
alter table public.users enable row level security;

create policy "Users are viewable by everyone" on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
create policy "Admins can delete users" on public.users for delete using (public.is_admin());
create policy "Users can delete own account" on public.users for delete using (auth.uid() = id);
create policy "fixture: own-row insert (worst case)" on public.users
  for insert with check (auth.uid() = id);

-- 08 / 29: auth sync (SECURITY DEFINER, owned by postgres)
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.users (id, email, username, display_name, roles, email_verified, created_at, updated_at)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
    array['user'],
    case when new.email_confirmed_at is not null then true else false end,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_verified() returns trigger as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.users set email_verified = true where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_email_verified
  after update on auth.users
  for each row execute function public.handle_user_email_verified();

-- 08: original last-login RPC (no caller check, EXECUTE for PUBLIC)
create function public.update_user_last_login(user_id uuid) returns void as $$
begin
  update public.users set last_login = now() where id = user_id;
end;
$$ language plpgsql security definer;

-- 20260923_demo_account: restrictive write lockdown
create function public.is_demo_account() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select u.is_demo from public.users u where u.id = auth.uid()), false);
$$;

create policy demo_account_no_insert on public.users as restrictive for insert
  to authenticated with check ((select public.is_demo_account()) is not true);
create policy demo_account_no_update on public.users as restrictive for update
  to authenticated using ((select public.is_demo_account()) is not true)
  with check ((select public.is_demo_account()) is not true);
create policy demo_account_no_delete on public.users as restrictive for delete
  to authenticated using ((select public.is_demo_account()) is not true);
