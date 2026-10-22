-- Books come from more than one provider now.
--
-- Google Books alone has thin coverage, especially for Greek titles, so book
-- search also queries Open Library, and Greek ISBNs are enriched from
-- Biblionet. Each provider gets its own identifier column, the same way
-- games have igdb_id and movies have tmdb_id, and isbn_13 is the key that
-- lets the same book from two providers resolve to one media_items row.
--
-- A book row may carry any subset of these. google_books_id stays the
-- primary external id in the media factory config; the others are
-- alternates checked in order when the add handler looks for an existing row.

alter table public.media_items
  add column if not exists open_library_id text,
  add column if not exists biblionet_id integer,
  add column if not exists isbn_13 text;

comment on column public.media_items.open_library_id is
  'Open Library work key without the /works/ prefix, e.g. OL82563W.';
comment on column public.media_items.biblionet_id is
  'Biblionet TitlesID. Set by ISBN enrichment for Greek books.';
comment on column public.media_items.isbn_13 is
  'ISBN-13, digits only. Shared key for matching a book across providers.';

-- One row per provider id within a category. Partial so the many rows
-- without the id do not collide on NULL.
create unique index if not exists media_items_category_open_library_id_key
  on public.media_items (category, open_library_id)
  where open_library_id is not null;

create unique index if not exists media_items_category_biblionet_id_key
  on public.media_items (category, biblionet_id)
  where biblionet_id is not null;

-- Not unique: rows imported before this column existed can share a book
-- with a newer row, and a unique index would make that backfill fail.
create index if not exists media_items_category_isbn_13_idx
  on public.media_items (category, isbn_13)
  where isbn_13 is not null;
