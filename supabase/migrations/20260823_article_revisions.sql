-- Version history for articles.
--
-- Without this, a bad edit to a published article is unrecoverable: the studio
-- autosaves, so there is no "discard my changes" moment to fall back on.
--
-- Only the fields an author can destroy are snapshotted. Metadata such as
-- category or tags is cheap to re-enter; the writing is not.
--
-- Safe to run repeatedly: policies are dropped before being recreated.

create table if not exists public.article_revisions (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.articles (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  title text,
  description text,
  content_rich jsonb,
  content_html text,
  created_at timestamptz not null default now()
);

create index if not exists article_revisions_article_idx
  on public.article_revisions (article_id, created_at desc);

alter table public.article_revisions enable row level security;

-- Authors read their own history; moderators and admins read all of it.
drop policy if exists "article_revisions_read" on public.article_revisions;

create policy "article_revisions_read"
  on public.article_revisions
  for select
  using (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = auth.uid()
    )
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.roles && array['admin', 'owner', 'moderator']
    )
  );

-- Revisions are written by the API with the caller's session, never edited.
drop policy if exists "article_revisions_insert" on public.article_revisions;

create policy "article_revisions_insert"
  on public.article_revisions
  for insert
  with check (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = auth.uid()
    )
  );

/**
 * Keeps the newest 20 revisions per article.
 *
 * The studio autosaves every couple of seconds, so without a cap this table
 * would grow without bound for no practical benefit.
 */
create or replace function public.trim_article_revisions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.article_revisions
  where article_id = new.article_id
    and id not in (
      select id
      from public.article_revisions
      where article_id = new.article_id
      order by created_at desc, id desc
      limit 20
    );

  return null;
end;
$$;

drop trigger if exists article_revisions_trim on public.article_revisions;

create trigger article_revisions_trim
after insert on public.article_revisions
for each row
execute function public.trim_article_revisions();
