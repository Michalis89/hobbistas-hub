-- Greek versions of articles and reviews.
--
-- The `articles` row stays the source version - English today - and every
-- other language is a row here. The alternative, adding `title_el`,
-- `content_rich_el` and so on to `articles`, would mean a schema change for
-- each new language and would leave every existing query selecting columns it
-- does not want.
--
-- Only the fields a reader actually sees are translatable. Slug, category,
-- topic, tags, cover and score stay on the article: they identify or classify
-- the piece rather than express it, and splitting them per language would fork
-- the URL space and the taxonomy.

create table if not exists public.article_translations (
  article_id bigint not null references public.articles (id) on delete cascade,
  locale text not null,
  title text not null,
  description text,
  content_rich jsonb,
  content_html text,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, locale),
  constraint article_translations_locale_check check (locale in ('en', 'el'))
);

comment on table public.article_translations is
  'Per-language versions of an article. The articles row itself is the source language.';

-- The read path always filters by article and locale together, which the
-- primary key already serves. This one covers "which languages does this
-- article have", used to decide whether to offer the switcher at all.
create index if not exists article_translations_locale_idx
  on public.article_translations (locale);

create or replace function public.set_article_translation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists article_translations_set_updated_at on public.article_translations;
create trigger article_translations_set_updated_at
  before update on public.article_translations
  for each row execute function public.set_article_translation_updated_at();

alter table public.article_translations enable row level security;

-- Readable exactly when the article it belongs to is readable. Anything not
-- published stays visible only to its author and the editorial roles, which is
-- the same rule the article itself follows.
drop policy if exists article_translations_public_read on public.article_translations;
create policy article_translations_public_read on public.article_translations
  for select
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id and a.status = 'published'
    )
  );

drop policy if exists article_translations_owner_read on public.article_translations;
create policy article_translations_owner_read on public.article_translations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and (
          a.author_id = (select auth.uid())
          or exists (
            select 1 from public.users u
            where u.id = (select auth.uid())
              and u.roles && array['admin', 'owner', 'reviewer']
          )
        )
    )
  );

drop policy if exists article_translations_owner_write on public.article_translations;
create policy article_translations_owner_write on public.article_translations
  for all
  to authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and (
          a.author_id = (select auth.uid())
          or exists (
            select 1 from public.users u
            where u.id = (select auth.uid())
              and u.roles && array['admin', 'owner', 'reviewer']
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and (
          a.author_id = (select auth.uid())
          or exists (
            select 1 from public.users u
            where u.id = (select auth.uid())
              and u.roles && array['admin', 'owner', 'reviewer']
          )
        )
    )
  );

-- The demo account must not be able to write here either. Mirrors
-- 20260923_demo_account.sql; re-running that migration is equivalent.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_demo_account') then
    execute 'drop policy if exists demo_account_no_insert on public.article_translations';
    execute 'drop policy if exists demo_account_no_update on public.article_translations';
    execute 'drop policy if exists demo_account_no_delete on public.article_translations';
    execute
      'create policy demo_account_no_insert on public.article_translations as restrictive '
      'for insert to authenticated with check ((select public.is_demo_account()) is not true)';
    execute
      'create policy demo_account_no_update on public.article_translations as restrictive '
      'for update to authenticated using ((select public.is_demo_account()) is not true) '
      'with check ((select public.is_demo_account()) is not true)';
    execute
      'create policy demo_account_no_delete on public.article_translations as restrictive '
      'for delete to authenticated using ((select public.is_demo_account()) is not true)';
  else
    raise warning
      'public.is_demo_account() is missing - run 20260923_demo_account.sql, then re-run this file so the demo lockdown covers article_translations.';
  end if;
end $$;

-- Reading language. The column already existed and was unused; it now backs
-- the default language for articles and reviews.
alter table public.users
  alter column language_preference set default 'en';

update public.users
  set language_preference = 'en'
  where language_preference is null
     or language_preference not in ('en', 'el');

alter table public.users
  drop constraint if exists users_language_preference_check;
alter table public.users
  add constraint users_language_preference_check
  check (language_preference in ('en', 'el'));

comment on column public.users.language_preference is
  'Preferred reading language for articles and reviews: en or el.';
