import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import AboutPage, { metadata, revalidate } from '@/app/(main)/about/page';
import { SITE_URL } from '@/config/site';
import getSupabaseServer from '@/lib/supabase-server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';

const aboutHeroMock = jest.fn(({ isAuthenticated }: { isAuthenticated: boolean }) => (
  <div data-testid="about-hero" data-auth={String(isAuthenticated)} />
));
const aboutFinalCtaMock = jest.fn(({ isAuthenticated }: { isAuthenticated: boolean }) => (
  <div data-testid="about-final-cta" data-auth={String(isAuthenticated)} />
));
const aboutPeopleMock = jest.fn(({ team }: { team: unknown[] }) => (
  <div data-testid="about-people">{JSON.stringify(team)}</div>
));

jest.mock('@/app/components/about', () => ({
  __esModule: true,
  AboutHero: (props: { isAuthenticated: boolean }) => aboutHeroMock(props),
  AboutTwoModes: () => <div data-testid="about-two-modes" />,
  AboutWhatYouGet: () => <div data-testid="about-what-you-get" />,
  AboutPhilosophy: () => <div data-testid="about-philosophy" />,
  AboutRoadmap: () => <div data-testid="about-roadmap" />,
  AboutPeople: (props: { team: unknown[] }) => aboutPeopleMock(props),
  AboutFAQ: () => <div data-testid="about-faq" />,
  AboutFinalCTA: (props: { isAuthenticated: boolean }) => aboutFinalCtaMock(props),
}));

jest.mock('@/utils/seo/StructuredData', () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="structured-data">{JSON.stringify(data)}</div>
  ),
}));

jest.mock('@/utils/seo/metadata/structuredData', () => ({
  __esModule: true,
  getBreadcrumbStructuredData: jest.fn(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [],
  })),
}));

jest.mock('@/lib/supabase-server', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  __esModule: true,
  createRouteHandlerClient: jest.fn(),
}));

type UsersQueryResult = { data: unknown[] | null; error: unknown };
type CategoryQueryResult = {
  data: Array<{ user_id: string; profiles: unknown }> | null;
  error: unknown;
};

function createSupabaseServerMock({
  usersResult,
  categoryResult,
  throwFromUsers = false,
}: {
  usersResult: UsersQueryResult;
  categoryResult: CategoryQueryResult;
  throwFromUsers?: boolean;
}) {
  return {
    from: (table: string) => {
      if (table === 'users') {
        if (throwFromUsers) {
          throw new Error('boom');
        }
        return {
          select: () => ({
            overlaps: async () => usersResult,
          }),
        };
      }

      if (table === 'user_category_profiles') {
        return {
          select: () => ({
            in: async () => categoryResult,
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function createAuthClient(session: unknown) {
  return {
    auth: {
      getSession: async () => ({
        data: { session },
      }),
    },
  };
}

describe('AboutPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports static page config', () => {
    expect(revalidate).toBe(3600);
    expect(metadata).toMatchObject({
      title: 'About Hobbistas',
      description: 'Learn who we are, how we work, and why Hobbistas was created for every hobby.',
    });
  });

  it('renders about sections, breadcrumb data, auth=true, and mapped team', async () => {
    const users = [
      {
        id: 'u1',
        username: 'owner',
        display_name: 'Owner',
        roles: ['owner'],
        bio: null,
        avatar_url: null,
        country: null,
      },
      {
        id: 'u2',
        username: 'mod',
        display_name: 'Moderator',
        roles: ['moderator'],
        bio: null,
        avatar_url: null,
        country: null,
      },
      {
        id: 'u3',
        username: 'author',
        display_name: 'Author',
        roles: ['author'],
        bio: null,
        avatar_url: null,
        country: null,
      },
    ];

    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: { data: users, error: null },
        categoryResult: {
          data: [
            { user_id: 'u1', profiles: { games: { favorite_platform: 'PC' } } },
            { user_id: 'u2', profiles: '{"games":{"favorite_platform":"PS5"}}' },
            { user_id: 'u3', profiles: 'invalid-json' },
          ],
          error: { message: 'category warning', code: 'W01' },
        },
      }),
    );

    (createRouteHandlerClient as jest.Mock).mockResolvedValue(
      createAuthClient({ id: 'session-1' }),
    );

    render((await AboutPage()) as ReactNode);

    expect(screen.getByTestId('structured-data')).toBeInTheDocument();
    expect(screen.getByTestId('about-hero')).toHaveAttribute('data-auth', 'true');
    expect(screen.getByTestId('about-final-cta')).toHaveAttribute('data-auth', 'true');
    expect(screen.getByTestId('about-what-you-get')).toBeInTheDocument();
    expect(screen.getByTestId('about-two-modes')).toBeInTheDocument();
    expect(screen.getByTestId('about-philosophy')).toBeInTheDocument();
    expect(screen.getByTestId('about-two-modes')).toBeInTheDocument();
    expect(screen.getByTestId('about-roadmap')).toBeInTheDocument();
    expect(screen.getByTestId('about-faq')).toBeInTheDocument();

    expect(getBreadcrumbStructuredData).toHaveBeenCalledWith([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'About', url: `${SITE_URL}/about` },
    ]);

    const teamPayload = JSON.parse(
      screen.getByTestId('about-people').textContent || '[]',
    ) as Array<{
      id: string;
      favorite_platform: string | null;
    }>;
    expect(teamPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'u1', favorite_platform: 'PC' }),
        expect.objectContaining({ id: 'u2', favorite_platform: 'PS5' }),
        expect.objectContaining({ id: 'u3', favorite_platform: null }),
      ]),
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load team category profiles',
      expect.objectContaining({ message: 'category warning', code: 'W01' }),
    );
  });

  it('uses empty team and auth=false when users query fails', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: {
          data: null,
          error: { message: 'users error', code: 'E01', hint: 'x', details: 'y' },
        },
        categoryResult: { data: null, error: null },
      }),
    );

    (createRouteHandlerClient as jest.Mock).mockResolvedValue(createAuthClient(null));

    render((await AboutPage()) as ReactNode);

    expect(screen.getByTestId('about-hero')).toHaveAttribute('data-auth', 'false');
    expect(screen.getByTestId('about-final-cta')).toHaveAttribute('data-auth', 'false');
    expect(JSON.parse(screen.getByTestId('about-people').textContent || '[]')).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load team',
      expect.objectContaining({
        message: 'users error',
        code: 'E01',
        hint: 'x',
        details: 'y',
      }),
    );
  });

  it('handles non-object users error payloads', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: {
          data: null,
          error: 'plain-error',
        },
        categoryResult: { data: null, error: null },
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue(createAuthClient(null));

    render((await AboutPage()) as ReactNode);

    expect(JSON.parse(screen.getByTestId('about-people').textContent || '[]')).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith('Failed to load team', 'plain-error');
  });

  it('returns empty team when users query succeeds with zero members', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: {
          data: [],
          error: null,
        },
        categoryResult: { data: [{ user_id: 'unused', profiles: {} }], error: null },
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue(createAuthClient(null));

    render((await AboutPage()) as ReactNode);

    expect(JSON.parse(screen.getByTestId('about-people').textContent || '[]')).toEqual([]);
  });

  it('handles users error object without known fields', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: {
          data: null,
          error: {},
        },
        categoryResult: { data: null, error: null },
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue(createAuthClient(null));

    render((await AboutPage()) as ReactNode);

    expect(JSON.parse(screen.getByTestId('about-people').textContent || '[]')).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load team',
      expect.objectContaining({
        message: undefined,
        code: undefined,
        hint: undefined,
        details: undefined,
      }),
    );
  });

  it('handles non-object parsed profiles and malformed profile rows', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: {
          data: [
            {
              id: 'u1',
              username: 'owner',
              display_name: 'Owner',
              roles: ['owner'],
              bio: null,
              avatar_url: null,
              country: null,
            },
          ],
          error: null,
        },
        categoryResult: {
          data: [
            { user_id: 'u1', profiles: '5' },
            null as unknown as { user_id: string; profiles: unknown },
          ],
          error: null,
        },
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue(createAuthClient(null));

    render((await AboutPage()) as ReactNode);

    const teamPayload = JSON.parse(
      screen.getByTestId('about-people').textContent || '[]',
    ) as Array<{
      id: string;
      favorite_platform: string | null;
    }>;
    expect(teamPayload).toEqual([expect.objectContaining({ id: 'u1', favorite_platform: null })]);
  });

  it('handles null category profiles payload via fallback iteration', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: {
          data: [
            {
              id: 'u1',
              username: 'owner',
              display_name: 'Owner',
              roles: ['owner'],
              bio: null,
              avatar_url: null,
              country: null,
            },
          ],
          error: null,
        },
        categoryResult: {
          data: null,
          error: null,
        },
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue(createAuthClient(null));

    render((await AboutPage()) as ReactNode);

    const teamPayload = JSON.parse(
      screen.getByTestId('about-people').textContent || '[]',
    ) as Array<{
      id: string;
      favorite_platform: string | null;
    }>;
    expect(teamPayload).toEqual([expect.objectContaining({ id: 'u1', favorite_platform: null })]);
  });

  it('uses empty team when server query throws', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseServerMock({
        usersResult: { data: [], error: null },
        categoryResult: { data: [], error: null },
        throwFromUsers: true,
      }),
    );
    (createRouteHandlerClient as jest.Mock).mockResolvedValue(createAuthClient(null));

    render((await AboutPage()) as ReactNode);

    expect(JSON.parse(screen.getByTestId('about-people').textContent || '[]')).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      'Supabase server error while loading team',
      expect.any(Error),
    );
  });
});
