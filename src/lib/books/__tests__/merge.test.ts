import {
  bookIdentityKeys,
  mergeBookCandidates,
  mergeProviderResults,
  normalizeForMatch,
  rankBooksByQuery,
} from '../merge';
import type { BookCandidate } from '../types';

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

describe('normalizeForMatch', () => {
  it('folds case, accents (including Greek tonos) and punctuation', () => {
    expect(normalizeForMatch('Βίος και Πολιτεία του Αλέξη Ζορμπά!')).toBe(
      'βιος και πολιτεια του αλεξη ζορμπα',
    );
    expect(normalizeForMatch('Café: The Novel')).toBe('cafe the novel');
  });
});

describe('mergeBookCandidates', () => {
  it('fills a Google result from an Open Library result sharing an ISBN', () => {
    const google = book({
      googleBooksId: 'g1',
      title: 'Harry Potter',
      isbn13: '9780747532699',
      isbns: ['9780747532699'],
      description: 'From Google',
    });
    const ol = book({
      openLibraryId: 'OL82563W',
      title: "Harry Potter and the Philosopher's Stone",
      isbns: ['9780747532699', '9781408855652'],
      description: 'From OL',
      coverLarge: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      pageCount: 223,
    });

    const [merged, ...rest] = mergeBookCandidates([google], [ol]);

    expect(rest).toHaveLength(0);
    expect(merged).toMatchObject({
      googleBooksId: 'g1',
      openLibraryId: 'OL82563W',
      description: 'From Google',
      coverLarge: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      pageCount: 223,
    });
    expect(merged.isbns).toEqual(['9780747532699', '9781408855652']);
  });

  it('matches on title and first author when there is no shared ISBN', () => {
    const google = book({
      googleBooksId: 'g1',
      title: 'Ο Καπετάν Μιχάλης',
      authors: ['Νίκος Καζαντζάκης'],
    });
    const ol = book({
      openLibraryId: 'OL1W',
      title: 'Ο καπετάν Μιχάλης',
      authors: ['Νίκος Καζαντζάκης'],
    });

    const result = mergeBookCandidates([google], [ol]);

    expect(result).toHaveLength(1);
    expect(result[0].openLibraryId).toBe('OL1W');
  });

  it('interleaves books only the second provider knows', () => {
    const result = mergeBookCandidates(
      [book({ googleBooksId: 'g1', title: 'A' }), book({ googleBooksId: 'g2', title: 'B' })],
      [book({ openLibraryId: 'OL1W', title: 'C' }), book({ openLibraryId: 'OL2W', title: 'D' })],
    );

    expect(result.map(item => item.title)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('drops duplicates within the second provider', () => {
    const result = mergeBookCandidates(
      [],
      [
        book({ openLibraryId: 'OL1W', title: 'Same', authors: ['X'] }),
        book({ openLibraryId: 'OL2W', title: 'same', authors: ['x'] }),
      ],
    );

    expect(result).toHaveLength(1);
  });
});

describe('bookIdentityKeys', () => {
  it('namespaces every id so providers cannot collide', () => {
    expect(
      bookIdentityKeys({
        googleBooksId: 'g1',
        openLibraryId: 'OL1W',
        isbn13: '9789602116524',
        isbns: ['9789602116524', '9780747532699'],
      }),
    ).toEqual(['gb:g1', 'ol:OL1W', 'isbn:9789602116524', 'isbn:9780747532699']);
  });

  it('returns nothing for a book with no ids', () => {
    expect(bookIdentityKeys({})).toEqual([]);
  });
});

describe('rankBooksByQuery', () => {
  it('puts the book the user typed first, whichever provider found it', () => {
    const results = [
      book({ openLibraryId: 'OL1W', title: 'The Fellowship of the Ring' }),
      book({ googleBooksId: 'g1', title: 'The Lord of the Rings and Philosophy' }),
      book({ openLibraryId: 'OL2W', title: 'Bored of the Rings' }),
      book({ googleBooksId: 'g2', title: 'The Lord of the Rings', subtitle: 'Popular Culture' }),
      book({ openLibraryId: 'OL3W', title: 'The Hobbit & The Lord of the Rings [collection/set]' }),
      book({ googleBooksId: 'g3', title: 'The Lord of the Rings' }),
    ];

    expect(rankBooksByQuery(results, 'lord of the rings').map(item => item.title)).toEqual([
      'The Lord of the Rings',
      'The Lord of the Rings',
      'The Lord of the Rings and Philosophy',
      'The Hobbit & The Lord of the Rings [collection/set]',
      'The Fellowship of the Ring',
      'Bored of the Rings',
    ]);
    expect(rankBooksByQuery(results, 'lord of the rings')[0].googleBooksId).toBe('g3');
  });

  it('ignores Greek articles and accents', () => {
    const results = [
      book({ openLibraryId: 'OL1W', title: 'Ο Καπετάν Μιχάλης' }),
      book({ googleBooksId: 'g1', title: 'Ζορμπάς' }),
    ];

    expect(rankBooksByQuery(results, 'καπεταν μιχαλης')[0].openLibraryId).toBe('OL1W');
  });
});

describe('rankBooksByQuery provider mix', () => {
  it("puts each provider's best match first, then the rest by relevance", () => {
    const results = [
      book({ googleBooksId: 'g1', sources: ['google_books'], title: 'The Lord of the Rings' }),
      book({ googleBooksId: 'g2', sources: ['google_books'], title: 'The Lord of the Rings' }),
      book({ googleBooksId: 'g3', sources: ['google_books'], title: 'The Lord of the Rings' }),
      book({
        openLibraryId: 'OL1W',
        sources: ['open_library'],
        title: 'The Lord of the Rings and Philosophy',
      }),
      book({ hardcoverId: 1, sources: ['hardcover'], title: 'The Fellowship of the Ring' }),
    ];

    const ranked = rankBooksByQuery(results, 'lord of the rings').map(
      item => item.googleBooksId ?? item.openLibraryId ?? item.hardcoverId,
    );

    // Hardcover's best does not match the title at all, so it is not promoted
    expect(ranked).toEqual(['g1', 'OL1W', 'g2', 'g3', 1]);
  });

  it('promotes every provider when nothing matches the title (an author search)', () => {
    const results = [
      book({ googleBooksId: 'g1', sources: ['google_books'], title: 'A' }),
      book({ googleBooksId: 'g2', sources: ['google_books'], title: 'B' }),
      book({ hardcoverId: 1, sources: ['hardcover'], title: 'C' }),
    ];

    expect(rankBooksByQuery(results, 'tolkien').map(item => item.title)).toEqual(['A', 'C', 'B']);
  });

  it('breaks ties by Hardcover reader count', () => {
    const results = [
      book({ googleBooksId: 'g1', sources: ['google_books'], title: 'Dune', popularity: null }),
      book({ googleBooksId: 'g2', sources: ['google_books'], title: 'Dune', popularity: 5000 }),
    ];

    expect(rankBooksByQuery(results, 'dune')[0].googleBooksId).toBe('g2');
  });
});

describe('mergeProviderResults', () => {
  it('folds several provider lists, earlier lists winning', () => {
    const isbns = ['9789600000000'];
    const merged = mergeProviderResults([
      [book({ nlgId: 1, sources: ['nlg'], title: 'Ζορμπάς', isbns })],
      [
        book({
          googleBooksId: 'g1',
          sources: ['google_books'],
          title: 'Zorba',
          isbns,
          description: 'desc',
        }),
      ],
      [
        book({
          hardcoverId: 9,
          sources: ['hardcover'],
          title: 'Zorba the Greek',
          popularity: 800,
          isbns,
        }),
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      title: 'Ζορμπάς',
      nlgId: 1,
      googleBooksId: 'g1',
      hardcoverId: 9,
      description: 'desc',
      popularity: 800,
      sources: ['nlg', 'google_books', 'hardcover'],
    });
  });
});

describe('cover and ranking with Hardcover data', () => {
  it("prefers another provider's real cover over a cover guessed from an ISBN", () => {
    const [merged] = mergeBookCandidates(
      [
        book({
          hardcoverId: 1,
          sources: ['hardcover'],
          title: 'The Fellowship of the Ring',
          isbns: ['9780261102354'],
          coverLarge: 'https://covers.openlibrary.org/b/isbn/9780261102354-L.jpg?default=false',
        }),
      ],
      [
        book({
          openLibraryId: 'OL27513W',
          sources: ['open_library'],
          title: 'The Fellowship of the Ring',
          isbns: ['9780261102354'],
          coverLarge: 'https://covers.openlibrary.org/b/id/14627060-L.jpg',
          coverSmall: 'https://covers.openlibrary.org/b/id/14627060-M.jpg',
        }),
      ],
    );

    expect(merged.coverLarge).toBe('https://covers.openlibrary.org/b/id/14627060-L.jpg');
    expect(merged.coverSmall).toBe('https://covers.openlibrary.org/b/id/14627060-M.jpg');
  });

  it('keeps a real cover over another real cover', () => {
    const [merged] = mergeBookCandidates(
      [book({ googleBooksId: 'g1', title: 'Dune', isbns: ['1'], coverLarge: 'google-cover' })],
      [book({ openLibraryId: 'OL1W', title: 'Dune', isbns: ['1'], coverLarge: 'ol-cover' })],
    );

    expect(merged.coverLarge).toBe('google-cover');
  });

  it('ranks the popular real book above a bare-title study guide', () => {
    const results = [
      book({
        hardcoverId: 1,
        sources: ['hardcover'],
        title: 'The Fellowship of the Ring',
        authors: ['SparkNotes'],
        popularity: 40,
      }),
      book({
        hardcoverId: 2,
        sources: ['hardcover'],
        title: 'The Fellowship of the Ring',
        subtitle: 'The Lord of the Rings: Part One',
        authors: ['J.R.R. Tolkien'],
        popularity: 52000,
      }),
    ];

    expect(rankBooksByQuery(results, 'fellowship of the ring')[0].hardcoverId).toBe(2);
  });
});

describe('cover quality across providers', () => {
  const HARDCOVER = 'https://assets.hardcover.app/edition/1/cover.jpeg';
  const GOOGLE = 'https://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1';
  const OPEN_LIBRARY = 'https://covers.openlibrary.org/b/id/14627060-L.jpg';

  it("shows Hardcover's sharp cover even when Google's data wins", () => {
    const [merged] = mergeBookCandidates(
      [book({ googleBooksId: 'g1', title: 'Homeland', isbns: ['1'], coverLarge: GOOGLE })],
      [book({ hardcoverId: 1, title: 'Homeland', isbns: ['1'], coverLarge: HARDCOVER })],
    );

    expect(merged.googleBooksId).toBe('g1');
    expect(merged.coverLarge).toBe(HARDCOVER);
  });

  it("prefers an Open Library work cover over Google's thumbnail", () => {
    const [merged] = mergeBookCandidates(
      [book({ googleBooksId: 'g1', title: 'Dune', isbns: ['1'], coverLarge: GOOGLE })],
      [book({ openLibraryId: 'OL1W', title: 'Dune', isbns: ['1'], coverLarge: OPEN_LIBRARY })],
    );

    expect(merged.coverLarge).toBe(OPEN_LIBRARY);
  });

  it('never trades a Hardcover cover for a lesser one', () => {
    const [merged] = mergeBookCandidates(
      [book({ hardcoverId: 1, title: 'Dune', isbns: ['1'], coverLarge: HARDCOVER })],
      [book({ openLibraryId: 'OL1W', title: 'Dune', isbns: ['1'], coverLarge: OPEN_LIBRARY })],
    );

    expect(merged.coverLarge).toBe(HARDCOVER);
  });
});
