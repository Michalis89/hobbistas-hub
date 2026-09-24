import robots from '@/app/robots';
import { SITE_URL } from '@/config/site';

describe('robots', () => {
  it('returns crawl rules and sitemap metadata', () => {
    const result = robots();

    expect(result).toEqual({
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/api/', '/share/'],
        },
      ],
      sitemap: `${SITE_URL}/sitemap.xml`,
    });
  });

  it('leaves noindex-protected areas crawlable so the directive is readable', () => {
    const [rule] = robots().rules as Array<{ disallow: string[] }>;

    // Blocking these would stop a crawler from ever reading the `noindex`
    // each of them sends, which is what actually keeps them out of search.
    for (const path of [
      '/admin',
      '/dashboard',
      '/settings',
      '/profile',
      '/studio',
      '/support',
      '/backlog',
      '/diary',
    ]) {
      expect(rule.disallow.some(entry => path.startsWith(entry.replace(/\/$/, '')))).toBe(false);
    }
  });
});
