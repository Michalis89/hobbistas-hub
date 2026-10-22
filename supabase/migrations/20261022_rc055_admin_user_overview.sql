-- 20261022_rc055_admin_user_overview.sql
-- Purpose: one query for the admin users table's status and content columns.
--
-- The table showed account_status, which is the moderation state (active,
-- suspended, banned, deleted) and so read "active" for everyone. What an admin
-- needs to see is whether an account was ever really used:
--   - email confirmation and last sign-in come from auth.users, the source of
--     truth (public.users.email_verified disagrees with it for some accounts);
--   - how much the user created: library, diary, articles, comments, D&D
--     character sheets.
-- Returned for a page of users at a time, in one round trip instead of a
-- query per user per table.
--
-- Reads auth.users, so it is security definer. It is callable only by the
-- service role (the admin API route, after its own admin check); execution is
-- revoked from public, anon and authenticated so no user can read other
-- users' data through it. Counts only — diary content stays encrypted and is
-- never read.

create or replace function public.admin_user_overview(p_user_ids uuid[])
returns table (
  user_id uuid,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  library_count bigint,
  diary_count bigint,
  article_count bigint,
  comment_count bigint,
  character_sheet_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    ids.id as user_id,
    au.email_confirmed_at,
    au.last_sign_in_at,
    (select count(*) from public.user_media_entries e where e.user_id = ids.id) as library_count,
    (select count(*) from public.diary_entries d where d.user_id = ids.id) as diary_count,
    (select count(*) from public.articles a where a.author_id = ids.id) as article_count,
    (select count(*) from public.article_comments c where c.user_id = ids.id) as comment_count,
    (select count(*) from public.character_sheets s where s.user_id = ids.id) as character_sheet_count
  from unnest(p_user_ids) as ids(id)
  left join auth.users au on au.id = ids.id;
$$;

revoke all on function public.admin_user_overview(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_user_overview(uuid[]) to service_role;
