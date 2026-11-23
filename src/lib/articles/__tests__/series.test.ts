import { getPublicSeries } from '../series';
import getSupabaseServer from '@/lib/supabase-server';

jest.mock('server-only', () => ({}));
jest.mock('@/lib/supabase-server', () => ({ __esModule: true, default: jest.fn() }));

describe('public series visibility', () => {
  it('returns only the published query results in editorial order without positions', async () => {
    const articleStatus = jest.fn();
    const articleDate = jest.fn().mockResolvedValue({
      data: [
        { id: 3, slug: 'third', title: 'Third', topic: 'reviews', published_at: null },
        { id: 1, slug: 'first', title: 'First', topic: 'articles', published_at: null },
      ],
      error: null,
    });
    articleStatus.mockReturnValue({ or: articleDate });
    const from = jest.fn((table: string) => {
      if (table === 'article_series')
        {return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 9,
                    slug: 'series',
                    title: 'Series',
                    description: null,
                    cover_image: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };}
      if (table === 'article_series_chapters')
        {return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  { article_id: 1, position: 10 },
                  { article_id: 2, position: 20 },
                  { article_id: 3, position: 30 },
                ],
                error: null,
              }),
            }),
          }),
        };}
      if (table === 'article_series_translations')
        {return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
        };}
      if (table === 'articles') {return { select: () => ({ in: () => ({ eq: articleStatus }) }) };}
      if (table === 'article_translations')
        {return { select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) };}
      throw new Error(`Unexpected table ${table}`);
    });
    (getSupabaseServer as jest.Mock).mockReturnValue({ from });
    const result = await getPublicSeries({ slug: 'series' });
    expect(articleStatus).toHaveBeenCalledWith('status', 'published');
    expect(articleDate).toHaveBeenCalledWith(expect.stringContaining('published_at.lte.'));
    expect(result?.chapters.map(chapter => chapter.id)).toEqual([1, 3]);
    expect(JSON.stringify(result)).not.toContain('position');
    expect(JSON.stringify(result)).not.toContain('article_id');
  });
});
