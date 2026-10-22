/**
 * @jest-environment node
 */

const mockCachedExternalFetch = jest.fn();
const mockCoverExists = jest.fn();

jest.mock('@/lib/api-cache/external', () => ({
  cachedExternalFetch: (...args: unknown[]) => mockCachedExternalFetch(...args),
}));

jest.mock('../covers', () => ({
  ...jest.requireActual('../covers'),
  coverExists: (...args: unknown[]) => mockCoverExists(...args),
}));

import { verifyGuessedCovers } from '../coverCheck';
import type { BookCandidate } from '../types';

const book = (coverLarge: string | null): BookCandidate => ({
  googleBooksId: null,
  openLibraryId: null,
  nlgId: null,
  hardcoverId: 1,
  sources: ['hardcover'],
  isbn13: null,
  isbns: [],
  title: 'Book',
  subtitle: null,
  authors: [],
  categories: [],
  description: null,
  pageCount: null,
  publishedDate: null,
  publisher: null,
  popularity: null,
  coverLarge,
  coverSmall: coverLarge,
});

const GUESS_OK = 'https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg?default=false';
const GUESS_MISSING = 'https://covers.openlibrary.org/b/isbn/9780007635610-L.jpg?default=false';
const REAL = 'https://covers.openlibrary.org/b/id/14627060-L.jpg';

describe('verifyGuessedCovers', () => {
  beforeEach(() => {
    mockCoverExists.mockReset();
    // Run the HEAD check through the cache wrapper, as the real one does
    mockCachedExternalFetch
      .mockReset()
      .mockImplementation(
        async ({
          endpoint,
          fetchImpl,
        }: {
          endpoint: string;
          fetchImpl: (url: string) => Promise<Response>;
        }) => (await fetchImpl(endpoint)).json(),
      );
    mockCoverExists.mockImplementation(async (url: string) => url === GUESS_OK);
  });

  it('keeps guessed covers that exist and drops the ones that 404', async () => {
    const [kept, dropped] = await verifyGuessedCovers([book(GUESS_OK), book(GUESS_MISSING)], 12);

    expect(kept.coverLarge).toBe(GUESS_OK);
    expect(dropped.coverLarge).toBeNull();
    expect(dropped.coverSmall).toBeNull();
  });

  it('never checks covers that came from a provider as real images', async () => {
    const [result] = await verifyGuessedCovers([book(REAL)], 12);

    expect(result.coverLarge).toBe(REAL);
    expect(mockCachedExternalFetch).not.toHaveBeenCalled();
  });

  it('caches each check under its own URL', async () => {
    await verifyGuessedCovers([book(GUESS_OK)], 12);

    expect(mockCachedExternalFetch).toHaveBeenCalledWith(
      expect.objectContaining({ apiName: 'cover-check', endpoint: GUESS_OK }),
    );
  });

  it('only checks the books that can reach the page', async () => {
    const result = await verifyGuessedCovers([book(GUESS_OK), book(GUESS_OK)], 1);

    expect(mockCachedExternalFetch).toHaveBeenCalledTimes(1);
    expect(result[0].coverLarge).toBe(GUESS_OK);
    expect(result[1].coverLarge).toBeNull();
  });

  it('treats a failed check as no cover', async () => {
    mockCachedExternalFetch.mockRejectedValue(new Error('cache down'));

    const [result] = await verifyGuessedCovers([book(GUESS_OK)], 12);

    expect(result.coverLarge).toBeNull();
  });
});
