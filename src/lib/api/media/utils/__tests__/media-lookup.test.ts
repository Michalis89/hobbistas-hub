/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MEDIA_CATEGORY_CONFIGS } from '../../config';
import { backfillMediaGaps, findExistingMedia, resolveExternalIdValue } from '../media-lookup';

type Filter = [string, unknown];

/** Records the .eq() filters of each media_items lookup and answers from `rows`. */
function createLookupClient(rows: { id: number; [field: string]: unknown }[]) {
  const lookups: Filter[][] = [];
  const client = {
    from: () => {
      const filters: Filter[] = [];
      lookups.push(filters);
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return builder;
        },
        order: () => builder,
        limit: async () => ({
          data: rows.filter(row => filters.every(([field, value]) => row[field] === value)),
        }),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, lookups };
}

const books = MEDIA_CATEGORY_CONFIGS.books;
const anime = MEDIA_CATEGORY_CONFIGS.anime;

describe('resolveExternalIdValue', () => {
  it('prefers the primary field, then alternates in order', () => {
    expect(resolveExternalIdValue(books, { google_books_id: 'g1', isbn_13: '978' })).toBe('g1');
    expect(resolveExternalIdValue(books, { google_books_id: null, open_library_id: 'OL1W' })).toBe(
      'OL1W',
    );
    expect(resolveExternalIdValue(books, { isbn_13: '9789602116524' })).toBe('9789602116524');
  });

  it('returns null when no identifier is present', () => {
    expect(resolveExternalIdValue(books, { google_books_id: '', title: 'x' })).toBeNull();
    expect(resolveExternalIdValue(anime, { open_library_id: 'OL1W' })).toBeNull();
  });
});

describe('findExistingMedia', () => {
  it('finds a book by an alternate id when the primary id is unknown', async () => {
    const { client, lookups } = createLookupClient([
      { id: 7, category: 'books', google_books_id: 'other', isbn_13: '9789602116524' },
    ]);

    const id = await findExistingMedia(
      client,
      books,
      { google_books_id: 'g1', open_library_id: 'OL1W', isbn_13: '9789602116524' },
      'books',
    );

    expect(id).toBe(7);
    expect(lookups.map(filters => filters[0][0])).toEqual([
      'google_books_id',
      'open_library_id',
      'isbn_13',
    ]);
  });

  it('stops at the first match and scopes by category', async () => {
    const { client, lookups } = createLookupClient([
      { id: 1, category: 'books', google_books_id: 'g1' },
      { id: 2, category: 'manga', google_books_id: 'g1' },
    ]);

    await expect(
      findExistingMedia(client, books, { google_books_id: 'g1' }, 'books'),
    ).resolves.toBe(1);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toContainEqual(['category', 'books']);
  });

  it('only checks the primary field for single-provider categories', async () => {
    const { client, lookups } = createLookupClient([]);

    await expect(findExistingMedia(client, anime, { mal_id: 5 }, 'anime')).resolves.toBeNull();
    expect(lookups).toHaveLength(1);
  });
});

describe('backfillMediaGaps', () => {
  function createBackfillClient(current: Record<string, unknown>) {
    const update = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) }));
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: current, error: null }) }),
        }),
        update,
      }),
    };
    return { client: client as unknown as SupabaseClient, update };
  }

  it('fills only empty columns and never overwrites', async () => {
    const { client, update } = createBackfillClient({
      open_library_id: null,
      description: 'Existing',
      genres: [],
    });

    await backfillMediaGaps(
      client,
      9,
      { open_library_id: 'OL1W', description: 'New', genres: ['Fiction'], page_count: null },
      ['open_library_id', 'description', 'genres', 'page_count'],
      'Books',
    );

    expect(update).toHaveBeenCalledTimes(1);
    const updates = (update.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(updates).toMatchObject({ open_library_id: 'OL1W', genres: ['Fiction'] });
    expect(updates).not.toHaveProperty('description');
    expect(updates).not.toHaveProperty('page_count');
  });

  it('does nothing when the row is already complete', async () => {
    const { client, update } = createBackfillClient({ open_library_id: 'OL9W' });

    await backfillMediaGaps(client, 9, { open_library_id: 'OL1W' }, ['open_library_id'], 'Books');

    expect(update).not.toHaveBeenCalled();
  });
});
