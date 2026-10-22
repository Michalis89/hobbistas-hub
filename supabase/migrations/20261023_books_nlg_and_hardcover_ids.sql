-- Greek books come from the National Library of Greece, not Biblionet; and
-- Hardcover is added as a book provider.
--
-- 20261022_books_multi_provider_ids added biblionet_id for ISBN enrichment
-- from Biblionet, but Biblionet's web service needs an account it approves
-- and has no text search, so it was never wired up and the column is empty.
-- The National Library of Greece (ΕΒΕ) catalogue is public, searchable by
-- Greek title and covers nearly every Greek book through legal deposit, so
-- nlg_id takes that slot.
--
-- Written to be safe to re-run and to reach the same end state from any of
-- the states a database can be in: only biblionet_id (renamed), only nlg_id
-- (kept), or both (the empty biblionet_id is dropped). It refuses to drop
-- biblionet_id if it ever holds data.

do $$
declare
  has_biblionet boolean;
  has_nlg boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_items' and column_name = 'biblionet_id'
  ) into has_biblionet;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_items' and column_name = 'nlg_id'
  ) into has_nlg;

  if has_biblionet and not has_nlg then
    alter table public.media_items rename column biblionet_id to nlg_id;
  elsif has_biblionet and has_nlg then
    if exists (select 1 from public.media_items where biblionet_id is not null) then
      raise exception 'media_items.biblionet_id holds data; move it to nlg_id before dropping it';
    end if;
    alter table public.media_items drop column biblionet_id;
  elsif not has_nlg then
    alter table public.media_items add column nlg_id integer;
  end if;
end $$;

-- Koha biblionumbers are integers; the column is empty, so the cast is safe
-- if it was ever created with another type.
alter table public.media_items
  alter column nlg_id type integer using nlg_id::integer;

-- Dropping or renaming biblionet_id took its index with it or kept the old
-- name; make sure the NLG one exists under its own name.
drop index if exists public.media_items_category_biblionet_id_key;

create unique index if not exists media_items_category_nlg_id_key
  on public.media_items (category, nlg_id)
  where nlg_id is not null;

comment on column public.media_items.nlg_id is
  'National Library of Greece catalogue record id (Koha biblionumber).';

-- Hardcover (hardcover.app) is a fourth book provider: a curated modern
-- catalogue with descriptions, series and reader counts, used for search and
-- ranking when HARDCOVER_API_TOKEN is set.
alter table public.media_items
  add column if not exists hardcover_id integer;

comment on column public.media_items.hardcover_id is
  'Hardcover book id (hardcover.app).';

create unique index if not exists media_items_category_hardcover_id_key
  on public.media_items (category, hardcover_id)
  where hardcover_id is not null;
