import { notFound } from 'next/navigation';
import type { MediaCategory } from '@/app/components/backlog/types';
import StructuredData from '@/utils/seo/StructuredData';
import { getBreadcrumbStructuredData } from '@/utils/seo/metadata/structuredData';
import { SITE_URL } from '@/config/site';
import { buildMediaJsonLd } from '@/lib/seo/jsonld';
import MediaDetailPageClient from './MediaDetailPageClient';
import MediaArticlesSection from '@/app/components/media-detail/MediaArticlesSection';
import { isMediaCategory } from '@/app/components/backlog/types';
import {
  fetchMediaItem,
  MEDIA_CATEGORY_LABELS,
  resolveCanonicalSlug,
  resolveMediaCover,
  resolveMediaDescription,
  resolveMediaPublishedAt,
  resolveMediaTitle,
} from '@/app/components/media-detail/mediaDetailPage.helpers';

export type MediaDetailPageProps = {
  params: Promise<{ category: string; slug: string }>;
};

export async function MediaDetailContent({ params }: MediaDetailPageProps) {
  const { category, slug } = await params;
  const normalizedCategory = category.toLowerCase();

  if (!isMediaCategory(normalizedCategory)) {
    notFound();
  }

  const item = await fetchMediaItem(normalizedCategory, slug);
  if (!item) {
    notFound();
  }

  const title = resolveMediaTitle(item);
  if (!title) {
    notFound();
  }

  if (!item.id || typeof item.id !== 'number' || !Number.isFinite(item.id)) {
    console.error('Media item missing valid ID:', { category: normalizedCategory, slug, item });
    notFound();
  }

  const description = resolveMediaDescription(item);
  const coverImage = resolveMediaCover(item);
  const publishedAt = resolveMediaPublishedAt(item);
  const modifiedAt = item.updated_at ?? publishedAt;
  const canonicalSlug = resolveCanonicalSlug(item, slug);
  const pageUrl = `${SITE_URL}/media/${normalizedCategory}/${canonicalSlug}`;
  const breadcrumb = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: MEDIA_CATEGORY_LABELS[normalizedCategory as MediaCategory], url: pageUrl },
    { name: title, url: pageUrl },
  ];

  return (
    <>
      <StructuredData
        data={buildMediaJsonLd({
          title,
          description,
          url: pageUrl,
          image: coverImage ?? null,
          publishedAt,
          updatedAt: modifiedAt,
          category: normalizedCategory as MediaCategory,
        })}
      />
      <StructuredData data={getBreadcrumbStructuredData(breadcrumb)} />
      <MediaDetailPageClient category={normalizedCategory as MediaCategory} mediaItem={item} />
      <MediaArticlesSection mediaId={item.id} title={title} />
    </>
  );
}
