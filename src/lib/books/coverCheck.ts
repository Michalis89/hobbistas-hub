import { EXTERNAL_API_REVALIDATE_SECONDS } from '@/lib/constants/cache';
import { cachedExternalFetch } from '@/lib/api-cache/external';
import { coverExists, isUnverifiedCover } from './covers';
import type { BookCandidate } from './types';

/**
 * Some covers are built from an ISBN without knowing whether the image
 * exists (Open Library by ISBN for Hardcover-only books, the NLG cover
 * service). Sent to the browser unchecked, every missing one is a 404 that
 * next/image logs as "upstream image response failed" and the card falls
 * back to the placeholder anyway.
 *
 * So search results are checked on the server before they are returned:
 * one HEAD request per guessed cover, in parallel, with the answer cached
 * like any other external call so a repeated search costs nothing. Covers
 * that exist are kept; the rest become "no cover".
 */

/** cachedExternalFetch caches JSON, so the HEAD result is wrapped as JSON. */
const headAsJson = async (url: string) =>
  new Response(JSON.stringify({ exists: await coverExists(url) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

async function cachedCoverExists(url: string): Promise<boolean> {
  try {
    const result = await cachedExternalFetch<{ exists?: boolean }>({
      apiName: 'cover-check',
      endpoint: url,
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
      fetchImpl: headAsJson,
    });
    return result.exists === true;
  } catch {
    return false;
  }
}

const withoutCover = (book: BookCandidate): BookCandidate => ({
  ...book,
  coverLarge: null,
  coverSmall: null,
});

/**
 * Verifies the guessed covers of the first `count` books — the ones that can
 * reach the page — and drops guessed covers from the rest, which the search
 * handler slices away anyway.
 */
export async function verifyGuessedCovers(
  books: BookCandidate[],
  count: number,
): Promise<BookCandidate[]> {
  return Promise.all(
    books.map(async (book, index) => {
      if (!isUnverifiedCover(book.coverLarge)) {
        return book;
      }
      if (index >= count) {
        return withoutCover(book);
      }
      return (await cachedCoverExists(book.coverLarge)) ? book : withoutCover(book);
    }),
  );
}
