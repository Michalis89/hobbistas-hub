/**
 * Guards the AI-request boundary on the dashboard.
 *
 * The endpoint behind this section is not free — a cache miss reaches Gemini and writes a cache
 * row — so the dashboard merely having mounted is not a good enough reason to call it. These
 * tests assert on `fetch` itself rather than on what is rendered, because "nothing is visible" and
 * "nothing was requested" are very different outcomes here.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryDashboardSection, DashboardCategoryKey } from '@/lib/dashboard/category-data';
import type { CategoryStats, PersonalStats } from '@/app/components/home/types';

jest.mock('next/dynamic', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
      const Lazy = React.lazy(loader);
      return function DynamicStub(props: Record<string, unknown>) {
        return (
          <React.Suspense fallback={null}>
            <Lazy {...props} />
          </React.Suspense>
        );
      };
    },
  };
});

jest.mock('../CategorySuggestions', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../MediaSuggestions', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../DashboardCategoryStats', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../CategoryTopFive', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../CategoryInsightsGrid', () => ({ __esModule: true, default: () => <div /> }));

import CategoryDashboardTabs from '../CategoryDashboardTabs';

const AI_ENDPOINT = '/api/dashboard/ai-taste-profile';

function stats(overrides: Partial<Record<DashboardCategoryKey, Partial<CategoryStats>>> = {}) {
  const base = (o: Partial<CategoryStats> = {}): CategoryStats => ({
    total: 0,
    in_progress: 0,
    completed: 0,
    dropped: 0,
    hours: 0,
    ...o,
  });

  return {
    total_backlog: 0,
    in_progress: 0,
    completed: 0,
    total_hours: 0,
    games: base(overrides.games),
    anime: base(overrides.anime),
    manga: { ...base(overrides.manga), chapters: 0 },
    movies: base(overrides.movies),
    tv: base(overrides.tv),
    books: { ...base(overrides.books), pages: 0 },
    active_categories: [],
  } as PersonalStats;
}

const EMPTY_SECTION = {
  topFive: [],
  favorites: [],
  tasteProfileItems: [],
  mediaSuggestions: [],
  rhythmEntries: [],
  favoritesCount: 0,
} as unknown as CategoryDashboardSection;

function sections(): Record<DashboardCategoryKey, CategoryDashboardSection> {
  return {
    games: EMPTY_SECTION,
    books: EMPTY_SECTION,
    anime: EMPTY_SECTION,
    manga: EMPTY_SECTION,
    movies: EMPTY_SECTION,
    tv: EMPTY_SECTION,
  };
}

/** A games library well past the evidence threshold. */
const RICH_GAMES = { games: { total: 30, completed: 18, in_progress: 2, dropped: 4 } };

function renderTabs(props: {
  enabledCategories: DashboardCategoryKey[];
  stats: PersonalStats;
  isReadOnly?: boolean;
}) {
  return render(
    <CategoryDashboardTabs
      enabledCategories={props.enabledCategories}
      sections={sections()}
      stats={props.stats}
      isReadOnly={props.isReadOnly}
    />,
  );
}

function aiCalls(fetchMock: jest.Mock): unknown[][] {
  return (fetchMock.mock.calls as unknown[][]).filter(call =>
    String(call[0]).startsWith(AI_ENDPOINT),
  );
}

describe('CategoryDashboardTabs AI taste request boundary', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: null }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('requests the games profile when games is active and the library is rich enough', async () => {
    renderTabs({ enabledCategories: ['games', 'anime'], stats: stats(RICH_GAMES) });

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(String(aiCalls(fetchMock)[0]![0])).toBe(`${AI_ENDPOINT}?category=games`);
  });

  it('makes no request when the user has zero games entries', async () => {
    renderTabs({ enabledCategories: ['games', 'anime'], stats: stats() });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('makes no request when the games library is below the evidence threshold', async () => {
    renderTabs({
      enabledCategories: ['games'],
      stats: stats({ games: { total: 9, completed: 3, in_progress: 1, dropped: 1 } }),
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('counts only engaged titles, not a big planned backlog', async () => {
    renderTabs({
      enabledCategories: ['games'],
      stats: stats({ games: { total: 200, completed: 2, in_progress: 0, dropped: 0 } }),
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('makes no games request when anime is the active category', async () => {
    renderTabs({ enabledCategories: ['anime', 'manga'], stats: stats(RICH_GAMES) });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('makes no games request when movies is the active category', async () => {
    renderTabs({
      enabledCategories: ['movies', 'tv'],
      stats: stats({ ...RICH_GAMES, movies: { total: 80, completed: 60 } }),
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it.each(['anime', 'manga', 'movies', 'tv', 'books'] as DashboardCategoryKey[])(
    'requests no AI endpoint at all for %s',
    async category => {
      renderTabs({ enabledCategories: [category], stats: stats(RICH_GAMES) });

      await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
      expect(
        fetchMock.mock.calls.filter(call => String(call[0]).includes('ai-taste')),
      ).toHaveLength(0);
    },
  );

  it('requests once when switching back to games, and not while away from it', async () => {
    // Games is always the first visible tab (visibleCategories filters DASHBOARD_TAB_CATEGORIES,
    // which is games-first), so reaching another category means navigating away from it.
    renderTabs({ enabledCategories: ['games', 'anime'], stats: stats(RICH_GAMES) });
    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));

    await userEvent.click(screen.getByRole('tab', { name: /anime/i }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /anime/i })).toHaveAttribute(
      'data-state',
      'active',
    ));
    expect(aiCalls(fetchMock)).toHaveLength(1);

    await userEvent.click(screen.getByRole('tab', { name: /games/i }));

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(2));
    expect(String(aiCalls(fetchMock)[1]![0])).toBe(`${AI_ENDPOINT}?category=games`);
  });

  it('does not request again while games stays the active category', async () => {
    renderTabs({ enabledCategories: ['games', 'anime'], stats: stats(RICH_GAMES) });
    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));

    await userEvent.click(screen.getByRole('tab', { name: /games/i }));

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(1);
  });

  it('makes no request on someone else’s dashboard', async () => {
    renderTabs({
      enabledCategories: ['games'],
      stats: stats(RICH_GAMES),
      isReadOnly: true,
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });
});
