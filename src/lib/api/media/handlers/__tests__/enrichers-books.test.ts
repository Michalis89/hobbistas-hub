/**
 * @jest-environment node
 */

const mockFetchOpenLibraryWork = jest.fn();
const mockSearchOpenLibrary = jest.fn();
const mockSearchGoogleBooks = jest.fn();
const mockFetchNlgRecord = jest.fn();
const mockSearchNlg = jest.fn();
const mockCoverExists = jest.fn();

jest.mock('@/lib/api-cache/external', () => ({
  cachedExternalFetch: jest.fn(),
}));

jest.mock('@/lib/books/openLibrary', () => ({
  fetchOpenLibraryWork: (...args: unknown[]) => mockFetchOpenLibraryWork(...args),
  searchOpenLibrary: (...args: unknown[]) => mockSearchOpenLibrary(...args),
  openLibraryCoverUrl: (id: number, size: string) => `ol-cover-${id}-${size}`,
}));

jest.mock('@/lib/books/googleBooks', () => ({
  searchGoogleBooks: (...args: unknown[]) => mockSearchGoogleBooks(...args),
}));

jest.mock('@/lib/books/nlg', () => ({
  fetchNlgRecord: (...args: unknown[]) => mockFetchNlgRecord(...args),
  searchNlg: (...args: unknown[]) => mockSearchNlg(...args),
}));

jest.mock('@/lib/books/covers', () => ({
  ...jest.requireActual('@/lib/books/covers'),
  coverExists: (...args: unknown[]) => mockCoverExists(...args),
}));

import { enrichBookPayload } from '../enrichers';
import { MEDIA_CATEGORY_CONFIGS } from '../../config';

const NLG_COVER = 'https://covers.nlg.gr/?isbn=9789600403664&size=large';

describe('enrichBookPayload', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSearchGoogleBooks.mockResolvedValue([]);
    mockSearchOpenLibrary.mockResolvedValue([]);
    mockSearchNlg.mockResolvedValue([]);
    mockFetchNlgRecord.mockResolvedValue(null);
    mockFetchOpenLibraryWork.mockResolvedValue({ description: null, subjects: [], coverId: null });
    mockCoverExists.mockResolvedValue(true);
  });

  it('is registered as the books enricher', () => {
    expect(MEDIA_CATEGORY_CONFIGS.books.enricher).toBe(enrichBookPayload);
  });

  it('fills description, subjects and cover from the Open Library work', async () => {
    mockFetchOpenLibraryWork.mockResolvedValue({
      description: 'A work',
      subjects: ['Fantasy'],
      coverId: 42,
    });

    const result = await enrichBookPayload('books', 'OL1W', {
      category: 'books',
      open_library_id: 'OL1W',
      genres: [],
    });

    expect(result).toEqual({
      description: 'A work',
      genres: ['Fantasy'],
      cover_image_large: 'ol-cover-42-L',
      cover_image_medium: 'ol-cover-42-M',
    });
  });

  it('mixes an NLG book with the NLG record and Google Books for the same edition', async () => {
    mockFetchNlgRecord.mockResolvedValue({
      isbns: ['9789600403664'],
      pageCount: 589,
      publisher: 'Κέδρος',
      summary: null,
      genres: ['Fantasy', 'Fiction'],
      translators: [],
    });
    mockSearchGoogleBooks.mockResolvedValue([
      {
        googleBooksId: 'g-kedros',
        isbns: ['9789600403664'],
        description: 'Στο μικρό χωριό του Σάιρ…',
        coverLarge: 'google-cover',
        coverSmall: 'google-cover-small',
        categories: ['Fiction'],
        pageCount: 600,
      },
    ]);

    const result = await enrichBookPayload('books', 'NLG562948', {
      category: 'books',
      nlg_id: 562948,
      title: 'Ο άρχοντας των δακτυλιδιών',
      isbn_13: '9789600403664',
      cover_image_large: NLG_COVER,
      cover_image_medium: NLG_COVER,
      genres: [],
    });

    expect(mockSearchGoogleBooks).toHaveBeenCalledWith('', { limit: 1, isbn: '9789600403664' });
    expect(result).toEqual({
      page_count: 589,
      publisher: 'Κέδρος',
      genres: ['Fantasy', 'Fiction'],
      google_books_id: 'g-kedros',
      description: 'Στο μικρό χωριό του Σάιρ…',
    });
    // The NLG cover exists, so it is kept rather than replaced
    expect(result).not.toHaveProperty('cover_image_large');
  });

  it("drops an NLG cover the cover service does not have, so another provider's can fill it", async () => {
    mockCoverExists.mockResolvedValue(false);
    mockSearchGoogleBooks.mockResolvedValue([
      {
        googleBooksId: 'g1',
        isbns: ['9789600403664'],
        description: null,
        coverLarge: 'google-cover',
        coverSmall: 'google-cover-small',
        categories: [],
        pageCount: null,
      },
    ]);

    const result = await enrichBookPayload('books', 'NLG1', {
      category: 'books',
      nlg_id: 1,
      isbn_13: '9789600403664',
      cover_image_large: NLG_COVER,
      cover_image_medium: NLG_COVER,
    });

    expect(result).toMatchObject({
      cover_image_large: 'google-cover',
      cover_image_medium: 'google-cover-small',
    });
  });

  it('matches a Greek-ISBN book from another provider to its NLG record', async () => {
    mockSearchNlg.mockResolvedValue([{ nlgId: 562948, publisher: 'Κέδρος', pageCount: null }]);

    const result = await enrichBookPayload('books', 'g1', {
      category: 'books',
      google_books_id: 'g1',
      isbn_13: '9789600403664',
      description: 'Has one',
    });

    expect(mockSearchNlg).toHaveBeenCalledWith('', { limit: 1, isbn: '9789600403664' });
    expect(mockFetchNlgRecord).toHaveBeenCalledWith(562948);
    expect(result).toMatchObject({ nlg_id: 562948, publisher: 'Κέδρος' });
  });

  it('borrows a description from Open Library by ISBN without storing its work id', async () => {
    mockSearchOpenLibrary.mockResolvedValue([{ openLibraryId: 'OL27448W' }]);
    mockFetchOpenLibraryWork.mockResolvedValue({
      description: 'One Ring to rule them all',
      subjects: ['Fantasy'],
      coverId: null,
    });

    const result = await enrichBookPayload('books', 'NLG1', {
      category: 'books',
      nlg_id: 1,
      isbn_13: '9789600403664',
      cover_image_large: NLG_COVER,
    });

    expect(result).toMatchObject({ description: 'One Ring to rule them all' });
    expect(result).not.toHaveProperty('open_library_id');
  });

  it('skips the NLG catalogue for non-Greek ISBNs', async () => {
    await enrichBookPayload('books', 'g1', {
      category: 'books',
      google_books_id: 'g1',
      isbn_13: '9780747532699',
      description: 'Has one',
      cover_image_large: 'cover',
    });

    expect(mockSearchNlg).not.toHaveBeenCalled();
    expect(mockFetchNlgRecord).not.toHaveBeenCalled();
  });
});
