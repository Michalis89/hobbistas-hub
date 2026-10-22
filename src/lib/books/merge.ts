import { isUnverifiedCover } from './covers';
import type { BookCandidate } from './types';

/**
 * Lowercased, accent-free, punctuation-free form used to tell whether two
 * providers are describing the same book when they share no ISBN.
 * NFD + stripping combining marks also folds Greek tonos (ά -> α).
 */
export const normalizeForMatch = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const titleAuthorKey = (book: BookCandidate) => {
  const title = normalizeForMatch(book.title);
  if (!title) {
    return null;
  }
  return `${title}|${normalizeForMatch(book.authors[0])}`;
};

const sameBook = (a: BookCandidate, b: BookCandidate) => {
  if (a.isbns.some(isbn => b.isbns.includes(isbn))) {
    return true;
  }
  const keyA = titleAuthorKey(a);
  return keyA !== null && keyA === titleAuthorKey(b);
};

/**
 * How good a cover is likely to be, so a merged book shows the best one any
 * provider has rather than whichever provider's data won:
 * Hardcover (sharp, usually 300px+) > Open Library work covers > anything
 * else (Google's thumbnails are ~128px) > a URL guessed from an ISBN, which
 * may not exist at all.
 */
const coverQuality = (url: string | null) => {
  if (!url) {
    return -1;
  }
  // via unknown: the type guard would narrow `url` to never below
  if (isUnverifiedCover(url as unknown)) {
    return 0;
  }
  if (url.startsWith('https://assets.hardcover.app/')) {
    return 3;
  }
  if (url.startsWith('https://covers.openlibrary.org/b/id/')) {
    return 2;
  }
  return 1;
};

/** The better of the two covers; on a tie the base keeps its own. */
const pickCover = (base: BookCandidate, extra: BookCandidate) => {
  if (coverQuality(extra.coverLarge) > coverQuality(base.coverLarge)) {
    return { coverLarge: extra.coverLarge, coverSmall: extra.coverSmall ?? extra.coverLarge };
  }
  return { coverLarge: base.coverLarge, coverSmall: base.coverSmall ?? extra.coverSmall };
};

/** Fills the gaps in `base` from `extra`; never overwrites what `base` has. */
export function fillBookGaps(base: BookCandidate, extra: BookCandidate): BookCandidate {
  return {
    googleBooksId: base.googleBooksId ?? extra.googleBooksId,
    openLibraryId: base.openLibraryId ?? extra.openLibraryId,
    nlgId: base.nlgId ?? extra.nlgId,
    hardcoverId: base.hardcoverId ?? extra.hardcoverId,
    sources: Array.from(new Set([...base.sources, ...extra.sources])),
    isbn13: base.isbn13 ?? extra.isbn13,
    isbns: Array.from(new Set([...base.isbns, ...extra.isbns])),
    title: base.title || extra.title,
    subtitle: base.subtitle ?? extra.subtitle,
    authors: base.authors.length > 0 ? base.authors : extra.authors,
    categories: base.categories.length > 0 ? base.categories : extra.categories,
    description: base.description ?? extra.description,
    pageCount: base.pageCount ?? extra.pageCount,
    publishedDate: base.publishedDate ?? extra.publishedDate,
    publisher: base.publisher ?? extra.publisher,
    popularity: base.popularity ?? extra.popularity,
    ...pickCover(base, extra),
  };
}

/**
 * Merges results from two providers into one deduplicated list.
 *
 * A secondary result that matches a primary one (shared ISBN, or same
 * title and first author) only fills that result's gaps — so a Google
 * Books hit with no cover gains the Open Library cover and work id. The
 * rest are interleaved with the primary results, so a provider with poor
 * coverage for a query cannot push the other one out of the first page.
 */
export function mergeBookCandidates(
  primary: BookCandidate[],
  secondary: BookCandidate[],
): BookCandidate[] {
  const merged = primary.map(book => ({ ...book }));
  const unmatched: BookCandidate[] = [];

  for (const candidate of secondary) {
    const index = merged.findIndex(book => sameBook(book, candidate));
    if (index >= 0) {
      merged[index] = fillBookGaps(merged[index], candidate);
    } else if (!unmatched.some(book => sameBook(book, candidate))) {
      unmatched.push(candidate);
    }
  }

  const result: BookCandidate[] = [];
  const length = Math.max(merged.length, unmatched.length);
  for (let i = 0; i < length; i += 1) {
    if (merged[i]) {
      result.push(merged[i]);
    }
    if (unmatched[i]) {
      result.push(unmatched[i]);
    }
  }
  return result;
}

/**
 * Merges any number of provider result lists, highest priority first: each
 * later list fills gaps in the books already merged and adds the rest.
 */
export function mergeProviderResults(lists: BookCandidate[][]): BookCandidate[] {
  return lists.reduce<BookCandidate[]>((merged, list) => mergeBookCandidates(merged, list), []);
}

/**
 * Every key this book can be recognised by. The search handler drops an
 * external result if any of its keys belongs to a book already in the DB.
 */
export function bookIdentityKeys(book: {
  googleBooksId?: string | null;
  openLibraryId?: string | null;
  nlgId?: number | null;
  hardcoverId?: number | null;
  isbns?: string[];
  isbn13?: string | null;
}): string[] {
  const keys: string[] = [];
  if (book.googleBooksId) {
    keys.push(`gb:${book.googleBooksId}`);
  }
  if (book.openLibraryId) {
    keys.push(`ol:${book.openLibraryId}`);
  }
  if (book.nlgId) {
    keys.push(`nlg:${book.nlgId}`);
  }
  if (book.hardcoverId) {
    keys.push(`hc:${book.hardcoverId}`);
  }
  const isbns = new Set([...(book.isbns ?? []), ...(book.isbn13 ? [book.isbn13] : [])]);
  for (const isbn of isbns) {
    keys.push(`isbn:${isbn}`);
  }
  return keys;
}

/** Leading articles are ignored when comparing a title with the query. */
const LEADING_ARTICLE = /^(the|a|an|ο|η|το|οι|τα)\s+/;

const comparableTitle = (value: string | null | undefined) =>
  normalizeForMatch(value).replace(LEADING_ARTICLE, '');

/**
 * How closely a book's title matches the query: exact > starts with >
 * contains > other. An exact title with a subtitle the query did not ask
 * for ranks just below a bare exact title, since those are usually
 * companion books ("… Popular Culture in Global Context") — unless the book
 * has a Hardcover reader count, which says far more: the real "Fellowship of
 * the Ring" carries the subtitle "The Lord of the Rings: Part One", and a
 * study guide with the bare title must not outrank it.
 */
const titleMatchScore = (book: BookCandidate, query: string) => {
  const title = comparableTitle(book.title);
  if (!title || !query) {
    return 0;
  }
  if (title === query) {
    const unaskedSubtitle = book.subtitle && !query.includes(normalizeForMatch(book.subtitle));
    return unaskedSubtitle && book.popularity === null ? 3.5 : 4;
  }
  if (title.startsWith(query)) {
    return 2;
  }
  if (title.includes(query)) {
    return 1;
  }
  return 0;
};

/**
 * Orders merged results so the first page shows the book the user typed
 * and a pick from every provider:
 *
 * 1. Head: the best result of each provider (by its primary source), so one
 *    provider with many near-matches cannot crowd the others off the page.
 *    A provider's best is only promoted if its title matches the query at
 *    all, unless nothing does (an author search): Google's loose matching
 *    on Greek queries would otherwise put unrelated books on top.
 * 2. Then everything else by title match, then by how many readers saved the
 *    book (Hardcover), then in provider order.
 */
export function rankBooksByQuery(books: BookCandidate[], rawQuery: string): BookCandidate[] {
  const query = comparableTitle(rawQuery);
  const sorted = books
    .map((book, index) => ({ book, index, score: titleMatchScore(book, query) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.book.popularity ?? -1) - (a.book.popularity ?? -1) ||
        a.index - b.index,
    );

  const anyMatch = sorted.some(item => item.score > 0);
  const promotedProviders = new Set<string>();
  const head = sorted.filter(item => {
    const provider = item.book.sources[0];
    if (!provider || promotedProviders.has(provider) || (anyMatch && item.score === 0)) {
      return false;
    }
    promotedProviders.add(provider);
    return true;
  });

  return [...head, ...sorted.filter(item => !head.includes(item))].map(({ book }) => book);
}
