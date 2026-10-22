import { DEFAULT_COVER, UNTITLED_FALLBACK } from '@/lib/constants/messages';
import { searchGoogleBooks } from '@/lib/books/googleBooks';
import { searchOpenLibrary } from '@/lib/books/openLibrary';
import { hasGreekLetters, searchNlg } from '@/lib/books/nlg';
import { searchHardcover } from '@/lib/books/hardcover';
import { toHardcoverExternalId, toNlgExternalId } from '@/lib/books/identifiers';
import { bookIdentityKeys, mergeProviderResults, rankBooksByQuery } from '@/lib/books/merge';
import { isGreekIsbn, parseIsbnQuery } from '@/lib/books/isbn';
import { verifyGuessedCovers } from '@/lib/books/coverCheck';
import type { BookCandidate } from '@/lib/books/types';
import { provenanceField } from '../../provenance';
import type { MediaSearchConfig, SearchLocalItem } from '../../handlers/search';

type BooksCategory = 'books';

const readString = (item: SearchLocalItem, field: string) => {
  const value = item[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const readNumber = (item: SearchLocalItem, field: string) => {
  const value = item[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/** The id local rows expose to the UI, in the same priority as external results. */
const localExternalId = (item: SearchLocalItem) => {
  const nlgId = readNumber(item, 'nlg_id');
  const hardcoverId = readNumber(item, 'hardcover_id');
  return (
    readString(item, 'google_books_id') ??
    readString(item, 'open_library_id') ??
    (nlgId ? toNlgExternalId(nlgId) : null) ??
    (hardcoverId ? toHardcoverExternalId(hardcoverId) : null)
  );
};

const mapLocalItem = (item: SearchLocalItem) => {
  const title =
    (item.title as string | undefined) ||
    (item.original_title as string | undefined) ||
    UNTITLED_FALLBACK;
  // tags holds the authors for books; same fallback as external results
  const authors = Array.isArray(item.tags) ? (item.tags as unknown[]) : [];
  const firstAuthor = typeof authors[0] === 'string' ? authors[0] : '';
  const subtitle = (item.original_title as string | undefined) || firstAuthor;
  const year = (item.release_date as string | undefined)?.slice(0, 4);

  return {
    source: 'local',
    id: `local-${item.id}`,
    mediaId: item.id,
    externalId: localExternalId(item) ?? undefined,
    title,
    subtitle,
    year,
    status: 'planned',
    score: null,
    tags: (item.genres as string[] | undefined) ?? [],
    cover:
      (item.cover_image_large as string | undefined) ||
      (item.cover_image_medium as string | undefined) ||
      DEFAULT_COVER,
    ...provenanceField('local', [readString(item, 'source')]),
  };
};

const normalizeDate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  if (/^\d{4}$/.test(value)) {
    return `${value}-01-01`;
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return null;
};

/**
 * The id the UI and /media/books/[id] links use: Google id, else Open
 * Library work id, else NLG<biblionumber>, else HC<id>.
 */
const primaryExternalId = (book: BookCandidate) =>
  book.googleBooksId ??
  book.openLibraryId ??
  (book.nlgId ? toNlgExternalId(book.nlgId) : null) ??
  (book.hardcoverId ? toHardcoverExternalId(book.hardcoverId) : '');

const resultId = (book: BookCandidate) => {
  if (book.googleBooksId) {
    return `google-${book.googleBooksId}`;
  }
  if (book.openLibraryId) {
    return `ol-${book.openLibraryId}`;
  }
  if (book.nlgId) {
    return `nlg-${book.nlgId}`;
  }
  return `hc-${book.hardcoverId}`;
};

/** Fallback when a candidate carries no source list: the provider its first id belongs to. */
const inferSource = (book: BookCandidate) => {
  if (book.googleBooksId) {
    return 'google_books';
  }
  if (book.openLibraryId) {
    return 'open_library';
  }
  return book.nlgId ? 'nlg' : 'hardcover';
};

const mapBookCandidate = (book: BookCandidate) => {
  const title = book.title || UNTITLED_FALLBACK;
  const subtitle = book.subtitle || book.authors[0] || '';
  const year = book.publishedDate ? book.publishedDate.slice(0, 4) : undefined;

  return {
    source: 'external',
    id: resultId(book),
    externalId: primaryExternalId(book),
    title,
    subtitle,
    year,
    status: 'planned',
    score: null,
    tags: book.categories,
    cover: book.coverLarge || book.coverSmall || DEFAULT_COVER,
    payload: {
      google_books_id: book.googleBooksId,
      open_library_id: book.openLibraryId,
      nlg_id: book.nlgId,
      hardcover_id: book.hardcoverId,
      isbn_13: book.isbn13,
      category: 'books' as BooksCategory,
      // The provider whose title and core data the row carries
      source: book.sources[0] ?? inferSource(book),
      title,
      original_title: book.subtitle || null,
      description: book.description,
      page_count: book.pageCount,
      release_date: normalizeDate(book.publishedDate),
      publisher: book.publisher,
      cover_image_large: book.coverLarge,
      cover_image_medium: book.coverSmall,
      genres: book.categories,
      tags: book.authors,
    },
    ...provenanceField('external', book.sources),
  };
};

const normalizeSearchTerm = (value: string) => {
  // \p{L} rather than \w: \w is ASCII-only and would erase a Greek query.
  return value
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/** Greek queries (Greek letters, or a Greek ISBN) also go to the NLG catalogue. */
const isGreekSearch = (search: string, isbn: string | null) =>
  isbn ? isGreekIsbn(isbn) : hasGreekLetters(search);

/**
 * Providers are queried in parallel and merged: a book several of them know
 * becomes one result whose gaps are filled from the others, and books only
 * one knows are added. Any provider failing just leaves the rest.
 *
 * Merge priority (whose title and data win):
 * - Greek searches: National Library of Greece first, so a Greek book keeps
 *   its Greek title, edition and publisher.
 * - Then Google Books, Hardcover (only with a token), Open Library.
 *
 * The merged list is then ranked: the best of each provider first, then by
 * title match and reader count (see rankBooksByQuery). Covers guessed from an
 * ISBN are verified before the results leave the server.
 */
const fetchBooks = async (
  search: string,
  { limit, page }: { category: BooksCategory; limit: number; page: number },
): Promise<BookCandidate[]> => {
  const isbn = parseIsbnQuery(search);
  const greek = isGreekSearch(search, isbn);
  const options = { limit, isbn, page };
  const [google, hardcover, openLibrary, nlg] = await Promise.all([
    searchGoogleBooks(search, options),
    searchHardcover(search, options),
    searchOpenLibrary(search, options),
    greek ? searchNlg(search, options) : Promise.resolve([]),
  ]);
  const googleBooks = google.filter(book => book.title);
  const merged = mergeProviderResults(
    greek ? [nlg, googleBooks, hardcover, openLibrary] : [googleBooks, hardcover, openLibrary],
  );

  // An ISBN query names one edition: that is the ISBN to store, not whichever
  // edition the provider listed first.
  const ordered = isbn
    ? merged.map(book => (book.isbns.includes(isbn) ? { ...book, isbn13: isbn } : book))
    : rankBooksByQuery(merged, search);

  // Covers guessed from an ISBN are checked here, so the browser never asks
  // for one that 404s
  return verifyGuessedCovers(ordered, limit);
};

export const booksSearchConfig: MediaSearchConfig<
  BooksCategory,
  BookCandidate,
  ReturnType<typeof mapLocalItem> | ReturnType<typeof mapBookCandidate>
> = {
  defaultCategory: 'books',
  supportedCategories: ['books'],
  limit: 12,
  paginated: true,
  logPrefix: 'Books',
  buildLocalOrFilter: query => {
    const titleFilter = `title.ilike.%${query}%,original_title.ilike.%${query}%`;
    const isbn = parseIsbnQuery(query);
    return isbn ? `isbn_13.eq.${isbn},${titleFilter}` : titleFilter;
  },
  mapLocalItem,
  mapExternalItem: mapBookCandidate,
  getLocalExternalId: localExternalId,
  getExternalId: primaryExternalId,
  getLocalExternalIds: item =>
    bookIdentityKeys({
      googleBooksId: readString(item, 'google_books_id'),
      openLibraryId: readString(item, 'open_library_id'),
      nlgId: readNumber(item, 'nlg_id'),
      hardcoverId: readNumber(item, 'hardcover_id'),
      isbn13: readString(item, 'isbn_13'),
    }),
  getExternalIds: book => bookIdentityKeys(book),
  fetchExternal: fetchBooks,
  normalizeSearchTerm,
};
