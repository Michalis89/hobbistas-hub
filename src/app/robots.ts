import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site';

/**
 * Crawl rules.
 *
 * Deliberately short. Keeping a private page out of search is the job of a
 * `noindex` on the page, not of a Disallow here: a crawler that is blocked
 * from fetching a URL never reads its `noindex`, so a blocked page can still
 * be listed from inbound links, only without a description. Every private
 * area of this app already sends `noindex` - the admin, profile and studio
 * layouts, and the dashboard, settings, support, explore, onboarding, dnd,
 * backlog and diary pages - so they are left crawlable on purpose, so that
 * the directive is actually seen and obeyed.
 *
 * What remains here is the set of paths that should never be fetched at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // JSON endpoints: nothing to index, and crawling them is pure cost.
          '/api/',
          // Share links are unguessable-by-design URLs onto somebody's
          // library. The pages send `noindex` too, but a share token should
          // not be fetched, logged or followed in the first place.
          '/share/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
