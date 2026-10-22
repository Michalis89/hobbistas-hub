/**
 * Cover images taken down after a copyright notice (see /copyright).
 *
 * Covers are fetched fresh from the providers on every search and copied
 * into media_items when a book is added, so removing a stored cover is not
 * enough: the next search would show it again, and the next add would
 * backfill it into the empty column. Every cover URL that reaches a search
 * result or a media_items payload is checked against this list.
 *
 * To take a cover down:
 * 1. Add its exact URL below with a note (who asked, when) and deploy.
 * 2. Clear it from rows that already store it (Supabase SQL editor):
 *      update public.media_items
 *        set cover_image_large = null, cover_image_medium = null
 *      where cover_image_large = '<url>' or cover_image_medium = '<url>';
 *    The book then shows another provider's cover, or the placeholder.
 * Images already optimised by next/image can stay in Vercel's image cache
 * until it expires, but nothing on the site links to them any more.
 */
export const BLOCKED_COVER_URLS: ReadonlySet<string> = new Set<string>([
  // 'https://assets.hardcover.app/edition/…/….jpeg', // notice from <rights holder>, <YYYY-MM-DD>
]);

export const isBlockedCover = (
  url: unknown,
  blocked: ReadonlySet<string> = BLOCKED_COVER_URLS,
): boolean => typeof url === 'string' && blocked.has(url);

/** A book candidate without any blocked cover. */
export function withoutBlockedCovers<
  T extends { coverLarge: string | null; coverSmall: string | null },
>(book: T, blocked: ReadonlySet<string> = BLOCKED_COVER_URLS): T {
  const large = isBlockedCover(book.coverLarge, blocked) ? null : book.coverLarge;
  const small = isBlockedCover(book.coverSmall, blocked) ? null : book.coverSmall;
  if (large === book.coverLarge && small === book.coverSmall) {
    return book;
  }
  return { ...book, coverLarge: large, coverSmall: small };
}

/** A media_items payload without any blocked cover. */
export function stripBlockedCoverFields<T extends Record<string, unknown>>(
  payload: T,
  blocked: ReadonlySet<string> = BLOCKED_COVER_URLS,
): T {
  const fields = ['cover_image_large', 'cover_image_medium'] as const;
  if (!fields.some(field => isBlockedCover(payload[field], blocked))) {
    return payload;
  }
  const result: Record<string, unknown> = { ...payload };
  for (const field of fields) {
    if (isBlockedCover(result[field], blocked)) {
      result[field] = null;
    }
  }
  return result as T;
}
