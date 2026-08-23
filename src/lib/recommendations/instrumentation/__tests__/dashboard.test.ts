/**
 * @jest-environment node
 */

import type { CategoryDashboardSection, DashboardCategoryKey } from '@/lib/dashboard/category-data';
import { instrumentOwnDashboardSuggestions } from '../dashboard';

function section(mediaIds: number[]): CategoryDashboardSection {
  return {
    mediaSuggestions: mediaIds.map(mediaId => ({
      mediaId,
      category: 'games' as DashboardCategoryKey,
      title: `Title ${mediaId}`,
      cover: '',
      slug: `slug-${mediaId}`,
      reason: 'because',
      confidence: 0.8,
      source: 'database' as const,
    })),
  } as unknown as CategoryDashboardSection;
}

function sections(
  overrides: Partial<Record<DashboardCategoryKey, CategoryDashboardSection>>,
): Record<DashboardCategoryKey, CategoryDashboardSection> {
  return {
    games: section([]),
    books: section([]),
    anime: section([]),
    manga: section([]),
    movies: section([]),
    tv: section([]),
    ...overrides,
  } as Record<DashboardCategoryKey, CategoryDashboardSection>;
}

function client(upsert = jest.fn().mockResolvedValue({ error: null })) {
  return { supabase: { from: jest.fn(() => ({ upsert })) } as never, upsert };
}

describe('instrumentOwnDashboardSuggestions', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  afterAll(() => {
    warn.mockRestore();
  });

  it('stamps every suggestion with its serve id and slot index', async () => {
    const { supabase } = client();
    const result = await instrumentOwnDashboardSuggestions(
      supabase,
      'user-1',
      sections({ games: section([11, 22]) }),
    );

    const stamped = result.games.mediaSuggestions;
    expect(stamped[0].slotIndex).toBe(0);
    expect(stamped[1].slotIndex).toBe(1);
    expect(stamped[0].serveId).toBeTruthy();
    expect(stamped[1].serveId).toBe(stamped[0].serveId);
  });

  it('gives each category its own serve', async () => {
    const { supabase } = client();
    const result = await instrumentOwnDashboardSuggestions(
      supabase,
      'user-1',
      sections({ games: section([11]), anime: section([11]) }),
    );

    expect(result.games.mediaSuggestions[0].serveId).not.toBe(
      result.anime.mediaSuggestions[0].serveId,
    );
  });

  it('writes one batch per category that has suggestions', async () => {
    const { supabase, upsert } = client();
    await instrumentOwnDashboardSuggestions(
      supabase,
      'user-1',
      sections({ games: section([11, 22]), tv: section([33]) }),
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toHaveLength(2);
    expect(upsert.mock.calls[1][0]).toHaveLength(1);
  });

  it('skips categories with no suggestions', async () => {
    const { supabase, upsert } = client();
    await instrumentOwnDashboardSuggestions(supabase, 'user-1', sections({}));

    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns the sections even when the write fails', async () => {
    const upsert = jest.fn().mockRejectedValue(new Error('db gone'));
    const { supabase } = client(upsert);

    const result = await instrumentOwnDashboardSuggestions(
      supabase,
      'user-1',
      sections({ games: section([11]) }),
    );

    expect(result.games.mediaSuggestions).toHaveLength(1);
    expect(result.games.mediaSuggestions[0].title).toBe('Title 11');
  });

  it('leaves the suggestion content untouched', async () => {
    const { supabase } = client();
    const input = sections({ games: section([11]) });
    const original = { ...input.games.mediaSuggestions[0] };

    const result = await instrumentOwnDashboardSuggestions(supabase, 'user-1', input);
    const { serveId, slotIndex, ...rest } = result.games.mediaSuggestions[0];

    expect(rest).toEqual(original);
    expect(serveId).toBeTruthy();
    expect(slotIndex).toBe(0);
  });
});
