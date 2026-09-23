import { render, screen } from '@testing-library/react';
import NewsPage, { generateMetadata, revalidate } from '@/app/(main)/articles/page';
import { SITE_URL } from '@/config/site';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { CATEGORY_SUBTITLES } from '@/app/(main)/articles/constants';

const createRouteHandlerClientMock = jest.fn();
const getArticlesWithFiltersMock = jest.fn();
const newsPageClientMock = jest.fn();

jest.mock('@/app/(main)/articles/NewsPageClient', () => ({
  __esModule: true,
  default: (props: unknown) => {
    newsPageClientMock(props);
    return <div data-testid="news-page-client" />;
  },
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  __esModule: true,
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));

jest.mock('@/lib/supabase/queries', () => ({
  __esModule: true,
  getArticlesWithFilters: (...args: unknown[]) => getArticlesWithFiltersMock(...args),
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

describe('articles page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createRouteHandlerClientMock.mockResolvedValue({ from: jest.fn() });
    getArticlesWithFiltersMock.mockResolvedValue({ data: [], count: 0, error: null });
  });

  it('exports expected revalidation interval', () => {
    expect(revalidate).toBe(300);
  });

  it('builds metadata for valid category and topic', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'games', topic: 'tutorials' }),
    });

    expect(metadata).toMatchObject({
      title: 'Tutorials for Games',
      description: 'Articles, stories, and deep dives from the world of gaming.',
    });
    expect(String(metadata.alternates?.canonical)).toContain('/articles');
  });

  it('falls back metadata for invalid filters and default topic', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'invalid', topic: 'articles' }),
    });

    expect(metadata).toMatchObject({
      title: 'Articles',
      description:
        'Discover thoughtful articles, practical guides, and community stories across every hobby.',
    });
    expect(String(metadata.alternates?.canonical)).toContain('/articles');
    expect(String(metadata.alternates?.canonical)).not.toContain('category=');
  });

  it('uses default description when category subtitle is missing', async () => {
    const original = CATEGORY_SUBTITLES.games;
    (CATEGORY_SUBTITLES as Record<string, string | undefined>).games = undefined;

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'games' }),
    });

    expect(metadata).toMatchObject({
      title: 'Articles for Games',
      description:
        'Discover thoughtful articles, practical guides, and community stories across every hobby.',
    });

    (CATEGORY_SUBTITLES as Record<string, string | undefined>).games = original;
  });

  it('renders breadcrumb structured data and client page', async () => {
    getArticlesWithFiltersMock.mockResolvedValueOnce({
      data: [
        { id: 1, slug: 'article-one', topic: 'articles' },
        { id: 2, slug: 'review-one', topic: 'reviews' },
      ],
      count: 2,
      error: null,
    });

    render(
      await NewsPage({
        searchParams: Promise.resolve({ category: 'games', topic: 'tutorials', tag: 'guide' }),
      }),
    );

    expect(screen.getByTestId('news-page-client')).toBeInTheDocument();
    expect(createRouteHandlerClientMock).toHaveBeenCalledWith(undefined, { ignoreCookies: true });
    expect(getArticlesWithFiltersMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        category: 'games',
        topic: 'tutorials',
        status: 'published',
        tag: 'guide',
        limit: 20,
        offset: 0,
      }),
    );
    expect(newsPageClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialArticles: [{ id: 1, slug: 'article-one', topic: 'articles' }],
        initialTotal: 2,
        initialCategory: 'games',
        initialTag: 'guide',
      }),
    );
    expect(screen.getByTestId('structured-data')).toBeInTheDocument();
    expect(getBreadcrumbStructuredData).toHaveBeenCalledWith([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Articles', url: `${SITE_URL}/articles` },
      { name: 'Tutorials - Games', url: `${SITE_URL}/articles?category=games` },
    ]);
  });

  it('counts filtered normal articles for default topic so reviews are not included', async () => {
    getArticlesWithFiltersMock.mockResolvedValueOnce({
      data: [
        { id: 1, slug: 'article-one', topic: 'articles' },
        { id: 2, slug: 'review-one', topic: 'reviews' },
      ],
      count: 2,
      error: null,
    });

    render(await NewsPage({ searchParams: Promise.resolve({}) }));

    expect(newsPageClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialArticles: [{ id: 1, slug: 'article-one', topic: 'articles' }],
        initialTotal: 1,
      }),
    );
  });

  it('uses category-only breadcrumb label when topic is default "articles"', async () => {
    render(
      await NewsPage({
        searchParams: Promise.resolve({ category: 'games', topic: 'articles' }),
      }),
    );

    expect(getBreadcrumbStructuredData).toHaveBeenCalledWith([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Articles', url: `${SITE_URL}/articles` },
      { name: 'Games', url: `${SITE_URL}/articles?category=games` },
    ]);
  });

  it('renders base breadcrumb when category is invalid', async () => {
    render(
      await NewsPage({
        searchParams: Promise.resolve({ category: 'invalid' }),
      }),
    );

    expect(getBreadcrumbStructuredData).toHaveBeenCalledWith([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Articles', url: `${SITE_URL}/articles` },
    ]);
  });
});
