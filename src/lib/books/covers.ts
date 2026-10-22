const COVER_CHECK_TIMEOUT_MS = 5000;

/**
 * Cover URLs built from an ISBN without knowing whether a cover exists:
 * the NLG cover service and Open Library's by-ISBN covers (with
 * default=false) both answer 404 when they have none.
 */
export const isUnverifiedCover = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value.startsWith('https://covers.nlg.gr/') ||
    value.startsWith('https://covers.openlibrary.org/b/isbn/'));

/**
 * Whether a cover URL resolves. Checked once when a book is added, so a dead
 * URL is not stored — it would block another provider's cover from filling
 * the gap. Any failure counts as "no cover".
 */
export async function coverExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(COVER_CHECK_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
