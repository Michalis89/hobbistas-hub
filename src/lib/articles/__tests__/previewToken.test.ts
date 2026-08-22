/**
 * @jest-environment node
 */
import {
  createPreviewToken,
  previewTokenArticleId,
  verifyPreviewToken,
} from '@/lib/articles/previewToken';

const ORIGINAL_SECRET = process.env.ARTICLE_PREVIEW_SECRET;

beforeAll(() => {
  process.env.ARTICLE_PREVIEW_SECRET = 'test-secret';
});

afterAll(() => {
  process.env.ARTICLE_PREVIEW_SECRET = ORIGINAL_SECRET;
});

describe('preview tokens', () => {
  it('accepts a token it just issued', () => {
    expect(verifyPreviewToken(createPreviewToken(42), 42)).toBe(true);
  });

  it('rejects a token issued for a different article', () => {
    // Without this the token would be a skeleton key for every draft.
    expect(verifyPreviewToken(createPreviewToken(42), 43)).toBe(false);
  });

  it('rejects a token whose article id was rewritten', () => {
    const token = createPreviewToken(42);
    const [, expiry, signature] = token.split('.');
    expect(verifyPreviewToken(`43.${expiry}.${signature}`, 43)).toBe(false);
  });

  it('rejects a token whose expiry was extended', () => {
    const token = createPreviewToken(42);
    const [id, expiry, signature] = token.split('.');
    const later = String(Number(expiry) + 60_000);
    expect(verifyPreviewToken(`${id}.${later}.${signature}`, 42)).toBe(false);
  });

  it('rejects an expired token', () => {
    expect(verifyPreviewToken(createPreviewToken(42, -1000), 42)).toBe(false);
  });

  it('rejects tampered signatures and malformed input', () => {
    const token = createPreviewToken(42);
    const [id, expiry] = token.split('.');
    expect(verifyPreviewToken(`${id}.${expiry}.deadbeef`, 42)).toBe(false);
    expect(verifyPreviewToken('nonsense', 42)).toBe(false);
    expect(verifyPreviewToken('1.2', 42)).toBe(false);
    expect(verifyPreviewToken('', 42)).toBe(false);
    expect(verifyPreviewToken(undefined, 42)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createPreviewToken(42);
    process.env.ARTICLE_PREVIEW_SECRET = 'rotated-secret';
    try {
      expect(verifyPreviewToken(token, 42)).toBe(false);
    } finally {
      process.env.ARTICLE_PREVIEW_SECRET = 'test-secret';
    }
  });

  it('reads the claimed article id without trusting it', () => {
    expect(previewTokenArticleId(createPreviewToken(7))).toBe(7);
    expect(previewTokenArticleId('abc.1.2')).toBeNull();
    expect(previewTokenArticleId('0.1.2')).toBeNull();
    expect(previewTokenArticleId(null)).toBeNull();
  });
});
