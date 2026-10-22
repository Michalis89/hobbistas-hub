import { subjectsToGenres } from '../genres';

describe('subjectsToGenres', () => {
  it('keeps only recognised genres from noisy Open Library subjects', () => {
    expect(
      subjectsToGenres([
        'Elves',
        'Dwarves',
        'evil',
        'fear',
        'hope',
        'young adult fiction',
        'Ficción',
        'Ficción fantástica inglesa',
        'Open Library Staff Picks',
        'English Fantasy fiction',
      ]),
    ).toEqual(['Young Adult', 'Fantasy']);
  });

  it('checks specific genres before generic ones', () => {
    expect(subjectsToGenres(['Science fiction', 'History and criticism', 'Fiction'])).toEqual([
      'Science Fiction',
      'Literary Criticism',
      'Fiction',
    ]);
  });

  it('deduplicates and caps the list', () => {
    const genres = subjectsToGenres([
      'Fantasy fiction',
      'Fantasy',
      'Horror',
      'Mystery',
      'Romance',
      'Poetry',
      'Drama',
    ]);
    expect(genres).toEqual(['Fantasy', 'Horror', 'Mystery', 'Romance', 'Poetry']);
  });

  it('splits Google BISAC paths and library headings into parts', () => {
    expect(subjectsToGenres(['Juvenile Fiction / Fantasy & Magic'])).toEqual([
      "Children's",
      'Fantasy',
    ]);
    expect(subjectsToGenres(['Fantasy fiction, English'])).toEqual(['Fantasy']);
    expect(subjectsToGenres(['Business & Economics'])).toEqual(['Business']);
  });

  it('handles missing input', () => {
    expect(subjectsToGenres(undefined)).toEqual([]);
  });
});
