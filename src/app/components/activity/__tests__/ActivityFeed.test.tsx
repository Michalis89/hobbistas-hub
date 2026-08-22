import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useSWR from 'swr';
import { useSelector } from 'react-redux';
import {
  ActivityFeed,
  type ActivityItem,
  renderActivityText,
} from '@/app/components/activity/ActivityFeed';

jest.mock('swr', () => jest.fn());
jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));
jest.mock('@/store/slices/authSlice', () => ({
  selectUser: jest.fn(),
}));

const useSWRMock = useSWR as jest.Mock;
const useSelectorMock = useSelector as unknown as jest.Mock;

function activity(
  type: ActivityItem['type'],
  payload: ActivityItem['payload'] = {},
  id = Math.floor(Math.random() * 100000),
): ActivityItem {
  return {
    id,
    user_id: 'user-1',
    type,
    payload: { display_name: 'Mina', ...payload },
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  };
}

function mockActivityState({
  activities = [],
  isLoading = false,
  error,
}: {
  activities?: ActivityItem[];
  isLoading?: boolean;
  error?: Error;
}) {
  useSWRMock.mockReturnValue({
    data: activities.length > 0 ? { activities } : undefined,
    isLoading,
    error,
  });
}

describe('renderActivityText', () => {
  it.each([
    [activity('backlog_added', { gameTitle: 'Halo' }), 'Mina added to backlog: Halo'],
    [
      activity('backlog_status', { gameTitle: 'Halo', favoriteAction: 'added' }),
      'Mina favorited: Halo',
    ],
    [
      activity('backlog_status', { gameTitle: 'Halo', favoriteAction: 'removed' }),
      'Mina removed from favorites: Halo',
    ],
    [
      activity('backlog_status', { gameTitle: 'Halo', status: 'platinumed' }),
      'Mina earned platinum: Halo',
    ],
    [
      activity('backlog_status', { gameTitle: 'Halo', status: 'completed' }),
      'Mina completed: Halo',
    ],
    [activity('backlog_status', { gameTitle: 'Halo', status: 'playing' }), 'Mina is playing: Halo'],
    [
      activity('backlog_status', { gameTitle: 'Halo', status: 'to_play' }),
      'Mina added to backlog: Halo',
    ],
    [activity('backlog_status', { gameTitle: 'Halo', status: 'dropped' }), 'Mina dropped: Halo'],
    [
      activity('backlog_status', { gameTitle: 'Halo', status: 'paused' }),
      'Mina changed status to paused: Halo',
    ],
    [activity('backlog_status', { gameTitle: 'Halo' }), 'Mina changed status to : Halo'],
    [
      activity('media_added', { category: 'games', title: 'Hades', status: 'planned' }),
      'Mina added the game to backlog: Hades',
    ],
    [
      activity('media_added', { category: 'games', title: 'Hades', status: 'archived' }),
      'Mina added the game: Hades',
    ],
    [
      activity('media_added', { category: 'books', title: 'Dune', status: 'current' }),
      'Mina started reading the book: Dune',
    ],
    [
      activity('media_added', { category: 'anime', title: 'Frieren', status: 'current' }),
      'Mina started watching the anime: Frieren',
    ],
    [
      activity('media_added', { category: 'tv', title: 'Severance', status: 'completed' }),
      'Mina completed the series: Severance',
    ],
    [
      activity('media_added', { category: 'unknown', title: 'Thing', status: 'dropped' }),
      'Mina dropped the media: Thing',
    ],
    [
      activity('media_status', { category: 'games', title: 'Hades', status: 'planned' }),
      'Mina added the game to backlog: Hades',
    ],
    [
      activity('media_status', { category: 'games', title: 'Hades', status: 'paused' }),
      'Mina changed status game: Hades',
    ],
    [
      activity('media_status', { category: 'books', title: 'Dune', status: 'current' }),
      'Mina is reading the book: Dune',
    ],
    [
      activity('media_status', { category: 'movies', title: 'Heat', status: 'current' }),
      'Mina is watching the movie: Heat',
    ],
    [
      activity('media_status', { category: 'manga', title: 'Monster', status: 'completed' }),
      'Mina completed the manga: Monster',
    ],
    [
      activity('media_status', { category: 'unknown', title: 'Thing', status: 'paused' }),
      'Mina changed status media: Thing',
    ],
    [
      activity('media_favorite', { category: 'movies', title: 'Heat' }),
      'Mina favorited the movie: Heat',
    ],
    [
      activity('media_favorite', { category: 'movies', title: 'Heat', favoriteAction: 'removed' }),
      'Mina removed from favorites the movie: Heat',
    ],
    [activity('article_created', { articleTitle: 'Guide' }), 'Mina published article: Guide'],
    [
      activity('article_created', { articleTitle: 'Review', topic: 'reviews' }),
      'Mina published the review: Review',
    ],
    [activity('article_updated', { articleTitle: 'Guide' }), 'Mina updated article: Guide'],
    [activity('article_deleted', { articleTitle: 'Guide' }), 'Mina deleted article: Guide'],
    [activity('article_liked', { articleTitle: 'Guide' }), 'Mina liked: Guide'],
    [activity('article_unliked', { articleTitle: 'Guide' }), 'Mina removed like from: Guide'],
    [activity('article_comment', { articleTitle: 'Guide' }), 'Mina commented on: Guide'],
    [activity('article_commented', { articleTitle: 'Guide' }), 'Mina commented on: Guide'],
    [
      activity('article_comment_deleted', { articleTitle: 'Guide' }),
      'Mina deleted comment on: Guide',
    ],
    [activity('article_created', { topic: 'reviews' }), 'Mina published the review: review'],
    [
      { ...activity('article_created'), payload: { username: 'Nick', articleTitle: 'Guide' } },
      'Nick published article: Guide',
    ],
    [
      { ...activity('unknown' as ActivityItem['type']), payload: undefined },
      'User performed an action',
    ],
  ])('renders activity copy %#', (item, expected) => {
    expect(renderActivityText(item)).toBe(expected);
  });

  it('falls back when payload values are missing', () => {
    expect(renderActivityText({ ...activity('article_created'), payload: {} })).toBe(
      'User published article: article',
    );
  });
});

describe('ActivityFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-22T12:00:00Z').getTime());
    useSelectorMock.mockReturnValue({
      category_profile: {
        anime: {},
        books: {},
        games: {},
        manga: {},
        movies: {},
        tv: {},
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('requests activity with scope and limit and renders loading, error, and empty states', async () => {
    mockActivityState({ isLoading: true });
    const { unmount } = render(<ActivityFeed scope="me" limit={4} title="My feed" />);

    expect(useSWRMock).toHaveBeenCalledWith(
      '/api/activity?scope=me&limit=4',
      expect.any(Function),
      {
        revalidateOnFocus: false,
      },
    );
    expect(screen.getByText('My feed')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    const fetcher = useSWRMock.mock.calls[0][1] as (url: string) => Promise<unknown>;
    const json = jest.fn().mockResolvedValue({ activities: [] });
    const fetchMock = jest.fn().mockResolvedValue({ json });
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    await expect(fetcher('/api/activity?scope=me&limit=4')).resolves.toEqual({ activities: [] });
    expect(fetchMock).toHaveBeenCalledWith('/api/activity?scope=me&limit=4');

    unmount();
    mockActivityState({ error: new Error('Nope') });
    const errorView = render(<ActivityFeed scope="me" limit={4} />);
    expect(
      screen.getByText('Failed to load activity. Please try again later.'),
    ).toBeInTheDocument();

    errorView.unmount();
    mockActivityState({});
    render(<ActivityFeed scope="me" limit={4} />);
    expect(screen.getByText('No recent activity.')).toBeInTheDocument();
  });

  it('renders feed items, links, relative time, compact layout, custom height, and change callback', async () => {
    const onActivitiesChange = jest.fn();
    const activities = [
      activity(
        'article_created',
        {
          articleTitle: 'Co-op Guide',
          articleSlug: 'Co Op Guide',
        },
        1,
      ),
      activity('backlog_added', { gameTitle: 'Halo', category: 'games' }, 2),
      activity('media_status', { category: 'books', title: 'Dune', slug: 'Dune Book' }, 3),
      activity('media_status', { category: 'books', title: 'Untitled' }, 4),
    ];
    mockActivityState({ activities });

    const { container } = render(
      <ActivityFeed
        scope="global"
        compact
        height={240}
        showHeader={false}
        onActivitiesChange={onActivitiesChange}
      />,
    );

    expect(screen.queryByText('Latest activity')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /published article: Co-op Guide/i })).toHaveAttribute(
      'href',
      '/articles/Co Op Guide',
    );
    expect(screen.getByRole('link', { name: /added to backlog: Halo/i })).toHaveAttribute(
      'href',
      '/backlog?category=games',
    );
    expect(screen.getByRole('link', { name: /changed status book: Dune/i })).toHaveAttribute(
      'href',
      '/media/books/Dune Book',
    );
    expect(screen.getByText('Mina changed status book: Untitled')).toBeInTheDocument();
    expect(screen.getAllByText('2m ago')).toHaveLength(4);
    expect(container.querySelector('[style="max-height: 240px;"]')).toBeInTheDocument();
    await waitFor(() => expect(onActivitiesChange).toHaveBeenCalledWith(activities));
  });

  it('renders relative time boundaries', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-22T12:00:00Z'));
    mockActivityState({
      activities: [
        {
          ...activity('article_created', { articleTitle: 'Now', articleSlug: 'now' }, 1),
          created_at: new Date(Date.now() - 20 * 1000).toISOString(),
        },
        {
          ...activity('article_created', { articleTitle: 'Hours', articleSlug: 'hours' }, 2),
          created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        },
        {
          ...activity('article_created', { articleTitle: 'Days', articleSlug: 'days' }, 3),
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    });

    render(<ActivityFeed scope="global" />);

    expect(screen.getByText('20s ago')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText('2d ago')).toBeInTheDocument();

    jest.setSystemTime(new Date('2026-08-22T12:01:00Z'));
    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });

  it('renders category alerts for unavailable backlog and media categories', async () => {
    const user = userEvent.setup();
    useSelectorMock.mockReturnValue({ category_profile: { books: {} } });
    mockActivityState({
      activities: [
        activity('backlog_added', { gameTitle: 'Halo', category: 'games' }, 1),
        activity('media_added', { category: 'movies', title: 'Heat', slug: 'Heat' }, 2),
        activity('media_added', { category: 'coding', title: 'Repo', slug: 'Repo' }, 3),
      ],
    });

    render(<ActivityFeed scope="global" />);

    await user.click(screen.getByRole('button', { name: /added to backlog: Halo/i }));
    expect(screen.getByText('Category unavailable')).toBeInTheDocument();
    expect(screen.getByText('Games')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add it here' })).toHaveAttribute(
      'href',
      '/profile/edit#categories',
    );

    await user.click(screen.getByRole('button', { name: /added the movie: Heat/i }));
    expect(screen.getByText('Movies')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /added the media: Repo/i }));
    expect(screen.getByText('coding')).toBeInTheDocument();
  });

  it('renders all icon branches without crashing', () => {
    mockActivityState({
      activities: [
        activity('backlog_added', { gameTitle: 'One', category: 'games' }, 1),
        activity(
          'backlog_status',
          { gameTitle: 'Two', status: 'platinumed', category: 'games' },
          2,
        ),
        activity('backlog_status', { gameTitle: 'Three', status: 'dropped', category: 'games' }, 3),
        activity('backlog_status', { gameTitle: 'Four', status: 'playing', category: 'games' }, 4),
        activity(
          'backlog_status',
          { gameTitle: 'Five', favoriteAction: 'added', category: 'games' },
          5,
        ),
        activity(
          'backlog_status',
          { gameTitle: 'Six', favoriteAction: 'removed', category: 'games' },
          6,
        ),
        activity(
          'backlog_status',
          { gameTitle: 'Seven', status: 'completed', category: 'games' },
          7,
        ),
        activity('media_added', { category: 'anime', title: 'Eight', slug: 'Eight' }, 8),
        activity('media_status', { category: 'books', title: 'Nine', slug: 'Nine' }, 9),
        activity('media_favorite', { category: 'movies', title: 'Ten', slug: 'Ten' }, 10),
        activity('article_created', { articleTitle: 'Eleven', articleSlug: 'Eleven' }, 11),
        activity(
          'article_created',
          { articleTitle: 'Twelve', topic: 'reviews', articleSlug: 'Twelve' },
          12,
        ),
        activity('article_updated', { articleTitle: 'Thirteen', articleSlug: 'Thirteen' }, 13),
        activity(
          'article_updated',
          { articleTitle: 'Fourteen', topic: 'reviews', articleSlug: 'Fourteen' },
          14,
        ),
        activity('article_deleted', { articleTitle: 'Fifteen', articleSlug: 'Fifteen' }, 15),
        activity('article_liked', { articleTitle: 'Sixteen', articleSlug: 'Sixteen' }, 16),
        activity('article_unliked', { articleTitle: 'Seventeen', articleSlug: 'Seventeen' }, 17),
        activity('article_comment', { articleTitle: 'Eighteen', articleSlug: 'Eighteen' }, 18),
        activity('article_commented', { articleTitle: 'Nineteen', articleSlug: 'Nineteen' }, 19),
        activity('article_comment_deleted', { articleTitle: 'Twenty', articleSlug: 'Twenty' }, 20),
        { ...activity('unknown' as ActivityItem['type'], {}, 21), payload: undefined },
      ],
    });

    render(<ActivityFeed scope="global" limit={20} />);

    expect(screen.getByText(/earned platinum: Two/i)).toBeInTheDocument();
    expect(screen.getByText(/deleted comment on: Twenty/i)).toBeInTheDocument();
    expect(screen.getByText('User performed an action')).toBeInTheDocument();
  });

  it('renders fallback links and text without category context', () => {
    useSelectorMock.mockReturnValue(null);
    mockActivityState({
      activities: [
        activity('backlog_added', { gameTitle: 'No Category' }, 1),
        activity('media_added', { category: 'games', title: 'Missing Href' }, 2),
        activity('media_favorite', { title: 'No Category Favorite' }, 3),
      ],
    });

    render(<ActivityFeed scope="global" />);

    expect(screen.getByRole('link', { name: /added to backlog: No Category/i })).toHaveAttribute(
      'href',
      '/backlog',
    );
    expect(screen.getByText('Mina added the game to backlog: Missing Href')).toBeInTheDocument();
    expect(screen.getByText('Mina favorited the media: No Category Favorite')).toBeInTheDocument();
  });
});
