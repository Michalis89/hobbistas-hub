import { act, render, screen, waitFor } from '@testing-library/react';
import ShareTokenPage, { dynamic, generateMetadata } from '@/app/(main)/share/[token]/page';
import getSupabaseServer from '@/lib/supabase-server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';

let shouldSuspendBacklogClient = false;
let suspendPromise: Promise<void> | null = null;
let resolveSuspend: (() => void) | null = null;

jest.mock('@/lib/supabase-server', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  __esModule: true,
  createRouteHandlerClient: jest.fn(),
}));

jest.mock('@/components/ui/skeleton', () => ({
  __esModule: true,
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" data-class={className} />
  ),
}));

jest.mock('@/app/(main)/u/[username]/backlog/PublicBacklogClient', () => ({
  __esModule: true,
  default: (props: {
    userId: string;
    username: string;
    defaultCategory: string;
    canToggleFavorite: boolean;
    shareToken: string;
  }) => {
    if (shouldSuspendBacklogClient && suspendPromise) {
      throw suspendPromise;
    }
    return <div data-testid="public-backlog-client">{JSON.stringify(props)}</div>;
  },
}));

type QueryResult = { data?: unknown; error?: unknown };

function createSupabaseMock(results: Record<string, QueryResult>) {
  return {
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn((column: string, value: string) => ({
          maybeSingle: jest
            .fn()
            .mockResolvedValue(results[`${table}:${column}:${value}`] ?? { data: null }),
        })),
      })),
    })),
  };
}

describe('share/[token]/page', () => {
  const futureDate = '2099-01-01T00:00:00.000Z';
  const pastDate = '2000-01-01T00:00:00.000Z';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    shouldSuspendBacklogClient = false;
    suspendPromise = null;
    resolveSuspend = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports force-dynamic rendering', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('builds invalid metadata for missing or expired tokens', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        'share_tokens:token:missing': { data: null },
        'share_tokens:token:expired': { data: { user_id: 'u1', expires_at: pastDate } },
      }),
    );

    await expect(
      generateMetadata({
        params: Promise.resolve({ token: 'missing' }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toEqual({
      title: 'Invalid Share Link | Hobbistas',
      // A dead token must be as unindexable as a live one.
      robots: { index: false },
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({ token: 'expired' }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toEqual({
      title: 'Invalid Share Link | Hobbistas',
      // A dead token must be as unindexable as a live one.
      robots: { index: false },
    });
  });

  it('builds user-specific metadata for a valid token', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        'share_tokens:token:valid': { data: { user_id: 'u1', expires_at: futureDate } },
        'users:id:u1': { data: { username: 'mike' } },
      }),
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ token: 'valid' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata).toMatchObject({
      title: "mike's Library | Hobbistas",
      description: 'Browse a shared read-only media library on Hobbistas.',
      robots: { index: false },
    });
  });

  it('falls back to generic shared metadata when the user record is missing', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        'share_tokens:token:valid': { data: { user_id: 'u1', expires_at: futureDate } },
        'users:id:u1': { data: null },
      }),
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ token: 'valid' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata).toMatchObject({
      title: 'Shared Library | Hobbistas',
      description: 'Browse a shared read-only media library on Hobbistas.',
    });
  });

  it('renders invalid link when token verification returns a DB error', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        'share_tokens:token:bad': { data: null, error: { message: 'db down' } },
      }),
    );

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'bad' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(console.error).toHaveBeenCalledWith('[share/token] DB error:', { message: 'db down' });
    expect(screen.getByText('Invalid Share Link')).toBeInTheDocument();
    expect(
      screen.getByText('Could not verify this share link. Please try again later.'),
    ).toBeInTheDocument();
  });

  it('renders invalid link when token is missing or expired', async () => {
    (getSupabaseServer as jest.Mock)
      .mockReturnValueOnce(
        createSupabaseMock({
          'share_tokens:token:missing': { data: null, error: null },
        }),
      )
      .mockReturnValueOnce(
        createSupabaseMock({
          'share_tokens:token:expired': {
            data: { user_id: 'u1', expires_at: pastDate },
            error: null,
          },
        }),
      );

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'missing' }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getByText('This share link is invalid or has been revoked.')).toBeInTheDocument();

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'expired' }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getAllByText('Invalid Share Link')).toHaveLength(2);
  });

  it('renders invalid link when the owner user cannot be found', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        'share_tokens:token:valid': {
          data: { user_id: 'u1', expires_at: futureDate },
          error: null,
        },
        'users:id:u1': { data: null },
      }),
    );

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'valid' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText('The owner of this link could not be found.')).toBeInTheDocument();
  });

  it('renders the shared backlog client using requested category and owner session match', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        'share_tokens:token:valid': {
          data: { user_id: 'u1', expires_at: futureDate },
          error: null,
        },
        'users:id:u1': { data: { id: 'u1', username: 'mike' } },
        'user_category_profiles:user_id:u1': {
          data: { profiles: { manga: { enabled: true }, anime: { enabled: true } } },
        },
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: 'u1' } } },
        }),
      },
    });

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'valid' }),
        searchParams: Promise.resolve({ category: 'tv' }),
      }),
    );

    const props = JSON.parse(screen.getByTestId('public-backlog-client').textContent ?? '{}');
    expect(props).toMatchObject({
      userId: 'u1',
      username: 'mike',
      defaultCategory: 'tv',
      canToggleFavorite: true,
      shareToken: 'valid',
    });
  });

  it('falls back to first profile category and then anime when no category is requested', async () => {
    (getSupabaseServer as jest.Mock)
      .mockReturnValueOnce(
        createSupabaseMock({
          'share_tokens:token:first-profile': {
            data: { user_id: 'u2', expires_at: futureDate },
            error: null,
          },
          'users:id:u2': { data: { id: 'u2', username: 'anna' } },
          'user_category_profiles:user_id:u2': {
            data: { profiles: { books: { enabled: true }, games: { enabled: true } } },
          },
        }),
      )
      .mockReturnValueOnce(
        createSupabaseMock({
          'share_tokens:token:no-profile': {
            data: { user_id: 'u3', expires_at: futureDate },
            error: null,
          },
          'users:id:u3': { data: { id: 'u3', username: 'leo' } },
          'user_category_profiles:user_id:u3': {
            data: null,
          },
        }),
      );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: 'someone-else' } } },
        }),
      },
    });

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'first-profile' }),
        searchParams: Promise.resolve({}),
      }),
    );
    let props = JSON.parse(screen.getByTestId('public-backlog-client').textContent ?? '{}');
    expect(props).toMatchObject({
      username: 'anna',
      defaultCategory: 'books',
      canToggleFavorite: false,
    });

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'no-profile' }),
        searchParams: Promise.resolve({}),
      }),
    );
    props = JSON.parse(screen.getAllByTestId('public-backlog-client')[1].textContent ?? '{}');
    expect(props).toMatchObject({
      username: 'leo',
      defaultCategory: 'anime',
      canToggleFavorite: false,
    });
  });

  it('renders the suspense skeleton while the shared backlog client is suspended', async () => {
    shouldSuspendBacklogClient = true;
    suspendPromise = new Promise<void>(resolve => {
      resolveSuspend = () => {
        shouldSuspendBacklogClient = false;
        resolve();
      };
    });

    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        'share_tokens:token:suspend': {
          data: { user_id: 'u9', expires_at: futureDate },
          error: null,
        },
        'users:id:u9': { data: { id: 'u9', username: 'nina' } },
        'user_category_profiles:user_id:u9': {
          data: { profiles: { games: { enabled: true } } },
        },
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: 'other' } } },
        }),
      },
    });

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'suspend' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getAllByTestId('skeleton')).toHaveLength(6);

    await act(async () => {
      resolveSuspend?.();
      await suspendPromise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('public-backlog-client')).toBeInTheDocument();
    });
  });

  it('renders generic invalid link when an unexpected error is thrown', async () => {
    (getSupabaseServer as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });

    render(
      await ShareTokenPage({
        params: Promise.resolve({ token: 'crash' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(console.error).toHaveBeenCalledWith(
      '[share/token] Unexpected error:',
      expect.any(Error),
    );
    expect(screen.getByText('Something went wrong. Please try again later.')).toBeInTheDocument();
  });
});
