import { getActivityHref } from '@/app/components/activity/activityHelpers';

describe('getActivityHref', () => {
  it('returns null when category is missing or not a string', () => {
    expect(getActivityHref({ type: 'media_added' })).toBeNull();
    expect(getActivityHref({ type: 'media_added', payload: {} })).toBeNull();
    expect(
      getActivityHref({ type: 'media_added', payload: { category: 12, slug: 'Halo' } }),
    ).toBeNull();
  });

  it('returns null when no slug-like value is present', () => {
    expect(getActivityHref({ type: 'media_added', payload: { category: 'games' } })).toBeNull();
  });

  it.each([
    ['slug', 'Mass Effect'],
    ['mediaSlug', 'Spirited Away'],
    ['gameSlug', 'Baldur Gate'],
    ['externalId', 123],
    ['mediaId', 456],
    ['tmdb_id', 789],
    ['mal_id', 1011],
    ['rawg_id', 1213],
    ['google_books_id', 'Book Id'],
  ])('builds a media href from %s', (key, value) => {
    expect(
      getActivityHref({ type: 'media_added', payload: { category: 'games', [key]: value } }),
    ).toBe(`/media/games/${String(value)}`);
  });

  it('prefers the first available slug source', () => {
    expect(
      getActivityHref({
        type: 'media_added',
        payload: { category: 'movies', slug: 'Primary Slug', mediaSlug: 'Secondary Slug' },
      }),
    ).toBe('/media/movies/Primary Slug');
  });

  it('normalizes leading and trailing slug dashes', () => {
    expect(
      getActivityHref({ type: 'media_added', payload: { category: 'books', slug: '-dune-' } }),
    ).toBe('/media/books/dune');
  });
});
