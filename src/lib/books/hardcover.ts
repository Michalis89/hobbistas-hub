import { EXTERNAL_API_REVALIDATE_SECONDS } from '@/lib/constants/cache';
import { cachedExternalFetch } from '@/lib/api-cache/external';
import { SITE_NAME, SITE_URL } from '@/config/site';
import { subjectsToGenres } from './genres';
import { pickEditionIsbn, toIsbn13 } from './isbn';
import { logProviderError } from './logProviderError';
import type { BookCandidate } from './types';

/**
 * Hardcover (hardcover.app) — a curated, modern book catalogue built for
 * reading trackers: good descriptions, series, and how many readers saved
 * each book, which is used to rank results.
 *
 * https://docs.hardcover.app/api/getting-started/
 *
 * Terms that shape this module:
 * - Server-side only; the token must never reach the browser.
 * - A public site may use book data and Hardcover aggregate counts, but not
 *   data owned by users (libraries, reviews, ratings, lists).
 * - Covers are uploaded by Hardcover users; showing them publicly requires a
 *   DMCA takedown policy, which the site has at /copyright. They are used
 *   (assets.hardcover.app, usually far sharper than Google's thumbnails);
 *   a book without one falls back to Open Library's cover by ISBN.
 * - Free plan: 5,000 requests/day, 60/minute, search times out after 2s.
 *
 * Without HARDCOVER_API_TOKEN every call is a no-op.
 */

const GRAPHQL_ENDPOINT = 'https://api.hardcover.app/v1/graphql';

const SEARCH_QUERY = `query SearchBooks($query: String!, $perPage: Int!, $page: Int!) {
  search(query: $query, query_type: "Book", per_page: $perPage, page: $page) {
    results
  }
}`;

type HardcoverDocument = {
  id?: string | number;
  title?: string;
  subtitle?: string | null;
  author_names?: string[];
  isbns?: string[];
  genres?: string[];
  description?: string | null;
  pages?: number | null;
  release_year?: number | null;
  users_count?: number | null;
  compilation?: boolean;
  image?: { url?: string | null; width?: number | null; height?: number | null } | null;
};

type HardcoverSearchResponse = {
  data?: { search?: { results?: { found?: number; hits?: { document?: HardcoverDocument }[] } } };
  errors?: { message?: string }[];
};

const getToken = () => {
  const token = process.env.HARDCOVER_API_TOKEN?.trim();
  if (!token) {
    return null;
  }
  // The Hardcover settings page shows the token with its "Bearer " prefix;
  // accept it with or without.
  return /^bearer\s/i.test(token) ? token : `Bearer ${token}`;
};

export const isHardcoverConfigured = () => getToken() !== null;

/** Open Library serves covers by ISBN; 404 (default=false) when it has none. */
const openLibraryIsbnCover = (isbn: string, size: 'M' | 'L') =>
  `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false`;

/** Only Hardcover's own asset host is trusted as an image source. */
const hardcoverImageUrl = (doc: HardcoverDocument) => {
  const url = doc.image?.url;
  return url && url.startsWith('https://assets.hardcover.app/') ? url : null;
};

/** Hardcover's search index returns some text HTML-escaped ("Dungeons &amp; Dragons"). */
const decodeEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const decodeOrNull = (value: string | null | undefined) => {
  const decoded = value ? decodeEntities(value).trim() : '';
  return decoded || null;
};

const toId = (value: string | number | undefined) => {
  const id = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export function mapHardcoverDocument(doc: HardcoverDocument): BookCandidate | null {
  const hardcoverId = toId(doc.id);
  if (!hardcoverId || !doc.title) {
    return null;
  }

  const isbns = Array.from(
    new Set((doc.isbns ?? []).map(toIsbn13).filter((isbn): isbn is string => !!isbn)),
  ).slice(0, 40);
  const isbn13 = pickEditionIsbn(isbns);
  const cover = hardcoverImageUrl(doc);

  return {
    googleBooksId: null,
    openLibraryId: null,
    nlgId: null,
    hardcoverId,
    sources: ['hardcover'],
    isbn13,
    isbns,
    title: decodeEntities(doc.title),
    subtitle: decodeOrNull(doc.subtitle),
    authors: (doc.author_names ?? []).map(decodeEntities),
    categories: subjectsToGenres(doc.genres),
    description: decodeOrNull(doc.description),
    pageCount: doc.pages ?? null,
    publishedDate: doc.release_year ? String(doc.release_year) : null,
    publisher: null,
    popularity: doc.users_count ?? null,
    coverLarge: cover ?? (isbn13 ? openLibraryIsbnCover(isbn13, 'L') : null),
    coverSmall: cover ?? (isbn13 ? openLibraryIsbnCover(isbn13, 'M') : null),
  };
}

/**
 * GraphQL reports errors (including search timeouts) with a 200 status.
 * Turned into a 502 here so cachedExternalFetch throws instead of caching
 * the error for six hours.
 */
const fetchRejectingGraphqlErrors = async (input: string, init?: RequestInit) => {
  const response = await fetch(input, init);
  if (!response.ok) {
    return response;
  }
  const body = (await response.json()) as HardcoverSearchResponse;
  if (body.errors?.length) {
    return new Response(body.errors[0]?.message ?? 'GraphQL error', { status: 502 });
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export async function searchHardcover(
  query: string,
  { limit, isbn, page = 1 }: { limit: number; isbn?: string | null; page?: number },
): Promise<BookCandidate[]> {
  const token = getToken();
  if (!token) {
    return [];
  }

  try {
    const response = await cachedExternalFetch<HardcoverSearchResponse>({
      apiName: 'hardcover-search',
      endpoint: GRAPHQL_ENDPOINT,
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
      fetchImpl: fetchRejectingGraphqlErrors,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'User-Agent': `${SITE_NAME}/1.0 (+${SITE_URL})`,
        },
        // ISBNs are one of the fields Hardcover's book search matches on
        body: JSON.stringify({
          query: SEARCH_QUERY,
          variables: { query: isbn ?? query, perPage: limit, page },
        }),
      },
    });

    return (response.data?.search?.results?.hits ?? [])
      .map(hit => (hit.document ? mapHardcoverDocument(hit.document) : null))
      .filter((item): item is BookCandidate => item !== null);
  } catch (error) {
    logProviderError('Hardcover', error);
    return [];
  }
}
