import { EXTERNAL_API_REVALIDATE_SECONDS } from '@/lib/constants/cache';
import { cachedExternalFetch } from '@/lib/api-cache/external';
import { logProviderError } from './logProviderError';
import { SITE_NAME, SITE_URL } from '@/config/site';
import { isOpenLibraryWorkId, toOpenLibraryWorkId } from './identifiers';
import { subjectsToGenres } from './genres';
import { pickEditionIsbn, toIsbn13 } from './isbn';
import type { BookCandidate } from './types';

/**
 * Open Library — free, keyless, and much better than Google Books for older
 * and non-English (including Greek) titles.
 *
 * https://openlibrary.org/dev/docs/api/search
 * Open Library asks API clients to send an identifying User-Agent.
 */

const OPEN_LIBRARY_BASE = 'https://openlibrary.org';
const COVERS_BASE = 'https://covers.openlibrary.org/b/id';
const SEARCH_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_name',
  'first_publish_year',
  'cover_i',
  'isbn',
  'subject',
  'number_of_pages_median',
].join(',');
/**
 * On an ISBN search Open Library also returns the edition that matched,
 * with that edition's own cover, so the result shows the reader's copy
 * rather than the work's default cover.
 */
const EDITION_FIELDS = ['editions', 'editions.cover_i', 'editions.isbn'].join(',');

/** A work's isbn list spans every edition; cap what we keep for matching. */
const MAX_MATCH_ISBNS = 40;

export type OpenLibrarySearchDoc = {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  subject?: string[];
  number_of_pages_median?: number;
  editions?: { docs?: { cover_i?: number; isbn?: string[] }[] };
};

type OpenLibraryWork = {
  description?: string | { value?: string };
  subjects?: string[];
  covers?: number[];
};

export const openLibraryHeaders = (): HeadersInit => ({
  'User-Agent': `${SITE_NAME}/1.0 (+${SITE_URL})`,
  Accept: 'application/json',
});

export const openLibraryCoverUrl = (coverId: number, size: 'M' | 'L') =>
  `${COVERS_BASE}/${coverId}-${size}.jpg`;

export function mapOpenLibraryDoc(
  doc: OpenLibrarySearchDoc,
  { isbn }: { isbn?: string | null } = {},
): BookCandidate | null {
  const openLibraryId = toOpenLibraryWorkId(doc.key);
  if (!openLibraryId || !doc.title) {
    return null;
  }

  const allIsbns = Array.from(
    new Set((doc.isbn ?? []).map(toIsbn13).filter((isbn): isbn is string => !!isbn)),
  );
  // The edition the user searched for, when this was an ISBN search
  const edition = isbn
    ? doc.editions?.docs?.find(item => (item.isbn ?? []).map(toIsbn13).includes(isbn))
    : undefined;
  const isbn13 = edition && isbn ? isbn : pickEditionIsbn(allIsbns);
  const coverId = edition?.cover_i ?? doc.cover_i;
  // Keep the picked edition in the matching set even when it is past the cap
  const isbns = allIsbns.slice(0, MAX_MATCH_ISBNS);
  if (isbn13 && !isbns.includes(isbn13)) {
    isbns.push(isbn13);
  }

  return {
    googleBooksId: null,
    openLibraryId,
    nlgId: null,
    hardcoverId: null,
    sources: ['open_library'],
    isbn13,
    isbns,
    title: doc.title,
    subtitle: doc.subtitle || null,
    authors: doc.author_name ?? [],
    categories: subjectsToGenres(doc.subject),
    description: null,
    pageCount: doc.number_of_pages_median ?? null,
    publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
    publisher: null,
    popularity: null,
    coverLarge: coverId ? openLibraryCoverUrl(coverId, 'L') : null,
    coverSmall: coverId ? openLibraryCoverUrl(coverId, 'M') : null,
  };
}

export async function searchOpenLibrary(
  query: string,
  { limit, isbn, page = 1 }: { limit: number; isbn?: string | null; page?: number },
): Promise<BookCandidate[]> {
  const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`);
  if (isbn) {
    url.searchParams.set('isbn', isbn);
  } else {
    url.searchParams.set('q', query);
  }
  url.searchParams.set('limit', String(limit));
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  url.searchParams.set('fields', isbn ? `${SEARCH_FIELDS},${EDITION_FIELDS}` : SEARCH_FIELDS);

  try {
    const result = await cachedExternalFetch<{ docs?: OpenLibrarySearchDoc[] }>({
      apiName: 'open-library-search',
      endpoint: url.toString(),
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
      init: { headers: openLibraryHeaders() },
    });
    return (result.docs ?? [])
      .map(doc => mapOpenLibraryDoc(doc, { isbn }))
      .filter((item): item is BookCandidate => item !== null);
  } catch (error) {
    logProviderError('Open Library search', error);
    return [];
  }
}

/**
 * The search endpoint has no description; the work record does. Used when a
 * book is added, so the description lands in media_items once.
 */
export async function fetchOpenLibraryWork(
  workId: string,
): Promise<{ description: string | null; subjects: string[]; coverId: number | null }> {
  if (!isOpenLibraryWorkId(workId)) {
    return { description: null, subjects: [], coverId: null };
  }

  try {
    const work = await cachedExternalFetch<OpenLibraryWork>({
      apiName: 'open-library-work',
      endpoint: `${OPEN_LIBRARY_BASE}/works/${workId}.json`,
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
      init: { headers: openLibraryHeaders() },
    });
    const rawDescription =
      typeof work.description === 'string' ? work.description : work.description?.value;
    return {
      description: rawDescription?.trim() || null,
      subjects: subjectsToGenres(work.subjects),
      coverId: work.covers?.find(id => id > 0) ?? null,
    };
  } catch (error) {
    logProviderError('Open Library work', error);
    return { description: null, subjects: [], coverId: null };
  }
}
