import { normalizeSlug } from '@/utils/slugify';

type ActivityPayload = Record<string, unknown>;

type ActivityItem = {
  type: string;
  payload?: ActivityPayload;
};

const readValue = (payload: ActivityPayload, key: string) => {
  if (payload[key] === undefined || payload[key] === null) {
    return undefined;
  }
  return payload[key] as string | number;
};

export function getActivityHref(activity: ActivityItem): string | null {
  const payload = activity.payload || {};
  const category = readValue(payload, 'category');
  if (!category || typeof category !== 'string') {
    return null;
  }

  const slugValue =
    readValue(payload, 'slug') ||
    readValue(payload, 'mediaSlug') ||
    readValue(payload, 'gameSlug') ||
    readValue(payload, 'externalId') ||
    readValue(payload, 'mediaId') ||
    readValue(payload, 'tmdb_id') ||
    readValue(payload, 'mal_id') ||
    readValue(payload, 'rawg_id') ||
    readValue(payload, 'google_books_id') ||
    readValue(payload, 'open_library_id');

  if (!slugValue) {
    return null;
  }

  const slug = normalizeSlug(String(slugValue));
  return `/media/${category}/${slug}`;
}
