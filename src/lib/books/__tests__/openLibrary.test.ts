/**
 * @jest-environment node
 */

const mockCachedExternalFetch = jest.fn();

jest.mock('@/lib/api-cache/external', () => ({
  cachedExternalFetch: (...args: unknown[]) => mockCachedExternalFetch(...args),
  ExternalFetchError: class ExternalFetchError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

import { fetchOpenLibraryWork, mapOpenLibraryDoc, searchOpenLibrary } from '../openLibrary';

describe('mapOpenLibraryDoc', () => {
  it('maps a search doc to a book candidate', () => {
    const candidate = mapOpenLibraryDoc({
      key: '/works/OL85509W',
      title: 'Vios ke Politia tou Alexi Zorba',
      author_name: ['Nikos Kazantzakis'],
      first_publish_year: 1946,
      cover_i: 425959,
      isbn: ['0571082149', '9789603600000', 'not-an-isbn', '9789602116524'],
      subject: ['Fiction', 'Greece'],
      number_of_pages_median: 311,
    });

    expect(candidate).toMatchObject({
      googleBooksId: null,
      openLibraryId: 'OL85509W',
      title: 'Vios ke Politia tou Alexi Zorba',
      authors: ['Nikos Kazantzakis'],
      // Subjects are reduced to known genres; 'Greece' is a place, not a genre
      categories: ['Fiction'],
      pageCount: 311,
      publishedDate: '1946',
      coverLarge: 'https://covers.openlibrary.org/b/id/425959-L.jpg',
      coverSmall: 'https://covers.openlibrary.org/b/id/425959-M.jpg',
    });
    // Invalid ISBNs are dropped; the Greek edition is the one stored
    expect(candidate?.isbns).toEqual(['9780571082148', '9789602116524']);
    expect(candidate?.isbn13).toBe('9789602116524');
  });

  it('prefers an English edition when there is no Greek one', () => {
    const candidate = mapOpenLibraryDoc({
      key: '/works/OL27448W',
      title: 'The Lord of the Rings',
      isbn: ['9784566023628', '9780261102385'],
    });

    expect(candidate?.isbn13).toBe('9780261102385');
  });

  it("uses the searched edition's cover and ISBN on an ISBN search", () => {
    const doc = {
      key: '/works/OL27513W',
      title: 'The Fellowship of the Ring',
      cover_i: 14627060,
      isbn: ['9781500410223', '0261102354'],
      editions: { docs: [{ cover_i: 14625938, isbn: ['0261102354', '9780261102354'] }] },
    };

    const byIsbn = mapOpenLibraryDoc(doc, { isbn: '9780261102354' });
    expect(byIsbn?.isbn13).toBe('9780261102354');
    expect(byIsbn?.coverLarge).toBe('https://covers.openlibrary.org/b/id/14625938-L.jpg');

    // A title search keeps the work's default cover
    expect(mapOpenLibraryDoc(doc)?.coverLarge).toBe(
      'https://covers.openlibrary.org/b/id/14627060-L.jpg',
    );
  });

  it('rejects docs without a work key or title', () => {
    expect(mapOpenLibraryDoc({ title: 'No key' })).toBeNull();
    expect(mapOpenLibraryDoc({ key: '/works/OL1W' })).toBeNull();
  });
});

describe('searchOpenLibrary', () => {
  beforeEach(() => mockCachedExternalFetch.mockReset());

  it('uses the isbn parameter for ISBN queries and sends a User-Agent', async () => {
    mockCachedExternalFetch.mockResolvedValue({ docs: [{ key: '/works/OL1W', title: 'A' }] });

    const result = await searchOpenLibrary('978-960-211-652-4', {
      limit: 5,
      isbn: '9789602116524',
    });

    const call = mockCachedExternalFetch.mock.calls[0][0];
    const url = new URL(call.endpoint);
    expect(url.searchParams.get('isbn')).toBe('9789602116524');
    expect(url.searchParams.get('q')).toBeNull();
    expect(call.init.headers['User-Agent']).toMatch(/^Hobbistas\/1\.0/);
    expect(result).toHaveLength(1);
  });

  it('logs one line, not the whole error, when the provider is down', async () => {
    const { ExternalFetchError } = jest.requireMock('@/lib/api-cache/external') as {
      ExternalFetchError: new (message: string, status: number) => Error;
    };
    mockCachedExternalFetch.mockRejectedValue(new ExternalFetchError('long body', 503));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(searchOpenLibrary('zorba', { limit: 5 })).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Open Library search unavailable (HTTP 503); continuing without it.',
    );
  });

  it('returns an empty list when the request fails', async () => {
    mockCachedExternalFetch.mockRejectedValue(new Error('down'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(searchOpenLibrary('zorba', { limit: 5 })).resolves.toEqual([]);
  });
});

describe('fetchOpenLibraryWork', () => {
  beforeEach(() => mockCachedExternalFetch.mockReset());

  it('reads both description shapes', async () => {
    mockCachedExternalFetch.mockResolvedValueOnce({
      description: { type: '/type/text', value: ' Typed ' },
      subjects: ['Fantasy fiction', 'hope'],
      covers: [-1, 42],
    });
    await expect(fetchOpenLibraryWork('OL1W')).resolves.toEqual({
      description: 'Typed',
      subjects: ['Fantasy'],
      coverId: 42,
    });

    mockCachedExternalFetch.mockResolvedValueOnce({ description: 'Plain' });
    await expect(fetchOpenLibraryWork('OL1W')).resolves.toMatchObject({ description: 'Plain' });
  });

  it('never calls out for something that is not a work id', async () => {
    await fetchOpenLibraryWork('../authors/OL1A');
    expect(mockCachedExternalFetch).not.toHaveBeenCalled();
  });
});
