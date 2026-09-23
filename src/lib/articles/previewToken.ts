import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Secret used to sign preview links.
 *
 * `ARTICLE_PREVIEW_SECRET` is preferred; the service role key is a fallback so
 * previews work without extra configuration. Either way the value never leaves
 * the server, and rotating it simply invalidates outstanding links.
 */
function previewSecret(): string {
  const secret = process.env.ARTICLE_PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('Missing ARTICLE_PREVIEW_SECRET (or SUPABASE_SERVICE_ROLE_KEY) for previews');
  }
  return secret;
}

const sign = (payload: string): string =>
  createHmac('sha256', previewSecret()).update(payload).digest('base64url');

/**
 * Creates a shareable link that reveals an unpublished article.
 *
 * The token carries the article id and an expiry, both covered by the
 * signature, so it cannot be pointed at a different article or extended.
 */
export function createPreviewToken(articleId: number, ttlMs: number = DEFAULT_TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${articleId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** True when the token is a valid, unexpired preview link for this article. */
export function verifyPreviewToken(token: string | undefined | null, articleId: number): boolean {
  if (!token) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const [rawId, rawExpiry, signature] = parts;
  if (Number(rawId) !== articleId) {
    return false;
  }

  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const expected = sign(`${rawId}.${rawExpiry}`);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  // Compare in constant time, but only when the lengths already match:
  // timingSafeEqual throws on a length mismatch.
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Reads the article id a token claims, without trusting it.
 *
 * Used to look the article up before verification, since verification needs to
 * know which article the token should be valid for.
 */
export function previewTokenArticleId(token: string | undefined | null): number | null {
  if (!token) {
    return null;
  }
  const id = Number(token.split('.')[0]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
