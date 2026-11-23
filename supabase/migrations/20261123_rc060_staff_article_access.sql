-- 20261123_rc060_staff_article_access.sql
-- Purpose: admins, owners and moderators can read and edit every article and
-- review, drafts included, together with its translations, revisions and
-- media links.
--
-- Until now the articles policies only let a user read and change their own
-- rows (plus read published ones). The Studio already treats admin, owner and
-- moderator as "manage all content", but the database refused: other authors'
-- drafts never appeared in the Studio list, and a save on someone else's
-- article updated nothing.
--
-- One rule, in one function, used by every policy below and mirrored by
-- canManageAllArticles() in src/lib/roles.ts:
--
--   public.can_manage_all_articles() = has_any_role(admin, owner, moderator)
--
-- This also narrows the translation policies, which granted 'reviewer' instead
-- of 'moderator'. Reviewers keep full access to their own work; they no longer
-- get write access to translations of other people's published articles.
-- That is intended.
--
-- Not destructive: no data changes. Re-runnable.
--
-- Rollback:
--   drop policy if exists articles_staff_read on public.articles;
--   drop policy if exists articles_staff_update on public.articles;
--   drop policy if exists articles_staff_delete on public.articles;
--   then re-run the policy sections of 20260923_article_translations.sql,
--   20260823_article_revisions.sql and 20260822_article_media_links.sql.
--   drop function if exists public.can_manage_all_articles();

begin;

-- 0. Preconditions ---------------------------------------------------------
do $$
begin
  if to_regprocedure('public.has_any_role(text[])') is null then
    raise exception 'rc060_staff_article_access: public.has_any_role(text[]) is required';
  end if;
end;
$$;

-- 1. The rule ---------------------------------------------------------------
create or replace function public.can_manage_all_articles()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_any_role(array['admin', 'owner', 'moderator']);
$$;

revoke all on function public.can_manage_all_articles() from public, anon;
grant execute on function public.can_manage_all_articles() to authenticated;

-- 2. articles ---------------------------------------------------------------
-- Added alongside the existing author policies (permissive policies are OR-ed).
-- The restrictive demo_account_* policies still apply on top.
drop policy if exists articles_staff_read on public.articles;
create policy articles_staff_read on public.articles
  for select
  to authenticated
  using ((select public.can_manage_all_articles()));

drop policy if exists articles_staff_update on public.articles;
create policy articles_staff_update on public.articles
  for update
  to authenticated
  using ((select public.can_manage_all_articles()))
  with check ((select public.can_manage_all_articles()));

drop policy if exists articles_staff_delete on public.articles;
create policy articles_staff_delete on public.articles
  for delete
  to authenticated
  using ((select public.can_manage_all_articles()));

-- 3. article_translations ---------------------------------------------------
drop policy if exists article_translations_owner_read on public.article_translations;
create policy article_translations_owner_read on public.article_translations
  for select
  to authenticated
  using (
    (select public.can_manage_all_articles())
    or exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.author_id = (select auth.uid())
    )
  );

drop policy if exists article_translations_owner_write on public.article_translations;
create policy article_translations_owner_write on public.article_translations
  for all
  to authenticated
  using (
    (select public.can_manage_all_articles())
    or exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.author_id = (select auth.uid())
    )
  )
  with check (
    (select public.can_manage_all_articles())
    or exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.author_id = (select auth.uid())
    )
  );

-- 4. article_revisions ------------------------------------------------------
-- Reading was already open to the same three roles; it now uses the function.
-- Inserting was author-only, so a staff edit could not snapshot the version
-- it replaced.
drop policy if exists "article_revisions_read" on public.article_revisions;
create policy "article_revisions_read"
  on public.article_revisions
  for select
  using (
    (select public.can_manage_all_articles())
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = (select auth.uid())
    )
  );

drop policy if exists "article_revisions_insert" on public.article_revisions;
create policy "article_revisions_insert"
  on public.article_revisions
  for insert
  with check (
    (select public.can_manage_all_articles())
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = (select auth.uid())
    )
  );

-- 5. article_media_links ----------------------------------------------------
-- The API reconciles links on every save with the caller's session.
drop policy if exists "article_media_links_author_write" on public.article_media_links;
create policy "article_media_links_author_write"
  on public.article_media_links
  for all
  using (
    (select public.can_manage_all_articles())
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = (select auth.uid())
    )
  )
  with check (
    (select public.can_manage_all_articles())
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = (select auth.uid())
    )
  );

commit;
