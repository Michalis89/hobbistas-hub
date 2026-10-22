/**
 * @jest-environment node
 */

const mockSearchGoogleBooks = jest.fn();
const mockSearchOpenLibrary = jest.fn();
const mockSearchNlg = jest.fn();
const mockSearchHardcover = jest.fn();

jest.mock('@/lib/books/googleBooks', () => ({
  searchGoogleBooks: (...args: unknown[]) => mockSearchGoogleBooks(...args),
}));

jest.mock('@/lib/books/openLibrary', () => ({
  searchOpenLibrary: (...args: unknown[]) => mockSearchOpenLibrary(...args),
}));

jest.mock('@/lib/books/nlg', () => ({
  ...jest.requireActual('@/lib/books/nlg'),
  searchNlg: (...args: unknown[]) => mockSearchNlg(...args),
}));

jest.mock('@/lib/books/hardcover', () => ({
  searchHardcover: (...args: unknown[]) => mockSearchHardcover(...args),
}));

jest.mock('@/lib/api-cache/external', () => ({ cachedExternalFetch: jest.fn() }));

const TAKEN_DOWN = 'https://assets.hardcover.app/edition/1/taken-down.jpeg';

jest.mock('@/lib/books/coverBlocklist', () => {
  const actual = jest.requireActual('@/lib/books/coverBlocklist');
  return {
    ...actual,
    withoutBlockedCovers: (book: Parameters<typeof actual.withoutBlockedCovers>[0]) =>
      actual.withoutBlockedCovers(book, new Set([TAKEN_DOWN])),
  };
});

import { booksSearchConfig } from '../books';
import type { BookCandidate } from '@/lib/books/types';

const book = (overrides: Partial<BookCandidate>): BookCandidate => ({
  googleBooksId: null,
  openLibraryId: null,
  nlgId: null,
  hardcoverId: null,
  sources: [],
  isbn13: null,
  isbns: [],
  title: 'Untitled',
  subtitle: null,
  authors: [],
  categories: [],
  description: null,
  pageCount: null,
  publishedDate: null,
  publisher: null,
  popularity: null,
  coverLarge: null,
  coverSmall: null,
  ...overrides,
});

describe('booksSearchConfig', () => {
  beforeEach(() => {
    mockSearchGoogleBooks.mockReset().mockResolvedValue([]);
    mockSearchOpenLibrary.mockReset().mockResolvedValue([]);
    mockSearchNlg.mockReset().mockResolvedValue([]);
    mockSearchHardcover.mockReset().mockResolvedValue([]);
  });

  it('queries both providers and merges their results', async () => {
    mockSearchGoogleBooks.mockResolvedValue([
      book({ googleBooksId: 'g1', title: 'Zorba', isbns: ['9789602116524'] }),
    ]);
    mockSearchOpenLibrary.mockResolvedValue([
      book({ openLibraryId: 'OL1W', title: 'Zorba', isbns: ['9789602116524'], pageCount: 300 }),
      book({ openLibraryId: 'OL2W', title: 'Kapetan Michalis' }),
    ]);

    const result = await booksSearchConfig.fetchExternal('zorba', {
      category: 'books',
      limit: 12,
      page: 1,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ googleBooksId: 'g1', openLibraryId: 'OL1W', pageCount: 300 });
    expect(result[1].openLibraryId).toBe('OL2W');
  });

  it('passes the ISBN to both providers for an ISBN query', async () => {
    mockSearchGoogleBooks.mockResolvedValue([]);
    mockSearchOpenLibrary.mockResolvedValue([]);

    await booksSearchConfig.fetchExternal('978-960-211-652-4', {
      category: 'books',
      limit: 12,
      page: 1,
    });

    expect(mockSearchGoogleBooks.mock.calls[0][1]).toMatchObject({ isbn: '9789602116524' });
    expect(mockSearchOpenLibrary.mock.calls[0][1]).toMatchObject({ isbn: '9789602116524' });
  });

  it('maps an Open Library-only book to an addable payload', () => {
    const item = booksSearchConfig.mapExternalItem(
      book({
        openLibraryId: 'OL1W',
        isbn13: '9789602116524',
        title: 'Zorba',
        authors: ['Kazantzakis'],
        publishedDate: '1946',
      }),
      'books',
    ) as { id: string; externalId: string; payload: Record<string, unknown> };

    expect(item.id).toBe('ol-OL1W');
    expect(item.externalId).toBe('OL1W');
    expect(item.payload).toMatchObject({
      google_books_id: null,
      open_library_id: 'OL1W',
      isbn_13: '9789602116524',
      source: 'open_library',
      category: 'books',
      release_date: '1946-01-01',
      tags: ['Kazantzakis'],
    });
  });

  it('gives local and external items comparable identity keys', () => {
    const localKeys = booksSearchConfig.getLocalExternalIds!({
      id: 1,
      google_books_id: null,
      open_library_id: null,
      isbn_13: '9789602116524',
    });
    const externalKeys = booksSearchConfig.getExternalIds!(
      book({ openLibraryId: 'OL1W', isbns: ['9789602116524'] }),
    );

    expect(externalKeys.some(key => localKeys.includes(key))).toBe(true);
  });

  it('searches local books by ISBN as well as title for an ISBN query', () => {
    expect(booksSearchConfig.buildLocalOrFilter('978-960-211-652-4')).toContain(
      'isbn_13.eq.9789602116524',
    );
    expect(booksSearchConfig.buildLocalOrFilter('zorba')).not.toContain('isbn_13');
  });

  it('keeps Greek letters when normalising the retry term', () => {
    expect(booksSearchConfig.normalizeSearchTerm!('Ζορμπάς, ο Έλληνας!')).toBe('Ζορμπάς ο Έλληνας');
  });

  it('asks the NLG catalogue only for Greek queries, and lets its title win', async () => {
    await booksSearchConfig.fetchExternal('lord of the rings', {
      category: 'books',
      limit: 12,
      page: 1,
    });
    expect(mockSearchNlg).not.toHaveBeenCalled();

    mockSearchNlg.mockResolvedValue([
      book({
        nlgId: 562948,
        sources: ['nlg'],
        title: 'Ο άρχοντας των δακτυλιδιών',
        isbns: ['9789600403664'],
      }),
    ]);
    mockSearchGoogleBooks.mockResolvedValue([
      book({
        googleBooksId: 'g-kedros',
        sources: ['google_books'],
        title: 'Ο Άρχοντας των Δαχτυλιδιών (Google)',
        isbns: ['9789600403664'],
        description: 'Από το Google',
      }),
    ]);

    const [first] = await booksSearchConfig.fetchExternal('ο άρχοντας των δακτυλιδιών', {
      category: 'books',
      limit: 12,
      page: 1,
    });

    expect(mockSearchNlg).toHaveBeenCalled();
    expect(first).toMatchObject({
      nlgId: 562948,
      googleBooksId: 'g-kedros',
      title: 'Ο άρχοντας των δακτυλιδιών',
      description: 'Από το Google',
      sources: ['nlg', 'google_books'],
    });
  });

  it('merges Hardcover results and passes the page to every provider', async () => {
    mockSearchHardcover.mockResolvedValue([
      book({ hardcoverId: 7, sources: ['hardcover'], title: 'Dune', popularity: 9000 }),
    ]);

    const result = await booksSearchConfig.fetchExternal('dune', {
      category: 'books',
      limit: 12,
      page: 3,
    });

    expect(result.map(item => item.hardcoverId)).toEqual([7]);
    for (const provider of [mockSearchGoogleBooks, mockSearchOpenLibrary, mockSearchHardcover]) {
      expect(provider.mock.calls[0][1]).toMatchObject({ page: 3, limit: 12 });
    }
  });

  it('is paginated', () => {
    expect(booksSearchConfig.paginated).toBe(true);
  });

  it('maps a Hardcover-only book with its id and source', () => {
    const item = booksSearchConfig.mapExternalItem(
      book({ hardcoverId: 328491, sources: ['hardcover'], title: 'Dune' }),
      'books',
    ) as { id: string; externalId: string; payload: Record<string, unknown> };

    expect(item.id).toBe('hc-328491');
    expect(item.externalId).toBe('HC328491');
    expect(item.payload).toMatchObject({ hardcover_id: 328491, source: 'hardcover' });
  });

  it('shows the first author for local rows without a subtitle', () => {
    expect(
      booksSearchConfig.mapLocalItem({ id: 1, title: 'The Lord of the Rings', tags: ['Tolkien'] }),
    ).toMatchObject({ subtitle: 'Tolkien' });
  });

  describe('provenance', () => {
    const env = process.env;
    afterEach(() => {
      process.env = env;
    });

    it('says where a result came from outside production', () => {
      const local = booksSearchConfig.mapLocalItem({ id: 1, title: 'x', source: 'open_library' });
      const external = booksSearchConfig.mapExternalItem(
        book({ googleBooksId: 'g1', sources: ['google_books', 'open_library'] }),
        'books',
      );

      expect(local).toMatchObject({
        provenance: { origin: 'local', providers: ['open_library'] },
      });
      expect(external).toMatchObject({
        provenance: { origin: 'external', providers: ['google_books', 'open_library'] },
      });
    });

    it('is left out of production responses', () => {
      process.env = { ...env, VERCEL_ENV: 'production' };

      expect(booksSearchConfig.mapLocalItem({ id: 1, title: 'x' })).not.toHaveProperty(
        'provenance',
      );
    });

    it('is shown on Vercel preview deployments', () => {
      process.env = { ...env, VERCEL_ENV: 'preview', NODE_ENV: 'production' };

      expect(booksSearchConfig.mapLocalItem({ id: 1, title: 'x' })).toHaveProperty('provenance');
    });
  });

  it("drops a cover taken down after a notice, and another provider's cover takes its place", async () => {
    mockSearchHardcover.mockResolvedValue([
      book({
        hardcoverId: 1,
        sources: ['hardcover'],
        title: 'Homeland',
        isbns: ['9780786939541'],
        coverLarge: TAKEN_DOWN,
        coverSmall: TAKEN_DOWN,
      }),
    ]);
    mockSearchOpenLibrary.mockResolvedValue([
      book({
        openLibraryId: 'OL1W',
        sources: ['open_library'],
        title: 'Homeland',
        isbns: ['9780786939541'],
        coverLarge: 'https://covers.openlibrary.org/b/id/1-L.jpg',
        coverSmall: 'https://covers.openlibrary.org/b/id/1-M.jpg',
      }),
    ]);

    const [result] = await booksSearchConfig.fetchExternal('homeland', {
      category: 'books',
      limit: 12,
      page: 1,
    });

    expect(result.hardcoverId).toBe(1);
    expect(result.coverLarge).toBe('https://covers.openlibrary.org/b/id/1-L.jpg');
  });
});
