import { render, screen } from '@testing-library/react';
import MediaDetailPage, { generateMetadata } from '@/app/(main)/media/[category]/[slug]/page';
import { MediaDetailContent } from '@/app/(main)/media/[category]/[slug]/mediaDetailContent';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/utils/seo/metadata/helpers';
import { buildMediaJsonLd } from '@/lib/seo/jsonld';
import {
  fetchMediaItem,
  resolveCanonicalSlug,
  resolveMediaCover,
  resolveMediaDescription,
  resolveMediaPublishedAt,
  resolveMediaTitle,
} from '@/app/components/media-detail/mediaDetailPage.helpers';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));

jest.mock('@/utils/seo/metadata/helpers', () => ({
  buildMetadata: jest.fn(),
}));

jest.mock('@/lib/seo/jsonld', () => ({
  buildMediaJsonLd: jest.fn(() => ({ '@type': 'Thing' })),
}));

jest.mock('@/utils/seo/metadata/structuredData', () => ({
  getBreadcrumbStructuredData: jest.fn(() => ({ '@type': 'BreadcrumbList' })),
}));

jest.mock('@/app/components/media-detail/mediaDetailPage.helpers', () => ({
  __esModule: true,
  MEDIA_CATEGORY_LABELS: {
    anime: 'Anime',
    manga: 'Manga',
    books: 'Books',
    movies: 'Movies',
    tv: 'TV',
    games: 'Games',
  },
  fetchMediaItem: jest.fn(),
  resolveCanonicalSlug: jest.fn(() => 'canon-slug'),
  resolveMediaCover: jest.fn(() => '/cover.jpg'),
  resolveMediaDescription: jest.fn(() => 'desc'),
  resolveMediaPublishedAt: jest.fn(() => '2024-01-01'),
  resolveMediaTitle: jest.fn(() => 'Mock Title'),
  buildSlugCandidates: jest.fn(),
  collectCandidateSlugs: jest.fn(),
  escapeLike: jest.fn(),
  fetchPublishedMediaItemCached: jest.fn(),
  foldPossessiveSlug: jest.fn(),
  isNumeric: jest.fn(),
  scoreSlugMatch: jest.fn(),
  toCanonicalSlug: jest.fn(),
  toLooseTitleLikePattern: jest.fn(),
}));

jest.mock('@/utils/seo/StructuredData', () => ({
  __esModule: true,
  default: ({ data }: { data: unknown }) => (
    <div data-testid="structured">{JSON.stringify(data)}</div>
  ),
}));

jest.mock('@/app/(main)/media/[category]/[slug]/MediaDetailPageClient', () => ({
  __esModule: true,
  default: ({ category }: { category: string }) => <div data-testid="media-client">{category}</div>,
}));

// An async server component: it cannot be rendered by this synchronous test,
// and its own behaviour is covered separately.
jest.mock('@/app/components/media-detail/MediaArticlesSection', () => ({
  __esModule: true,
  default: ({ mediaId }: { mediaId: number }) => (
    <div data-testid="media-articles">{mediaId}</div>
  ),
}));

describe('media detail page route', () => {
  const mockItem = {
    id: 42,
    title: 'Title',
    updated_at: '2025-01-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (notFound as jest.Mock).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    (buildMetadata as jest.Mock).mockReturnValue({ title: 'ok' });
    (fetchMediaItem as jest.Mock).mockResolvedValue(mockItem);
    (resolveMediaTitle as jest.Mock).mockReturnValue('Title');
    (resolveMediaDescription as jest.Mock).mockReturnValue('Description');
    (resolveMediaCover as jest.Mock).mockReturnValue('/cover.jpg');
    (resolveCanonicalSlug as jest.Mock).mockReturnValue('title');
    (resolveMediaPublishedAt as jest.Mock).mockReturnValue('2024-01-01');
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generateMetadata calls notFound for invalid category', async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ category: 'invalid', slug: 'x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('generateMetadata calls notFound when item or title is missing', async () => {
    (fetchMediaItem as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      generateMetadata({ params: Promise.resolve({ category: 'games', slug: 'x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    (fetchMediaItem as jest.Mock).mockResolvedValueOnce(mockItem);
    (resolveMediaTitle as jest.Mock).mockReturnValueOnce('');
    await expect(
      generateMetadata({ params: Promise.resolve({ category: 'games', slug: 'x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('generateMetadata returns built metadata for valid item', async () => {
    const result = await generateMetadata({
      params: Promise.resolve({ category: 'games', slug: 'my-slug' }),
    });

    expect(buildMetadata).toHaveBeenCalled();
    expect(result).toEqual({ title: 'ok' });
  });

  it('generateMetadata passes undefined images when cover is missing', async () => {
    (resolveMediaCover as jest.Mock).mockReturnValueOnce(undefined);

    await generateMetadata({
      params: Promise.resolve({ category: 'games', slug: 'my-slug' }),
    });

    expect(buildMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        images: undefined,
      }),
    );
  });

  it('MediaDetailContent calls notFound for invalid category, missing item, missing title, and invalid id', async () => {
    await expect(
      MediaDetailContent({ params: Promise.resolve({ category: 'invalid', slug: 'x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    (fetchMediaItem as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      MediaDetailContent({ params: Promise.resolve({ category: 'games', slug: 'x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    (fetchMediaItem as jest.Mock).mockResolvedValueOnce(mockItem);
    (resolveMediaTitle as jest.Mock).mockReturnValueOnce('');
    await expect(
      MediaDetailContent({ params: Promise.resolve({ category: 'games', slug: 'x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    (fetchMediaItem as jest.Mock).mockResolvedValueOnce({ ...mockItem, id: NaN });
    await expect(
      MediaDetailContent({ params: Promise.resolve({ category: 'games', slug: 'x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('MediaDetailContent renders structured data and client', async () => {
    const ui = await MediaDetailContent({
      params: Promise.resolve({ category: 'games', slug: 'x' }),
    });
    render(ui);

    expect(screen.getByTestId('media-client')).toHaveTextContent('games');
    expect(screen.getAllByTestId('structured')).toHaveLength(2);
    expect(screen.getByTestId('media-articles')).toHaveTextContent('42');
  });

  it('MediaDetailContent uses publishedAt fallback for updatedAt and null image fallback', async () => {
    (fetchMediaItem as jest.Mock).mockResolvedValueOnce({
      id: 99,
      title: 'Fallback item',
      updated_at: undefined,
    });
    (resolveMediaCover as jest.Mock).mockReturnValueOnce(undefined);
    (resolveMediaPublishedAt as jest.Mock).mockReturnValueOnce(null);

    const ui = await MediaDetailContent({
      params: Promise.resolve({ category: 'games', slug: 'x' }),
    });
    render(ui);

    expect(buildMediaJsonLd).toHaveBeenCalledWith(
      expect.objectContaining({
        image: null,
        publishedAt: null,
        updatedAt: null,
      }),
    );
  });

  it('default page renders suspense wrapper', () => {
    render(<MediaDetailPage params={Promise.resolve({ category: 'games', slug: 'x' })} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
