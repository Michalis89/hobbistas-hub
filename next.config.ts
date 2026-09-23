import { join } from 'node:path';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import withPWAInit from '@ducanh2912/next-pwa';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: !!process.env.ANALYZE,
  openAnalyzer: true,
});

const withPWA = withPWAInit({
  dest: 'public',
  customWorkerSrc: 'src/worker',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: false,
  fallbacks: {
    document: '/offline',
  },
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  workboxOptions: {
    skipWaiting: true,
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
      {
        urlPattern: ({ request }: { request: Request }) =>
          request.headers.has('authorization') || request.headers.has('Authorization'),
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/(auth|admin)\//i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/me(?:\/|$)/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/dashboard\/ai-taste-profile(?:\/|$|\?)/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/recommendations\//i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/(articles|public)\//i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'api-public',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 10 * 60,
          },
          cacheableResponse: {
            statuses: [200],
          },
        },
      },
      {
        urlPattern: /\/_next\/static\//i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /\/_next\/static\/chunks\/.*(tiptap|lowlight|prosemirror|codemirror).*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'editor-bundles',
          expiration: {
            maxEntries: 12,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: ({ url }: { url: URL }) => {
          const publicPaths = [
            '/home',
            '/about',
            '/articles',
            '/review',
            '/media',
            '/terms',
            '/privacy',
          ];
          return (
            url.origin === self.location.origin &&
            publicPaths.some(path => url.pathname.startsWith(path))
          );
        },
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'public-pages',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [200],
          },
        },
      },
      {
        urlPattern: ({ url }: { url: URL }) => {
          const authPaths = ['/dashboard', '/diary', '/backlog', '/profile', '/settings', '/dnd'];
          return (
            url.origin === self.location.origin &&
            authPaths.some(path => url.pathname.startsWith(path))
          );
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'auth-pages',
          networkTimeoutSeconds: 5,
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60,
          },
          cacheableResponse: {
            statuses: [200],
          },
        },
      },
      {
        urlPattern: /jolfksxuhyktpwncniks\.supabase\.co\/rest\//i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-rest',
          networkTimeoutSeconds: 5,
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 5 * 60,
          },
          cacheableResponse: {
            statuses: [200],
          },
        },
      },
      {
        urlPattern: /jolfksxuhyktpwncniks\.supabase\.co\/storage\//i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'supabase-images',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern:
          /^https:\/\/(media\.rawg\.io|images\.igdb\.com|image\.tmdb\.org|s4\.anilist\.co|cdn\.myanimelist\.net|api-cdn\.myanimelist\.net|cdn\.cloudflare\.steamstatic\.com|books\.google\.com)\//i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'external-media-images',
          expiration: {
            maxEntries: 500,
            maxAgeSeconds: 14 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
});

type NextConfigWithInstrumentation = NextConfig & {
  experimental?: NextConfig['experimental'] & {
    instrumentationHook?: boolean;
  };
};

const nextConfig: NextConfigWithInstrumentation = {
  turbopack: {},
  htmlLimitedBots: /Googlebot|Bingbot|DuckDuckBot|Slurp|baiduspider|facebot|ia_archiver/,
  productionBrowserSourceMaps: false,
  experimental: {
    optimizeCss: true,
  },
  outputFileTracingRoot: join(process.cwd()),
  images: {
    minimumCacheTTL: 86400,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.api.playstation.com',
      },
      {
        protocol: 'https',
        hostname: 'psnobj.prod.dl.playstation.net',
      },
      {
        protocol: 'https',
        hostname: 'i.psnprofiles.com',
      },
      {
        protocol: 'https',
        hostname: 'media.rawg.io',
      },
      {
        protocol: 'https',
        hostname: 'images.igdb.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.cloudflare.steamstatic.com',
      },
      {
        protocol: 'https',
        hostname: 's4.anilist.co',
      },
      {
        protocol: 'https',
        hostname: 'myanimelist.net',
      },
      {
        protocol: 'https',
        hostname: '*.myanimelist.net',
      },
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
      },
      {
        protocol: 'https',
        hostname: 'books.google.com',
      },
      {
        protocol: 'https',
        hostname: 'jolfksxuhyktpwncniks.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'www.replacesmoke.com',
      },
      {
        protocol: 'https',
        hostname: 'images.thedirect.com',
      },
      {
        protocol: 'https',
        hostname: 'c.scdn.gr',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/auth/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/api/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/api/me/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/api/dashboard/ai-taste-profile',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/pages/backlog',
        destination: '/backlog',
        permanent: true,
      },
      {
        source: '/pages/news',
        destination: '/articles',
        permanent: true,
      },
      {
        source: '/pages/news/:slug',
        destination: '/articles/:slug',
        permanent: true,
      },
      {
        source: '/news',
        destination: '/articles',
        permanent: true,
      },
      {
        source: '/news/:slug',
        destination: '/articles/:slug',
        permanent: true,
      },
      {
        source: '/pages/reviews',
        destination: '/review',
        permanent: true,
      },
      {
        source: '/pages/reviews/:slug',
        destination: '/review/:slug',
        permanent: true,
      },
      {
        source: '/pages/hobbies',
        destination: '/hobbies',
        permanent: true,
      },
      {
        source: '/reviews',
        destination: '/review',
        permanent: true,
      },
      {
        source: '/reviews/:slug',
        destination: '/review/:slug',
        permanent: true,
      },
      {
        source: '/pages/news/jujutsu-kaisen-anime-manga-1010',
        destination: '/review/jujutsu-kaisen-anime-manga-1010',
        permanent: true,
      },
      {
        source: '/articles/jujutsu-kaisen-anime-manga-1010',
        destination: '/review/jujutsu-kaisen-anime-manga-1010',
        permanent: true,
      },
    ];
  },
};

export default withPWA(withBundleAnalyzer(nextConfig));
