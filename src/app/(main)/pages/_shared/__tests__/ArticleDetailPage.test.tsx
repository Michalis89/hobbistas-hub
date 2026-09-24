import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import ArticleDetailPage, {
  buildArticleDetailMetadata,
} from '@/app/(main)/pages/_shared/ArticleDetailPage';
import { notFound } from 'next/navigation';
import getSupabaseServer from '@/lib/supabase-server';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import { sanitizeHtmlContent } from '@/utils/security/sanitizeHtml';
import { buildArticleJsonLd, buildReviewJsonLd } from '@/lib/seo/jsonld';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { getUserSettings } from '@/lib/settings';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/headers', () => ({
  headers: async () => new Headers({ 'accept-language': 'en-US,en;q=0.9' }),
}));

jest.mock('next/navigation', () => ({
  __esModule: true,
  notFound: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  __esModule: true,
  Calendar: () => <span data-testid="icon-calendar" />,
  Eye: () => <span data-testid="icon-eye" />,
  FileText: () => <span data-testid="icon-filetext" />,
  Heart: () => <span data-testid="icon-heart" />,
}));

jest.mock('@/components/ui/cover-image', () => ({
  __esModule: true,
  CoverHeroImage: ({ alt }: { alt: string }) => <div data-testid="cover-hero">{alt}</div>,
  CoverThumbImage: ({ alt }: { alt: string }) => <div data-testid="cover-thumb">{alt}</div>,
}));

jest.mock('@/components/ui/card', () => ({
  __esModule: true,
  Card: ({ children }: { children: ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
  CardDescription: ({ children }: { children: ReactNode }) => (
    <div data-testid="card-description">{children}</div>
  ),
  CardTitle: ({ children }: { children: ReactNode }) => (
    <div data-testid="card-title">{children}</div>
  ),
}));

jest.mock('@/components/ui/breadcrumbs', () => ({
  __esModule: true,
  default: ({ items }: { items: unknown[] }) => (
    <div data-testid="breadcrumbs">{JSON.stringify(items)}</div>
  ),
}));

jest.mock('@/app/components/article/ReadingProgress.client', () => ({
  __esModule: true,
  default: () => <div data-testid="reading-progress" />,
}));

jest.mock('@/components/ui/empty', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

jest.mock('@/utils/seo/metadata/helpers', () => ({
  __esModule: true,
  buildMetadata: jest.fn(),
}));

jest.mock('@/utils/seo/StructuredData', () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="structured-data">{JSON.stringify(data)}</div>
  ),
}));

jest.mock('@/utils/seo/metadata/structuredData', () => ({
  __esModule: true,
  getBreadcrumbStructuredData: jest.fn((items: unknown[]) => ({ items })),
}));

jest.mock('@/utils/security/sanitizeHtml', () => ({
  __esModule: true,
  sanitizeHtmlContent: jest.fn((html: string) => html),
}));

jest.mock('@/lib/supabase-server', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/utils/slugify', () => ({
  __esModule: true,
  normalizeSlug: jest.fn((value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  ),
}));

jest.mock('@/app/components/article/ArticleComments.client', () => ({
  __esModule: true,
  default: ({ articleId }: { articleId: string }) => (
    <div data-testid="article-comments">{articleId}</div>
  ),
}));

jest.mock('@/app/components/article/ArticleAuthHint.client', () => ({
  __esModule: true,
  default: () => <div data-testid="article-auth-hint" />,
}));

jest.mock('@/utils/components/FormattedDate', () => ({
  __esModule: true,
  FormattedDate: ({ date }: { date: string }) => <span data-testid="formatted-date">{date}</span>,
}));

jest.mock('@/lib/seo/jsonld', () => ({
  __esModule: true,
  buildArticleJsonLd: jest.fn(() => ({ '@type': 'Article' })),
  buildReviewJsonLd: jest.fn(() => ({ '@type': 'Review' })),
}));

jest.mock('@/app/components/article/MetaActionsBar', () => ({
  __esModule: true,
  default: ({
    readTime,
    showEngagementMetrics,
    showActions,
  }: {
    readTime: string | null;
    showEngagementMetrics: boolean;
    showActions: boolean;
  }) => (
    <div
      data-testid="meta-actions"
      data-read-time={readTime ?? ''}
      data-metrics={String(showEngagementMetrics)}
      data-actions={String(showActions)}
    />
  ),
}));

jest.mock('@/components/article/ArticleContent', () => ({
  __esModule: true,
  ArticleContent: ({ html }: { html: string }) => <div data-testid="article-content">{html}</div>,
}));

jest.mock('@/components/article/typography', () => ({
  __esModule: true,
  ARTICLE_SUBTITLE: 'article-subtitle',
  ARTICLE_TITLE: 'article-title',
}));

jest.mock('@/app/components/article/TrackArticleView.client', () => ({
  __esModule: true,
  default: ({ articleId }: { articleId: string }) => (
    <div data-testid="track-article-view">{articleId}</div>
  ),
}));

jest.mock('@/config/site', () => ({
  __esModule: true,
  SITE_URL: 'https://example.com',
}));

jest.mock('@/app/(main)/articles/constants', () => ({
  __esModule: true,
  CATEGORY_LABELS: {
    books: 'Books',
    coding: 'Coding',
  },
  TOPIC_LABELS: {
    reviews: 'Reviews',
    news: 'News',
  },
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  __esModule: true,
  createRouteHandlerClient: jest.fn(),
}));

jest.mock('@/lib/settings', () => ({
  __esModule: true,
  getUserSettings: jest.fn(),
}));

type Resolver<T> = (state: {
  eq: Record<string, unknown>;
  neq: Record<string, unknown>;
  in: Record<string, unknown>;
  limit?: number;
}) => T;

function createSupabaseMock({
  singleResolvers = [],
  listResolvers = [],
  likesResolvers = [],
  translationResolver,
  readerLocaleResolver,
}: {
  singleResolvers?: Array<Resolver<{ data: unknown; error: unknown }>>;
  listResolvers?: Array<Resolver<{ data: unknown; error: unknown }>>;
  likesResolvers?: Array<Resolver<{ count: unknown }>>;
  /** Rows in `article_translations`; defaults to none. */
  translationResolver?: () => { data: unknown; error: unknown };
  /** The reader's saved language; defaults to unset. */
  readerLocaleResolver?: () => { data: unknown; error: unknown };
}) {
  const singles = [...singleResolvers];
  const lists = [...listResolvers];
  const likes = [...likesResolvers];

  return {
    from: (table: string) => {
      // Handled before the generic builder so they do not consume a resolver
      // from the queues the article/related queries are sequenced against.
      if (table === 'article_translations') {
        const translationQuery = {
          select: () => translationQuery,
          eq: () => translationQuery,
          then: (onFulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
            Promise.resolve(
              translationResolver ? translationResolver() : { data: [], error: null },
            ).then(onFulfilled),
        };
        return translationQuery;
      }

      if (table === 'users') {
        const userQuery = {
          select: () => userQuery,
          eq: () => userQuery,
          maybeSingle: async () =>
            readerLocaleResolver ? readerLocaleResolver() : { data: null, error: null },
        };
        return userQuery;
      }

      if (table === 'article_likes') {
        return {
          select: () => ({
            eq: async (column: string, value: unknown) => {
              const resolver = likes.shift();
              if (!resolver) {
                return { count: null };
              }
              return resolver({ eq: { [column]: value }, neq: {}, in: {} });
            },
          }),
        };
      }

      const state = {
        eq: {} as Record<string, unknown>,
        neq: {} as Record<string, unknown>,
        in: {} as Record<string, unknown>,
        limit: undefined as number | undefined,
      };

      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          state.eq[column] = value;
          return query;
        },
        neq: (column: string, value: unknown) => {
          state.neq[column] = value;
          return query;
        },
        in: (column: string, value: unknown) => {
          state.in[column] = value;
          return query;
        },
        order: () => query,
        limit: (value: number) => {
          state.limit = value;
          return query;
        },
        single: async () => {
          const resolver = singles.shift();
          if (!resolver) {
            return { data: null, error: { message: 'no single resolver' } };
          }
          return resolver(state);
        },
        maybeSingle: async () => {
          const resolver = singles.shift();
          return resolver ? resolver(state) : { data: null, error: null };
        },
        then: (
          onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
          const resolver = lists.shift();
          const result = resolver ? resolver(state) : { data: [], error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return query;
    },
  };
}

const baseArticle = {
  id: 'article-1',
  slug: 'My Fancy Slug',
  title: 'Deep Dive',
  description: 'Summary',
  meta_title: null,
  meta_description: null,
  cover_image: 'https://cdn.example.com/cover.jpg',
  content_html: '<h2>Intro</h2><h2 id="manual">Intro</h2>',
  published_at: '2025-02-10T10:00:00.000Z',
  updated_at: '2025-02-11T10:00:00.000Z',
  topic: 'reviews',
  tags: ['a', 'b'],
  category: 'books',
  author_id: 'author-1',
  views: 9,
  likes: 1,
  score: 8,
  reading_time_minutes: 5,
  users: {
    username: 'writer',
    display_name: 'Writer',
    avatar_url: null,
  },
};

describe('ArticleDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (notFound as jest.Mock).mockImplementation(() => {
      throw new Error('NOT_FOUND');
    });
    (buildMetadata as jest.Mock).mockImplementation((v: unknown) => v);
    (createRouteHandlerClient as jest.Mock).mockResolvedValue({
      auth: {
        getSession: async () => ({ data: { session: null } }),
      },
    });
    (getUserSettings as jest.Mock).mockResolvedValue({ social_enabled: false });
  });

  it('builds metadata with normalized canonical path, truncated description and image', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [
          () => ({
            data: {
              ...baseArticle,
              slug: 'Hello World',
              meta_title: 'Meta title',
              meta_description: `  ${'x'.repeat(180)}  `,
            },
            error: null,
          }),
        ],
      }),
    );

    const result = await buildArticleDetailMetadata({
      params: Promise.resolve({ slug: 'Hello World' }),
      options: {
        basePath: '/articles',
        breadcrumbLabel: 'Articles',
        topicFilter: 'reviews',
      },
    });

    expect(result).toMatchObject({
      title: 'Meta title',
      path: '/articles/hello-world',
      openGraphType: 'article',
      authors: ['Writer'],
      images: [
        expect.objectContaining({
          url: 'https://cdn.example.com/cover.jpg',
          width: 1200,
          height: 630,
        }),
      ],
    });
    expect((result as { description: string }).description.length).toBe(162);
  });

  it('leaves a single-language article on its bare canonical with no hreflang', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [() => ({ data: { ...baseArticle, slug: 'solo-post' }, error: null })],
      }),
    );

    const result = (await buildArticleDetailMetadata({
      params: Promise.resolve({ slug: 'solo-post' }),
      options: { basePath: '/articles', breadcrumbLabel: 'Articles' },
    })) as { path: string; languages?: unknown };

    expect(result.path).toBe('/articles/solo-post');
    // One self-referencing hreflang says nothing, so none is emitted.
    expect(result.languages).toBeUndefined();
  });

  it('canonicalises a requested translation to its own ?lang= URL', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [() => ({ data: { ...baseArticle, slug: 'solo-post' }, error: null })],
        translationResolver: () => ({
          data: [{ article_id: 'article-1', locale: 'el', title: 'Greek title' }],
          error: null,
        }),
      }),
    );

    const result = (await buildArticleDetailMetadata({
      params: Promise.resolve({ slug: 'solo-post' }),
      searchParams: Promise.resolve({ lang: 'el' }),
      options: { basePath: '/articles', breadcrumbLabel: 'Articles' },
    })) as {
      path: string;
      languages: Record<string, string>;
      ogLocale: string;
      ogAlternateLocales: string[];
    };

    // The regression this guards: the Greek version used to declare the
    // English URL as its canonical, which kept it out of the index entirely.
    expect(result.path).toBe('/articles/solo-post?lang=el');
    expect(result.languages).toEqual({
      en: '/articles/solo-post',
      el: '/articles/solo-post?lang=el',
      'x-default': '/articles/solo-post',
    });
    expect(result.ogLocale).toBe('el_GR');
    expect(result.ogAlternateLocales).toEqual(['en_US']);
  });

  it('keeps the English canonical when a translation exists but none is requested', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [() => ({ data: { ...baseArticle, slug: 'solo-post' }, error: null })],
        translationResolver: () => ({
          data: [{ article_id: 'article-1', locale: 'el', title: 'Greek title' }],
          error: null,
        }),
      }),
    );

    const result = (await buildArticleDetailMetadata({
      params: Promise.resolve({ slug: 'solo-post' }),
      options: { basePath: '/articles', breadcrumbLabel: 'Articles' },
    })) as { path: string; languages: Record<string, string>; ogLocale: string };

    expect(result.path).toBe('/articles/solo-post');
    expect(result.ogLocale).toBe('en_US');
    // Both versions still carry the full reciprocal annotation.
    expect(result.languages).toEqual({
      en: '/articles/solo-post',
      el: '/articles/solo-post?lang=el',
      'x-default': '/articles/solo-post',
    });
  });

  it('calls notFound for missing metadata row', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [() => ({ data: null, error: { message: 'missing' } })],
      }),
    );

    await expect(
      buildArticleDetailMetadata({
        params: Promise.resolve({ slug: 'missing' }),
        options: { basePath: '/articles', breadcrumbLabel: 'Articles' },
      }),
    ).rejects.toThrow('NOT_FOUND');
  });

  it('uses metadata fallbacks when description and image are missing', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [
          () => ({
            data: {
              ...baseArticle,
              meta_title: null,
              title: 'Fallback Title',
              meta_description: null,
              description: null,
              cover_image: null,
              users: null,
            },
            error: null,
          }),
        ],
      }),
    );

    const result = await buildArticleDetailMetadata({
      params: Promise.resolve({ slug: 'Fallback Title' }),
      options: { basePath: '/articles', breadcrumbLabel: 'Articles' },
    });

    expect(result).toMatchObject({
      title: 'Fallback Title',
      description: 'Stay tuned for updates or explore another story while we resolve this.',
      authors: ['Hobbistas'],
      images: undefined,
    });
  });

  it('uses username fallback in metadata and omits published/modified when timestamps are missing', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [
          () => ({
            data: {
              ...baseArticle,
              users: { username: 'only-username', display_name: null },
              published_at: null,
              updated_at: null,
              meta_description: 'short text',
            },
            error: null,
          }),
        ],
      }),
    );

    const result = await buildArticleDetailMetadata({
      params: Promise.resolve({ slug: 'x' }),
      options: { basePath: '/articles', breadcrumbLabel: 'Articles' },
    });

    expect(result).toMatchObject({
      description: 'short text',
      authors: ['only-username'],
      publishedTime: undefined,
      modifiedTime: undefined,
    });
  });

  it('renders review page with tracking, engagement sections, review schema and related cards', async () => {
    (createRouteHandlerClient as jest.Mock).mockResolvedValue({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'viewer-1' } } } }),
      },
    });
    (getUserSettings as jest.Mock).mockResolvedValue({ social_enabled: true });
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [() => ({ data: baseArticle, error: null })],
        likesResolvers: [() => ({ count: 42 })],
        listResolvers: [
          state => {
            expect(state.eq.topic).toBe('reviews');
            expect(state.eq.category).toBe('books');
            return {
              data: [
                {
                  id: 'r1',
                  slug: 'related-1',
                  title: 'Related One',
                  description: 'Desc',
                  cover_image: 'https://cdn.example.com/r1.jpg',
                  category: 'books',
                  topic: 'reviews',
                  published_at: '2025-01-01T00:00:00.000Z',
                  views: 12,
                  likes: 3,
                },
              ],
              error: null,
            };
          },
        ],
      }),
    );

    const ui = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'my-fancy-slug' }),
      basePath: '/review',
      breadcrumbLabel: 'Reviews',
      topicFilter: 'reviews',
    });
    render(ui as ReactNode);

    expect(screen.getByTestId('track-article-view')).toHaveTextContent('article-1');
    expect(screen.getByTestId('meta-actions')).toHaveAttribute('data-read-time', '5 min read');
    expect(screen.getByTestId('meta-actions')).toHaveAttribute('data-metrics', 'true');
    expect(screen.getByTestId('meta-actions')).toHaveAttribute('data-actions', 'true');
    expect(screen.getByTestId('article-auth-hint')).toBeInTheDocument();
    expect(screen.getByTestId('article-comments')).toHaveTextContent('article-1');
    expect(screen.getByTestId('article-content')).toHaveTextContent(
      '<h2 id="intro">Intro</h2><h2 id="intro-1">Intro</h2>',
    );
    expect(screen.getByText('Related reviews')).toBeInTheDocument();
    expect(screen.getByText('See all')).toBeInTheDocument();
    expect(screen.getByTestId('cover-hero')).toHaveTextContent('Deep Dive');
    expect(buildReviewJsonLd).toHaveBeenCalled();
    expect(buildArticleJsonLd).not.toHaveBeenCalled();
  });

  it('falls back to category-only related query and article schema for coding reviews', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [
          () => ({
            data: {
              ...baseArticle,
              topic: 'reviews',
              category: 'coding',
              description: null,
              cover_image: null,
              reading_time_minutes: null,
            },
            error: null,
          }),
        ],
        likesResolvers: [() => ({ count: 'nope' })],
        listResolvers: [
          () => ({ data: [], error: null }),
          state => {
            expect(state.eq.topic).toBeUndefined();
            expect(state.eq.category).toBe('coding');
            return {
              data: [
                {
                  id: 'r2',
                  slug: 'related-2',
                  title: 'Related Two',
                  description: null,
                  cover_image: null,
                  category: 'coding',
                  topic: 'reviews',
                  published_at: null,
                  views: 0,
                  likes: 0,
                },
              ],
              error: null,
            };
          },
        ],
      }),
    );

    const ui = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'x' }),
      basePath: '/articles',
      breadcrumbLabel: 'Articles',
    });
    render(ui as ReactNode);

    expect(screen.queryByTestId('track-article-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('meta-actions')).toHaveAttribute('data-read-time', '');
    expect(screen.getByTestId('meta-actions')).toHaveAttribute('data-metrics', 'false');
    expect(screen.getByTestId('meta-actions')).toHaveAttribute('data-actions', 'false');
    expect(screen.queryByTestId('article-auth-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('article-comments')).not.toBeInTheDocument();
    expect(screen.getByText('Related reviews')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(buildArticleJsonLd).toHaveBeenCalled();
  });

  it('renders empty related state and handles auth/settings failure gracefully', async () => {
    (createRouteHandlerClient as jest.Mock).mockRejectedValue(new Error('stale cookies'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [
          () => ({ data: { ...baseArticle, topic: 'news', score: null }, error: null }),
        ],
        likesResolvers: [() => ({ count: 10 })],
        listResolvers: [
          () => ({ data: null, error: { message: 'oops-1' } }),
          () => ({ data: null, error: { message: 'oops-2' } }),
        ],
      }),
    );

    const ui = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'x' }),
      basePath: '/articles',
      breadcrumbLabel: 'Articles',
    });
    render(ui as ReactNode);

    expect(screen.getByTestId('empty-state')).toHaveTextContent('No related articles yet');
    expect(screen.getByText('News')).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    consoleErrorSpy.mockRestore();
  });

  it('covers heading attribute branches, null related data fallback, and null engagement counters', async () => {
    (createRouteHandlerClient as jest.Mock).mockResolvedValue({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'viewer-2' } } } }),
      },
    });
    (getUserSettings as jest.Mock).mockResolvedValue({ social_enabled: true });
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [
          () => ({
            data: {
              ...baseArticle,
              topic: 'reviews',
              category: '',
              users: null,
              author_id: 'author-2',
              content_html: '<h2 class="lead">!!!</h2>',
            },
            error: null,
          }),
        ],
        likesResolvers: [() => ({ count: 5 })],
        listResolvers: [
          () => ({ data: null, error: null }),
          () => ({
            data: [
              {
                id: 'r-nullish',
                slug: 'related-nullish',
                title: 'Related Nullish',
                description: null,
                cover_image: null,
                category: '',
                topic: 'reviews',
                published_at: null,
                views: null,
                likes: null,
              },
            ],
            error: null,
          }),
        ],
      }),
    );

    const ui = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'x' }),
      basePath: '/review',
      breadcrumbLabel: 'Reviews',
    });
    render(ui as ReactNode);

    expect(screen.getByTestId('article-content')).toHaveTextContent(
      '<h2 class="lead" id="section">!!!</h2>',
    );
    expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('"label":"Deep Dive"');
    expect(screen.queryByText('"href":"/review?category="')).not.toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(buildReviewJsonLd).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: null,
      }),
    );
  });

  it('covers username/null author fallbacks in json-ld builders', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [
          () => ({
            data: {
              ...baseArticle,
              topic: 'reviews',
              category: 'books',
              users: { username: 'review-only-user', display_name: null, avatar_url: null },
            },
            error: null,
          }),
          () => ({
            data: {
              ...baseArticle,
              topic: 'news',
              users: null,
            },
            error: null,
          }),
          () => ({
            data: {
              ...baseArticle,
              topic: 'news',
              users: { username: 'news-only-user', display_name: null, avatar_url: null },
            },
            error: null,
          }),
        ],
        likesResolvers: [() => ({ count: 1 }), () => ({ count: 1 }), () => ({ count: 1 })],
        listResolvers: [
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
        ],
      }),
    );

    const reviewUi = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'review-x' }),
      basePath: '/review',
      breadcrumbLabel: 'Reviews',
    });
    render(reviewUi as ReactNode);

    const newsUi = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'news-x' }),
      basePath: '/articles',
      breadcrumbLabel: 'Articles',
    });
    render(newsUi as ReactNode);

    const newsWithUsernameUi = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'news-user-x' }),
      basePath: '/articles',
      breadcrumbLabel: 'Articles',
    });
    render(newsWithUsernameUi as ReactNode);

    expect(buildReviewJsonLd).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: 'review-only-user',
      }),
    );
    expect(buildArticleJsonLd).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: null,
      }),
    );
    expect(buildArticleJsonLd).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: 'news-only-user',
      }),
    );
  });

  it('calls notFound when article lookup fails', async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [() => ({ data: null, error: { message: 'missing article' } })],
      }),
    );

    await expect(
      ArticleDetailPage({
        params: Promise.resolve({ slug: 'missing' }),
        basePath: '/articles',
        breadcrumbLabel: 'Articles',
      }),
    ).rejects.toThrow('NOT_FOUND');
  });

  it('sanitizes html before rendering content', async () => {
    (sanitizeHtmlContent as jest.Mock).mockReturnValue('   <h2><em> </em></h2><h2>Clean</h2> ');
    (getSupabaseServer as jest.Mock).mockReturnValue(
      createSupabaseMock({
        singleResolvers: [() => ({ data: { ...baseArticle, cover_image: null }, error: null })],
        likesResolvers: [() => ({ count: 1 })],
        listResolvers: [() => ({ data: [], error: null }), () => ({ data: [], error: null })],
      }),
    );

    const ui = await ArticleDetailPage({
      params: Promise.resolve({ slug: 'x' }),
      basePath: '/articles',
      breadcrumbLabel: 'Articles',
    });
    render(ui as ReactNode);

    expect(sanitizeHtmlContent).toHaveBeenCalledWith(baseArticle.content_html);
    expect(screen.getByTestId('article-content')).toHaveTextContent(
      '<h2><em> </em></h2><h2 id="clean">Clean</h2>',
    );
  });
});
