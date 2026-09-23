import { loadUserMediaHistoryRows } from '../games/games-recommender';

function makeRow(id: number) {
  return {
    id,
    media_id: id,
    status: 'completed',
    score: 8,
    progress: null,
    priority: null,
    is_favorite: false,
    pinned_rank: null,
    updated_at: '2026-04-08T00:00:00.000Z',
    selected_platform: 'PlayStation 5',
    media_items: {
      id,
      title: `Game ${id}`,
      category: 'games',
      genres: ['Adventure'],
      igdb_themes: [],
      studios: ['Studio'],
      platforms: ['PlayStation 5'],
      cover_url_big: null,
      cover_url_thumb: null,
      cover_image_large: null,
      cover_image_medium: null,
    },
  };
}

describe('loadUserMediaHistoryRows', () => {
  it('loads all paginated history rows without dropping full pages', async () => {
    const pages = [
      Array.from({ length: 500 }, (_, index) => makeRow(index + 1)),
      Array.from({ length: 500 }, (_, index) => makeRow(index + 501)),
      Array.from({ length: 137 }, (_, index) => makeRow(index + 1001)),
    ];
    const range = jest
      .fn()
      .mockResolvedValueOnce({ data: pages[0], error: null })
      .mockResolvedValueOnce({ data: pages[1], error: null })
      .mockResolvedValueOnce({ data: pages[2], error: null });

    const query = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range,
    };
    const supabase = {
      from: jest.fn().mockReturnValue(query),
    };

    const rows = await loadUserMediaHistoryRows(supabase as never, 'user-1');

    expect(rows).toHaveLength(1137);
    expect(rows[0].media_items.studios).toEqual(['Studio']);
    expect(range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(range).toHaveBeenNthCalledWith(3, 1000, 1499);
  });
});
