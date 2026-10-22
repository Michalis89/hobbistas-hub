import { EXTERNAL_API_REVALIDATE_SECONDS } from '@/lib/constants/cache';
import { cachedExternalFetch } from '@/lib/api-cache/external';
import { logProviderError } from './logProviderError';
import { subjectsToGenres } from './genres';
import { toIsbn13 } from './isbn';
import type { BookCandidate } from './types';

export type GoogleBook = {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    categories?: string[];
    description?: string;
    pageCount?: number;
    publishedDate?: string;
    publisher?: string;
    industryIdentifiers?: { type?: string; identifier?: string }[];
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
};

const normalizeImage = (url?: string) => {
  if (!url) {
    return null;
  }
  return url.startsWith('http://') ? url.replace('http://', 'https://') : url;
};

export function mapGoogleBook(media: GoogleBook): BookCandidate {
  const info = media.volumeInfo || {};
  const isbns = Array.from(
    new Set(
      (info.industryIdentifiers ?? [])
        .filter(id => id.type === 'ISBN_13' || id.type === 'ISBN_10')
        .map(id => toIsbn13(id.identifier))
        .filter((isbn): isbn is string => !!isbn),
    ),
  );

  return {
    googleBooksId: media.id,
    openLibraryId: null,
    nlgId: null,
    hardcoverId: null,
    sources: ['google_books'],
    isbn13: isbns[0] ?? null,
    isbns,
    title: info.title || '',
    subtitle: info.subtitle || null,
    authors: info.authors ?? [],
    // Google's categories are curated (BISAC), so when none maps to a known
    // genre they are kept as-is rather than leaving the book with no genre.
    categories: (() => {
      const mapped = subjectsToGenres(info.categories);
      return mapped.length > 0 ? mapped : (info.categories ?? []);
    })(),
    description: info.description || null,
    pageCount: info.pageCount ?? null,
    publishedDate: info.publishedDate || null,
    publisher: info.publisher || null,
    popularity: null,
    coverLarge: normalizeImage(info.imageLinks?.thumbnail),
    coverSmall: normalizeImage(info.imageLinks?.smallThumbnail),
  };
}

export async function searchGoogleBooks(
  query: string,
  { limit, isbn, page = 1 }: { limit: number; isbn?: string | null; page?: number },
): Promise<BookCandidate[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY || '';
  if (!apiKey) {
    console.warn('Missing GOOGLE_BOOKS_API_KEY');
    return [];
  }

  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', isbn ? `isbn:${isbn}` : query);
  url.searchParams.set('maxResults', String(limit));
  if (page > 1) {
    url.searchParams.set('startIndex', String((page - 1) * limit));
  }
  url.searchParams.set('printType', 'books');
  url.searchParams.set('key', apiKey);

  try {
    const result = await cachedExternalFetch<{ items?: GoogleBook[] }>({
      apiName: 'google-books-search',
      endpoint: url.toString(),
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
    });
    return (result.items ?? []).map(mapGoogleBook);
  } catch (error) {
    logProviderError('Google Books', error);
    return [];
  }
}
