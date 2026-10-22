/**
 * @jest-environment node
 */

const mockCachedExternalFetch = jest.fn();

jest.mock('@/lib/api-cache/external', () => ({
  cachedExternalFetch: (...args: unknown[]) => mockCachedExternalFetch(...args),
  ExternalFetchError: class ExternalFetchError extends Error {},
}));

import { mapHardcoverDocument, searchHardcover } from '../hardcover';

describe('mapHardcoverDocument', () => {
  it('maps a search hit to a book candidate without a Hardcover cover', () => {
    const book = mapHardcoverDocument({
      id: '328491',
      title: 'Dune',
      subtitle: null,
      author_names: ['Frank Herbert'],
      isbns: ['0441013597', '9780441013593'],
      genres: ['Science Fiction', 'Fiction', 'Classics'],
      description: ' Set on the desert planet Arrakis… ',
      pages: 658,
      release_year: 1965,
      users_count: 41000,
    });

    expect(book).toMatchObject({
      hardcoverId: 328491,
      sources: ['hardcover'],
      title: 'Dune',
      authors: ['Frank Herbert'],
      isbn13: '9780441013593',
      categories: ['Science Fiction', 'Fiction', 'Classics'],
      description: 'Set on the desert planet Arrakis…',
      pageCount: 658,
      publishedDate: '1965',
      popularity: 41000,
      // Hardcover covers are user uploads (DMCA); Open Library's by ISBN instead
      coverLarge: 'https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg?default=false',
    });
  });

  it('rejects hits without an id or title', () => {
    expect(mapHardcoverDocument({ title: 'No id' })).toBeNull();
    expect(mapHardcoverDocument({ id: 5 })).toBeNull();
  });
});

describe('searchHardcover', () => {
  const env = process.env;

  beforeEach(() => {
    mockCachedExternalFetch.mockReset();
    process.env = { ...env };
    delete process.env.HARDCOVER_API_TOKEN;
  });

  afterAll(() => {
    process.env = env;
  });

  it('is a no-op without a token', async () => {
    await expect(searchHardcover('dune', { limit: 5 })).resolves.toEqual([]);
    expect(mockCachedExternalFetch).not.toHaveBeenCalled();
  });

  it('sends a server-side GraphQL search with the bearer token', async () => {
    process.env.HARDCOVER_API_TOKEN = 'abc123';
    mockCachedExternalFetch.mockResolvedValue({
      data: { search: { results: { found: 1, hits: [{ document: { id: '1', title: 'Dune' } }] } } },
    });

    const result = await searchHardcover('dune', { limit: 5, page: 2 });

    const call = mockCachedExternalFetch.mock.calls[0][0];
    expect(call.endpoint).toBe('https://api.hardcover.app/v1/graphql');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers.Authorization).toBe('Bearer abc123');
    expect(JSON.parse(call.init.body).variables).toEqual({ query: 'dune', perPage: 5, page: 2 });
    expect(typeof call.fetchImpl).toBe('function');
    expect(result.map(book => book.hardcoverId)).toEqual([1]);
  });

  it('accepts a token pasted with its Bearer prefix', async () => {
    process.env.HARDCOVER_API_TOKEN = 'Bearer abc123';
    mockCachedExternalFetch.mockResolvedValue({ data: { search: { results: { hits: [] } } } });

    await searchHardcover('dune', { limit: 5 });

    expect(mockCachedExternalFetch.mock.calls[0][0].init.headers.Authorization).toBe(
      'Bearer abc123',
    );
  });

  it('turns GraphQL errors into a non-2xx response so they are not cached', async () => {
    process.env.HARDCOVER_API_TOKEN = 'abc123';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ errors: [{ message: 'Search timeout' }] }), { status: 200 }),
      );
    let status = 0;
    mockCachedExternalFetch.mockImplementation(
      async ({
        fetchImpl,
      }: {
        fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
      }) => {
        status = (await fetchImpl('https://api.hardcover.app/v1/graphql', {})).status;
        throw new Error('request failed');
      },
    );
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(searchHardcover('dune', { limit: 5 })).resolves.toEqual([]);
    expect(status).toBe(502);
    fetchSpy.mockRestore();
  });
});

describe('Hardcover covers and text', () => {
  it("uses Hardcover's own cover when it has one", () => {
    const book = mapHardcoverDocument({
      id: 1,
      title: 'Homeland',
      isbns: ['9780786939541'],
      image: {
        url: 'https://assets.hardcover.app/edition/4959462/cover.jpeg',
        width: 304,
        height: 500,
      },
    });

    expect(book?.coverLarge).toBe('https://assets.hardcover.app/edition/4959462/cover.jpeg');
    expect(book?.coverSmall).toBe('https://assets.hardcover.app/edition/4959462/cover.jpeg');
  });

  it('ignores image URLs from any other host', () => {
    const book = mapHardcoverDocument({
      id: 1,
      title: 'Homeland',
      image: { url: 'https://evil.example/cover.jpeg' },
    });

    expect(book?.coverLarge).toBeNull();
  });

  it('decodes the HTML entities Hardcover leaves in titles', () => {
    const book = mapHardcoverDocument({
      id: 1,
      title: 'Homeland: Dungeons &amp; Dragons',
      subtitle: 'Book &#49; of &quot;Drizzt&quot;',
      author_names: ['R.A. Salvatore &amp; Co'],
    });

    expect(book).toMatchObject({
      title: 'Homeland: Dungeons & Dragons',
      subtitle: 'Book 1 of "Drizzt"',
      authors: ['R.A. Salvatore & Co'],
    });
  });
});
