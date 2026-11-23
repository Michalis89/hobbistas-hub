-- 20261123_rc059_articles_title_optional_for_drafts.sql
-- Purpose: let an author start a draft in Greek without an English title.
--
-- The articles row is the English source of an article; translations live in
-- article_translations. Until now articles.title was NOT NULL, so a draft
-- written only in Greek could not be saved. This migration makes the source
-- title optional for drafts only:
--
--   - articles.title becomes nullable;
--   - a CHECK keeps it required (non-blank) for every status except 'draft',
--     so nothing can be scheduled or published without an English title.
--
-- Public pages, URLs, slugs, canonical and hreflang are unchanged: they only
-- ever read published rows, which still always have a title.
--
-- Not destructive: no row is changed. Re-runnable.
--
-- Rollback (only once no draft is left without a title):
--   alter table public.articles drop constraint if exists articles_title_required_unless_draft;
--   alter table public.articles alter column title set not null;

begin;

alter table public.articles alter column title drop not null;

alter table public.articles
  drop constraint if exists articles_title_required_unless_draft;

-- NOT VALID first so the ALTER does not scan under a strong lock; VALIDATE
-- then checks existing rows (and fails the whole migration if any existing
-- non-draft row has a blank title, which the preflight reports beforehand).
alter table public.articles
  add constraint articles_title_required_unless_draft
  -- coalesce: status is nullable, and a CHECK that evaluates to NULL passes.
  check (coalesce(status, '') = 'draft' or (title is not null and length(trim(title)) > 0))
  not valid;

alter table public.articles validate constraint articles_title_required_unless_draft;

commit;
