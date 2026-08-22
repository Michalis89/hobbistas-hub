-- READ ONLY. Changes nothing.
--
-- One result set on purpose: the Supabase SQL editor only shows the output of
-- the last statement, so everything is unioned into a single table.

select 'constraint' as kind,
       conname::text as name,
       pg_get_constraintdef(oid)::text as detail
from pg_constraint
where conrelid = 'public.articles'::regclass

union all
select 'function',
       proname::text,
       pg_get_function_result(oid)::text
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('publish_due_articles', 'trim_article_revisions')

union all
select 'extension',
       extname::text,
       extversion::text
from pg_extension
where extname = 'pg_cron'

-- Presence of cron.job is checked through the catalog rather than by selecting
-- from it: naming a missing table would fail at parse time and kill the query.
union all
select 'cron_schema',
       'cron.job',
       case when to_regclass('cron.job') is null then 'ABSENT' else 'PRESENT' end

union all
select 'column',
       'articles.scheduled_for',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'articles'
           and column_name = 'scheduled_for'
       ) then 'PRESENT' else 'ABSENT' end

union all
select 'trigger',
       tgname::text,
       'on article_revisions'
from pg_trigger
where tgrelid = 'public.article_revisions'::regclass
  and not tgisinternal

order by 1, 2;
