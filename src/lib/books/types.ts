/** The external providers a book can come from, as stored in media_items.source. */
export type BookSource = 'google_books' | 'open_library' | 'nlg' | 'hardcover';

/**
 * Provider-neutral book record.
 *
 * Every provider's results (Google Books, Open Library, National Library of
 * Greece, Hardcover) are mapped to this shape so they can be merged,
 * deduplicated, ranked and turned into one search result / media_items
 * payload without the search handler caring where they came from.
 */
export type BookCandidate = {
  googleBooksId: string | null;
  openLibraryId: string | null;
  /** National Library of Greece catalogue record id (Koha biblionumber). */
  nlgId: number | null;
  hardcoverId: number | null;
  /** Providers that contributed to this record, primary first. */
  sources: BookSource[];
  /** The ISBN-13 stored on the row (one edition). */
  isbn13: string | null;
  /** Every ISBN-13 the provider knows for this book, used only for matching. */
  isbns: string[];
  title: string;
  subtitle: string | null;
  authors: string[];
  categories: string[];
  description: string | null;
  pageCount: number | null;
  /** Provider date string: YYYY, YYYY-MM or YYYY-MM-DD. */
  publishedDate: string | null;
  publisher: string | null;
  /** Readers who saved the book (Hardcover); a ranking tie-breaker, not stored. */
  popularity: number | null;
  coverLarge: string | null;
  coverSmall: string | null;
};
