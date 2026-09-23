-- Scheduled publishing for articles.
--
-- Safe to run repeatedly: every statement either checks for existence first or
-- drops and recreates. An earlier version of this file was not re-runnable,
-- which is how it half-applied.
--
-- Design note: the transition happens in the database, not at read time, so
-- every existing query that filters `status = 'published'` keeps working
-- untouched. Resolving "is it due yet?" in each query instead would have to be
-- repeated in the article list, the detail page, related articles, the sitemap
-- and the feeds, and missing one would either hide a published article or leak
-- an unpublished one.

alter table public.articles
  add column if not exists scheduled_for timestamptz;

comment on column public.articles.scheduled_for is
  'When a scheduled article should go live. Only meaningful while status = ''scheduled''.';

-- Replace the status check, whatever the original was called.
do $$
declare
  constraint_name text;
begin
  -- Matched narrowly: a broad '%status%' match can hit an unrelated check
  -- constraint that merely mentions the column.
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.articles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and pg_get_constraintdef(oid) ilike '%draft%'
      and pg_get_constraintdef(oid) ilike '%published%'
  loop
    execute format('alter table public.articles drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.articles
  drop constraint if exists articles_status_check;

alter table public.articles
  add constraint articles_status_check
  check (status in ('draft', 'published', 'scheduled', 'archived'));

-- A scheduled article must say when.
alter table public.articles
  drop constraint if exists articles_scheduled_needs_time;

alter table public.articles
  add constraint articles_scheduled_needs_time
  check (status <> 'scheduled' or scheduled_for is not null);

-- Only scheduled rows are ever scanned by the publisher.
create index if not exists articles_scheduled_due_idx
  on public.articles (scheduled_for)
  where status = 'scheduled';

/**
 * Flips due articles to published. Returns how many were published, so a cron
 * run can be inspected after the fact.
 */
create or replace function public.publish_due_articles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  published_count integer;
begin
  with due as (
    update public.articles
       set status = 'published',
           published_at = coalesce(published_at, scheduled_for, now()),
           updated_at = now()
     where status = 'scheduled'
       and scheduled_for is not null
       and scheduled_for <= now()
    returning id
  )
  select count(*) into published_count from due;

  return published_count;
end;
$$;

revoke all on function public.publish_due_articles() from public, anon, authenticated;

-- Automatic publishing, if pg_cron is available.
--
-- Wrapped so that an unavailable extension degrades to a notice instead of
-- aborting the whole migration: everything above is the part that matters, and
-- the flip can also be triggered by other means.
do $$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('publish-due-articles')
  from cron.job
  where jobname = 'publish-due-articles';

  perform cron.schedule(
    'publish-due-articles',
    '* * * * *',
    'select public.publish_due_articles()'
  );

  raise notice 'pg_cron scheduled: publish-due-articles runs every minute.';
exception
  when others then
    raise notice 'pg_cron unavailable (%). Schema applied; automatic publishing is NOT active.', sqlerrm;
end $$;
