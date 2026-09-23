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

/**
 * An anime library past anime's own threshold of eight engaged titles.
 *
 * Engaged means completed + in progress + dropped: 10 + 2 + 3. The planned remainder is excluded
 * on both sides of the wire.
 */
const RICH_ANIME = { anime: { total: 40, completed: 10, in_progress: 2, dropped: 3 } };

/**
 * A manga library past manga's own threshold of seven engaged families.
 *
 * Engaged means completed + in progress + dropped: 5 + 2 + 1. Note the stats the dashboard reads
 * are raw library rows rather than collapsed families, so this gate is deliberately looser than
 * the server's — the server counts families and may still refuse. That asymmetry is safe in this
 * direction only: the client may over-ask and be told no, but must never under-ask.
 */
const RICH_MANGA = { manga: { total: 25, completed: 5, in_progress: 2, dropped: 1 } };

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

  it.each(['movies', 'tv', 'books'] as DashboardCategoryKey[])(
    'requests no AI endpoint at all for %s, which has no adapter',
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

describe('CategoryDashboardTabs anime AI taste boundary', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: null }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('requests the anime profile when anime is active and the library is rich enough', async () => {
    renderTabs({ enabledCategories: ['anime'], stats: stats(RICH_ANIME) });

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(String(aiCalls(fetchMock)[0]![0])).toBe(`${AI_ENDPOINT}?category=anime`);
  });

  it('makes no request when the anime library is one title below anime’s threshold', async () => {
    // Seven engaged titles. Games would have asked at six; anime must not.
    renderTabs({
      enabledCategories: ['anime'],
      stats: stats({ anime: { total: 30, completed: 5, in_progress: 1, dropped: 1 } }),
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('makes no request when the anime backlog is large but nothing was watched', async () => {
    renderTabs({
      enabledCategories: ['anime'],
      stats: stats({ anime: { total: 300, completed: 1, in_progress: 0, dropped: 0 } }),
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('makes no anime request while games is the active tab', async () => {
    // Both libraries are rich; only the active tab may spend a request.
    renderTabs({
      enabledCategories: ['games', 'anime'],
      stats: stats({ ...RICH_GAMES, ...RICH_ANIME }),
    });

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(String(aiCalls(fetchMock)[0]![0])).toBe(`${AI_ENDPOINT}?category=games`);
  });

  it('asks for anime only after switching to the anime tab', async () => {
    renderTabs({
      enabledCategories: ['games', 'anime'],
      stats: stats({ ...RICH_GAMES, ...RICH_ANIME }),
    });
    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));

    await userEvent.click(screen.getByRole('tab', { name: /anime/i }));

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(2));
    expect(String(aiCalls(fetchMock)[1]![0])).toBe(`${AI_ENDPOINT}?category=anime`);
  });

  it('makes no anime request on someone else’s dashboard', async () => {
    renderTabs({
      enabledCategories: ['anime'],
      stats: stats(RICH_ANIME),
      isReadOnly: true,
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('renders no card when the endpoint returns no profile', async () => {
    renderTabs({ enabledCategories: ['anime'], stats: stats(RICH_ANIME) });

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(screen.queryByText(/Anime Identity/i)).toBeNull();
  });
});

describe('CategoryDashboardTabs manga AI taste boundary', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(
      async () => new Response(JSON.stringify({ profile: null }), { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests the manga profile when manga is active and the library is rich enough', async () => {
    renderTabs({ enabledCategories: ['manga'], stats: stats(RICH_MANGA) });

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(String(aiCalls(fetchMock)[0]![0])).toBe(`${AI_ENDPOINT}?category=manga`);
  });

  it('makes no request when the manga library is one title below manga’s threshold', async () => {
    // Six engaged titles. Games would have asked at six; manga must not.
    renderTabs({
      enabledCategories: ['manga'],
      stats: stats({ manga: { total: 30, completed: 4, in_progress: 1, dropped: 1 } }),
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('makes no request when the manga backlog is large but nothing was read', async () => {
    // A manga to-read pile is aspirational at a scale others are not: adding a two-hundred-
    // chapter series costs one click, and the server excludes planned entries entirely.
    renderTabs({
      enabledCategories: ['manga'],
      stats: stats({ manga: { total: 400, completed: 1, in_progress: 0, dropped: 0 } }),
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('makes no manga request while another tab is active', async () => {
    // All three libraries are rich; only the active tab may spend a request.
    renderTabs({
      enabledCategories: ['games', 'anime', 'manga'],
      stats: stats({ ...RICH_GAMES, ...RICH_ANIME, ...RICH_MANGA }),
    });

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(String(aiCalls(fetchMock)[0]![0])).toBe(`${AI_ENDPOINT}?category=games`);
  });

  it('asks for manga only after switching to the manga tab', async () => {
    renderTabs({
      enabledCategories: ['games', 'manga'],
      stats: stats({ ...RICH_GAMES, ...RICH_MANGA }),
    });
    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));

    await userEvent.click(screen.getByRole('tab', { name: /manga/i }));

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(2));
    expect(String(aiCalls(fetchMock)[1]![0])).toBe(`${AI_ENDPOINT}?category=manga`);
  });

  it('makes no manga request on someone else’s dashboard', async () => {
    renderTabs({
      enabledCategories: ['manga'],
      stats: stats(RICH_MANGA),
      isReadOnly: true,
    });

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(aiCalls(fetchMock)).toHaveLength(0);
  });

  it('renders no placeholder when the endpoint returns no profile', async () => {
    renderTabs({ enabledCategories: ['manga'], stats: stats(RICH_MANGA) });

    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(screen.queryByText(/Manga Identity/i)).toBeNull();
  });

  it('does not change what the games or anime tabs ask for', async () => {
    renderTabs({
      enabledCategories: ['games', 'anime', 'manga'],
      stats: stats({ ...RICH_GAMES, ...RICH_ANIME, ...RICH_MANGA }),
    });
    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(1));
    expect(String(aiCalls(fetchMock)[0]![0])).toBe(`${AI_ENDPOINT}?category=games`);

    await userEvent.click(screen.getByRole('tab', { name: /anime/i }));
    await waitFor(() => expect(aiCalls(fetchMock)).toHaveLength(2));
    expect(String(aiCalls(fetchMock)[1]![0])).toBe(`${AI_ENDPOINT}?category=anime`);
  });
});
