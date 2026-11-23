-- 20261123_rc057_users_privileged_columns.sql
-- Purpose: stop signed-in users from changing their own roles, account status
-- and other server-owned columns on public.users (privilege escalation).
--
-- Before: `authenticated` held table-wide INSERT/UPDATE on public.users, and the
-- only UPDATE policy, "Users can update own profile" USING (auth.uid() = id),
-- limits which ROWS a user may touch, not which COLUMNS. Any signed-in user
-- could PATCH /rest/v1/users?id=eq.<self> with {"roles":["owner"]}, or lift
-- their own suspension by resetting account_status.
--
-- After:
--   1. anon has no INSERT/UPDATE on public.users. authenticated has no INSERT
--      and may UPDATE only the profile columns the app writes with the user's
--      own JWT (the profile editor and /api/me/location). The application keeps
--      the same list in src/lib/users/editableColumns.ts; a test fails if the
--      two drift apart.
--   2. A BEFORE INSERT OR UPDATE trigger refuses privileged column changes from
--      every role except an explicit allowlist, so a future over-broad GRANT
--      cannot silently reopen this.
--   3. update_user_last_login only touches the caller's own row, and anon can
--      no longer execute it.
--
-- Unaffected: the service role (admin user management, signup, email
-- confirmation, the login profile fallback) and the SECURITY DEFINER functions
-- that maintain the table (handle_new_user, handle_user_email_verified,
-- update_user_last_login), provided they are owned by a trusted role. Step 0
-- checks that and aborts otherwise.
--
-- DELETE privileges and all RLS policies are unchanged. No row is modified.
-- Re-runnable: every statement replaces or re-applies the same state.
--
-- Rollback: fix forward (grant UPDATE on a missed column). Do not restore
-- table-wide UPDATE: that reopens the escalation.

begin;

-- 0. Preconditions ---------------------------------------------------------
-- The guard trusts these roles to change privileged columns:
--   postgres       - migrations, the SQL editor, and the owner of the
--                    SECURITY DEFINER functions below
--   service_role   - server-side code using SUPABASE_SERVICE_ROLE_KEY
--   supabase_admin - Supabase platform maintenance
-- Inside a SECURITY DEFINER function current_user is the function's owner, so
-- the functions that legitimately write privileged columns must be owned by one
-- of these roles, or signup and email confirmation would start failing.
do $$
declare
  bad text;
begin
  select string_agg(format('%s (owner %s)', p.oid::regprocedure, pg_get_userbyid(p.proowner)), ', ')
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('handle_new_user', 'handle_user_email_verified', 'update_user_last_login')
    and pg_get_userbyid(p.proowner) not in ('postgres', 'supabase_admin');

  if bad is not null then
    raise exception 'users_privileged_columns: functions not owned by a trusted role: %', bad;
  end if;
end $$;

-- 1. Privileges ------------------------------------------------------------
-- Revoking the table-level privilege also removes any column-level UPDATE
-- grants, so the GRANT below is the complete list.
revoke insert, update on table public.users from anon, authenticated;

grant update (
  full_name,
  display_name,
  bio,
  avatar_url,
  date_of_birth,
  country,
  timezone,
  language_preference,
  location_city,
  privacy_settings,
  social_links
) on table public.users to authenticated;

-- 2. Defence in depth ------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is then the API role for PostgREST
-- requests (anon / authenticated, never the connecting `authenticator`), and
-- the owner inside SECURITY DEFINER functions. Deny by default: any role not
-- named here, including supabase_auth_admin, supabase_storage_admin and
-- dashboard_user, is refused.
create or replace function public.users_guard_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.roles is distinct from array['user']::text[]
       or new.is_demo
       or coalesce(new.account_status, 'active') <> 'active'
       or coalesce(new.email_verified, false) then
      raise exception 'public.users: privileged columns cannot be set by role %', current_user
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id                is distinct from old.id
     or new.roles          is distinct from old.roles
     or new.account_status is distinct from old.account_status
     or new.is_demo        is distinct from old.is_demo
     or new.email          is distinct from old.email
     or new.email_verified is distinct from old.email_verified
     or new.username       is distinct from old.username
     or new.last_login     is distinct from old.last_login
     or new.created_at     is distinct from old.created_at then
    raise exception 'public.users: privileged columns cannot be changed by role %', current_user
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- A trigger function cannot be called directly; this only removes the default
-- EXECUTE grant so the function does not show up as an API-callable RPC.
revoke all on function public.users_guard_privileged_columns() from public, anon, authenticated;

drop trigger if exists users_guard_privileged_columns on public.users;
create trigger users_guard_privileged_columns
  before insert or update on public.users
  for each row execute function public.users_guard_privileged_columns();

-- 3. update_user_last_login ------------------------------------------------
-- Previously SECURITY DEFINER with no caller check and EXECUTE for PUBLIC, so
-- anyone, anon included, could set any user's last_login. Same signature, so
-- the existing callers (login route, auth slice) are unchanged. CREATE OR
-- REPLACE keeps the owner verified in step 0.
create or replace function public.update_user_last_login(user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
     set last_login = now()
   where id = user_id
     and id = (select auth.uid());
end;
$$;

revoke all on function public.update_user_last_login(uuid) from public, anon;
grant execute on function public.update_user_last_login(uuid) to authenticated;

commit;
