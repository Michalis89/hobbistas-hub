import {
  ARTICLE_TITLE,
  ARTICLE_SUBTITLE,
  ARTICLE_PROSE,
  ARTICLE_META,
  ARTICLE_BADGE,
} from '@/components/article/typography';

describe('typography constants', () => {
  it('ARTICLE_TITLE is a non-empty string', () => {
    expect(typeof ARTICLE_TITLE).toBe('string');
    expect(ARTICLE_TITLE.length).toBeGreaterThan(0);
  });

  it('ARTICLE_SUBTITLE is a non-empty string', () => {
    expect(typeof ARTICLE_SUBTITLE).toBe('string');
    expect(ARTICLE_SUBTITLE.length).toBeGreaterThan(0);
  });

  it('ARTICLE_PROSE contains the article-content identifier', () => {
    expect(ARTICLE_PROSE).toContain('article-content');
  });

  it('ARTICLE_META is a non-empty string', () => {
    expect(typeof ARTICLE_META).toBe('string');
    expect(ARTICLE_META.length).toBeGreaterThan(0);
  });

  it('ARTICLE_BADGE is the same value as ARTICLE_META', () => {
    expect(ARTICLE_BADGE).toBe(ARTICLE_META);
  });

  it('ARTICLE_PROSE uses the large and airy reading setting', () => {
    // 17px on phones, 18px from the sm breakpoint
    expect(ARTICLE_PROSE).toContain('text-[1.0625rem]');
    expect(ARTICLE_PROSE).toContain('sm:text-[1.125rem]');
    expect(ARTICLE_PROSE).toContain('sm:leading-[1.9]');
    // Paragraphs are separated, and the last one adds no trailing gap
    expect(ARTICLE_PROSE).toContain('[&_p]:mb-[1.15em]');
    expect(ARTICLE_PROSE).toContain('[&_p:last-child]:mb-0');
    expect(ARTICLE_PROSE).toContain('max-w-[70ch]');
  });
});
