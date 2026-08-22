import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import NewsPageClient from '@/app/(main)/articles/NewsPageClient';
import { useSelector } from 'react-redux';
import { getVisibleCategories } from '@/app/(main)/pages/_shared/categories';
import { CONTENT_PUBLISHED_EVENT } from '@/app/constants/contentEvents';
import { CATEGORY_LABELS, CATEGORY_SUBTITLES } from '@/app/(main)/articles/constants';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

jest.mock('@/store/slices/authSlice', () => ({
  __esModule: true,
  selectIsAuthenticated: jest.fn(),
}));

jest.mock('@/app/(main)/pages/_shared/categories', () => ({
  __esModule: true,
  getVisibleCategories: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a
      href={href}
      className={className}
      onClick={event => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

jest.mock('@/app/components/layout', () => ({
  __esModule: true,
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  __esModule: true,
  Card: ({ children }: { children: React.ReactNode }) => <article>{children}</article>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/cover-image', () => ({
  __esModule: true,
  IMAGE_SIZES: { grid3: 'grid3' },
  CoverThumbImage: ({ alt }: { alt: string }) => (
    <span aria-label={alt} data-testid="cover-image" />
  ),
}));

jest.mock('@/components/ui/empty', () => ({
  __esModule: true,
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));

jest.mock('@/components/ui/alert', () => ({
  __esModule: true,
  ErrorAlert: ({ message }: { message: string }) => <div>{message}</div>,
}));

jest.mock('@/utils/components/FormattedDate', () => ({
  __esModule: true,
  FormattedDate: ({ date }: { date: string }) => <span>{date}</span>,
}));

jest.mock('@/utils/slugify', () => ({
  __esModule: true,
  normalizeSlug: (slug: string) => `normalized-${slug}`,
}));

const baseCategories = [
  'games',
  'anime',
  'manga',
  'movies',
  'tv',
  'books',
  'coding',
  'pet',
  'vape',
];

type InitialArticle = NonNullable<ComponentProps<typeof NewsPageClient>['initialArticles']>[number];

function createArticle(overrides: Partial<InitialArticle> = {}): InitialArticle {
  return {
    id: 1,
    slug: 'article',
    title: 'Article',
    description: null,
    category: 'games',
    topic: 'articles',
    tags: [],
    cover_image: null,
    content_rich: null,
    content_html: null,
    meta_title: null,
    meta_description: null,
    author_id: 'author-1',
    status: 'published',
    is_featured: false,
    views: 0,
    likes: 0,
    reading_time_minutes: null,
    score: null,
    media_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    published_at: '2026-01-01T00:00:00.000Z',
    users: null,
    ...overrides,
  };
}

function mockFetchResponse(payload: unknown, ok = true) {
  global.fetch = jest.fn(async () => ({
    ok,
    json: async () => payload,
  })) as jest.Mock;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('NewsPageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getVisibleCategories as jest.Mock).mockReturnValue(baseCategories);
    (useSelector as unknown as jest.Mock).mockReturnValue(true);
    global.fetch = jest.fn() as jest.Mock;
  });

  it('renders initial article cards with tag/category context without fetching first', () => {
    render(
      <NewsPageClient
        initialCategory="games"
        initialTag="co-op"
        initialTotal={2}
        initialArticles={[
          createArticle({
            id: 1,
            slug: 'first-post',
            title: 'First Post',
            description: 'A practical article',
            category: 'games',
            topic: 'tutorials',
            tags: ['coop', 'guide'],
            cover_image: 'https://img/cover.png',
            users: { username: 'john', display_name: 'John', avatar_url: null },
            reading_time_minutes: 5,
            published_at: '2026-01-01',
            views: 123,
            likes: 321,
          }),
          createArticle({
            id: 2,
            slug: 'second-post',
            title: 'Second Post',
            description: null,
            category: 'games',
            topic: 'articles',
            tags: [],
            cover_image: null,
            users: null,
            reading_time_minutes: null,
            published_at: null,
            views: 11,
            likes: 22,
          }),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Games' })).toBeInTheDocument();
    expect(screen.getByText('First Post')).toBeInTheDocument();
    expect(screen.getByText('Second Post')).toBeInTheDocument();
    expect(screen.getByText('2 articles - co-op')).toBeInTheDocument();
    expect(screen.getByText('Tag:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear' })).toHaveAttribute(
      'href',
      '/articles?category=games',
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('321')).toBeInTheDocument();
    expect(screen.getByTestId('cover-image')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'First Post' })).toHaveAttribute(
      'href',
      '/articles/normalized-first-post',
    );
  });

  it('hides engagement metrics when user is not authenticated', async () => {
    (useSelector as unknown as jest.Mock).mockReturnValue(false);
    render(
      <NewsPageClient
        initialArticles={[
          createArticle({
            id: 3,
            slug: 'auth-post',
            title: 'Auth Post',
            description: 'desc',
            category: 'anime',
            topic: 'articles',
            published_at: null,
            views: 777,
            likes: 888,
          }),
        ]}
        initialTotal={1}
      />,
    );

    expect(screen.getByText('Auth Post')).toBeInTheDocument();
    expect(screen.queryByText('777')).not.toBeInTheDocument();
    expect(screen.queryByText('888')).not.toBeInTheDocument();
  });

  it('shows error alert when articles fetch fails', async () => {
    mockFetchResponse({}, false);

    render(<NewsPageClient initialCategory="games" />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CONTENT_PUBLISHED_EVENT, {
          detail: { type: 'article' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch articles')).toBeInTheDocument();
    });
  });

  it('shows empty state with default description when there are no articles', async () => {
    render(<NewsPageClient />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No articles yet')).toBeInTheDocument();
    expect(screen.getByText('No published articles are available yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '/articles');
  });

  it('refreshes list only when article publication event is dispatched', async () => {
    mockFetchResponse({
      data: [
        {
          id: 8,
          slug: 'event-post',
          title: 'Event Post',
          description: 'desc',
          category: 'games',
          topic: 'articles',
          tags: [],
          cover_image: null,
          users: null,
          reading_time_minutes: null,
          published_at: null,
          views: 1,
          likes: 2,
        },
      ],
    });

    const { unmount } = render(<NewsPageClient initialCategory="games" />);
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CONTENT_PUBLISHED_EVENT, {
          detail: { type: 'review' },
        }),
      );
    });
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CONTENT_PUBLISHED_EVENT, {
          detail: { type: 'article' },
        }),
      );
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    unmount();
  });

  it('supports category filter navigation links with current tag', async () => {
    const user = userEvent.setup();

    render(<NewsPageClient initialCategory="games" initialTag="retro" />);

    const animeFilter = screen.getByRole('link', { name: 'Anime' });
    expect(animeFilter).toHaveAttribute('href', '/articles?category=anime&tag=retro');

    await user.click(animeFilter);
  });

  it('falls back safely for unexpected article payload values', async () => {
    render(
      <NewsPageClient
        initialArticles={[
          createArticle({
            id: 31,
            slug: 'unexpected',
            title: 'Unexpected Payload',
            description: 'desc',
            category: 'unknown' as InitialArticle['category'],
            topic: 'articles',
            tags: ['weird'],
            users: { username: 'fallback-user', display_name: null, avatar_url: null },
            reading_time_minutes: 3,
            published_at: '2026-01-04',
            views: undefined as unknown as number,
            likes: undefined as unknown as number,
          }),
        ]}
        initialTotal={1}
      />,
    );

    expect(screen.getByText('Unexpected Payload')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.getByText('fallback-user')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });

  it('uses safe defaults when API payload lacks data array after refresh', async () => {
    mockFetchResponse({});

    render(<NewsPageClient initialCategory="games" />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CONTENT_PUBLISHED_EVENT, {
          detail: { type: 'article' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('shows generic error message when rejection is not an Error instance', async () => {
    global.fetch = jest.fn(async () => {
      throw 'network-failure';
    }) as jest.Mock;

    render(<NewsPageClient />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CONTENT_PUBLISHED_EVENT, {
          detail: { type: 'article' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('falls back to raw filter label when category label mapping is missing', async () => {
    const originalGamesLabel = CATEGORY_LABELS.games;
    (CATEGORY_LABELS as Record<string, string | undefined>).games = undefined;
    (getVisibleCategories as jest.Mock).mockReturnValue(['games']);

    render(<NewsPageClient />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'games' })).toBeInTheDocument();

    (CATEGORY_LABELS as Record<string, string | undefined>).games = originalGamesLabel;
  });

  it('uses fallback title/subtitle when selected category metadata mapping is missing', async () => {
    const originalGamesLabel = CATEGORY_LABELS.games;
    const originalGamesSubtitle = CATEGORY_SUBTITLES.games;
    (CATEGORY_LABELS as Record<string, string | undefined>).games = undefined;
    (CATEGORY_SUBTITLES as Record<string, string | undefined>).games = undefined;

    (getVisibleCategories as jest.Mock).mockReturnValue(['games']);

    render(<NewsPageClient initialCategory="games" />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Articles' })).toBeInTheDocument();
    expect(
      screen.getByText('Community-written articles and stories, clearly organized.'),
    ).toBeInTheDocument();

    (CATEGORY_LABELS as Record<string, string | undefined>).games = originalGamesLabel;
    (CATEGORY_SUBTITLES as Record<string, string | undefined>).games = originalGamesSubtitle;
  });

  it('does not update state after unmount when success response resolves later', async () => {
    const deferred = createDeferred<{ ok: boolean; json: () => Promise<{ data: unknown[] }> }>();
    global.fetch = jest.fn(() => deferred.promise) as jest.Mock;

    const { unmount } = render(<NewsPageClient />);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CONTENT_PUBLISHED_EVENT, {
          detail: { type: 'article' },
        }),
      );
    });
    unmount();

    await act(async () => {
      deferred.resolve({
        ok: true,
        json: async () => ({ data: [] }),
      });
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not update state after unmount when fetch throws later', async () => {
    const deferred = createDeferred<never>();
    global.fetch = jest.fn(() => deferred.promise) as jest.Mock;

    const { unmount } = render(<NewsPageClient />);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CONTENT_PUBLISHED_EVENT, {
          detail: { type: 'article' },
        }),
      );
    });
    unmount();

    await act(async () => {
      deferred.reject(new Error('late failure'));
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
