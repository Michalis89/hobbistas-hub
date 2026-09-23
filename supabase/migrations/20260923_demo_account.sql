-- Demo account: a real, signed-in user whose session can read everything and
-- write nothing.
--
-- Read-only cannot be enforced in the UI. The profile editor, the diary and
-- the library all write to Supabase straight from the browser with the user's
-- own JWT, so anyone with dev tools open could write whatever they liked. The
-- boundary has to be in the database, which is what this migration builds.
--
-- The approach is RESTRICTIVE policies. Unlike the usual permissive ones,
-- which are OR-ed together and grant access, restrictive policies are AND-ed
-- with everything else and can only take access away. That means this file
-- composes safely with whatever policies each table already has: it never
-- needs to know them, and it cannot accidentally widen access.

alter table public.users
  add column if not exists is_demo boolean not null default false;

comment on column public.users.is_demo is
  'Marks the shared read-only portfolio account. Writes are refused by restrictive RLS policies.';

-- Partial index: the demo rows are a handful out of the whole table, and the
-- lookup below runs on every write.
create index if not exists users_is_demo_idx on public.users (id) where is_demo;

/**
 * True when the caller is signed in as a demo account.
 *
 * SECURITY DEFINER so the lookup is not itself filtered by the policies on
 * `users`, and STABLE so Postgres may evaluate it once per statement.
 */
create or replace function public.is_demo_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.is_demo from public.users u where u.id = auth.uid()), false);
$$;

revoke all on function public.is_demo_account() from public;
grant execute on function public.is_demo_account() to authenticated, anon;

do $$
declare
  target text;
  missing text[] := '{}';
  -- Every table a signed-in user can write to with their own JWT. Tables only
  -- ever written by the service role are absent on purpose: the service role
  -- bypasses RLS, so a policy here would be dead weight.
  targets text[] := array[
    'users',
    'user_settings',
    'user_category_profiles',
    'user_genre_affinity',
    'user_media_entries',
    'user_integrations',
    'diary_entries',
    'diary_key_salts',
    'share_tokens',
    'articles',
    'article_revisions',
    'article_comments',
    'article_comment_likes',
    'article_likes',
    'article_media_links',
    'support_tickets',
    'support_messages',
    'support_attachments',
    'support_ticket_reads',
    'push_subscriptions',
    'campaigns',
    'campaign_members',
    'campaign_sessions',
    'campaign_assets',
    'campaign_handouts',
    'campaign_locations',
    'campaign_npcs',
    'campaign_quests',
    'campaign_entity_links',
    'campaign_session_attendance',
    'character_sheets',
    'dnd_campaigns',
    'dnd_campaign_members',
    'dnd_campaign_key_envelopes',
    'dnd_sessions',
    'dnd_user_devices',
    'dnd_tool_access'
  ];
begin
  foreach target in array targets loop
    -- Skip anything this database does not have, so the migration stays
    -- runnable against an older schema.
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = target
    ) then
      continue;
    end if;

    -- A policy on a table without RLS is silently ignored, which would look
    -- like protection that is not there. Collect those and shout at the end.
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = target and c.relrowsecurity
    ) then
      missing := missing || target;
      continue;
    end if;

    execute format('drop policy if exists demo_account_no_insert on public.%I', target);
    execute format('drop policy if exists demo_account_no_update on public.%I', target);
    execute format('drop policy if exists demo_account_no_delete on public.%I', target);

    -- The `(select ...)` wrapper matters: it lets the planner evaluate the
    -- function once per statement instead of once per row.
    execute format(
      'create policy demo_account_no_insert on public.%I as restrictive for insert '
      'to authenticated with check ((select public.is_demo_account()) is not true)',
      target
    );
    execute format(
      'create policy demo_account_no_update on public.%I as restrictive for update '
      'to authenticated using ((select public.is_demo_account()) is not true) '
      'with check ((select public.is_demo_account()) is not true)',
      target
    );
    execute format(
      'create policy demo_account_no_delete on public.%I as restrictive for delete '
      'to authenticated using ((select public.is_demo_account()) is not true)',
      target
    );
  end loop;

  if array_length(missing, 1) is not null then
    raise warning
      'Demo lockdown skipped these tables because row level security is disabled on them: %. Enable RLS on each, then re-run this migration.',
      array_to_string(missing, ', ');
  end if;
end $$;
