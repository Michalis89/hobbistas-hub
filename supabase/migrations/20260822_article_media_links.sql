-- Many-to-many links between articles and the media items they are about.
--
-- NOT APPLIED. Review before running: this creates a table and policies.
--
-- Why: articles.media_id holds a single item, which is enough for filtering but
-- cannot express "this review is about X and also mentions Y and Z". The
-- editor now embeds media cards inside the body, so an article can reference
-- several items, and a media page should be able to list everything written
-- about it.
--
-- Roles:
--   subject   - what the article is actually about. A review has exactly one.
--   mentioned - referenced in passing, collected from embedded media cards.

create table if not exists public.article_media_links (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.articles (id) on delete cascade,
  media_id bigint not null references public.media_items (id) on delete cascade,
  role text not null default 'mentioned' check (role in ('subject', 'mentioned')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (article_id, media_id)
);

create index if not exists article_media_links_article_idx
  on public.article_media_links (article_id);

-- Drives "articles about this title" on a media page.
create index if not exists article_media_links_media_role_idx
  on public.article_media_links (media_id, role);

-- At most one subject per article.
create unique index if not exists article_media_links_one_subject_idx
  on public.article_media_links (article_id)
  where role = 'subject';

alter table public.article_media_links enable row level security;

-- Readable when the article itself is readable.
create policy "article_media_links_public_read"
  on public.article_media_links
  for select
  using (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.status = 'published'
    )
  );

-- Only the author of the article may change its links. Service-role writes
-- bypass RLS, so the API can still reconcile links on save.
create policy "article_media_links_author_write"
  on public.article_media_links
  for all
  using (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.author_id = auth.uid()
    )
  );

-- Backfill the existing single link as the subject.
insert into public.article_media_links (article_id, media_id, role)
select id, media_id, 'subject'
from public.articles
where media_id is not null
on conflict (article_id, media_id) do nothing;
