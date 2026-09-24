import type { Metadata } from 'next';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
} from '@/config/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },

  description: DEFAULT_DESCRIPTION,

  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [{ url: '/icon-maskable-192x192.png', sizes: '192x192', type: 'image/png' }],
  },

  manifest: '/manifest.webmanifest',

  openGraph: {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: DEFAULT_OG_IMAGE_ALT,
      },
    ],
    type: 'website',
    locale: SITE_LOCALE,
  },

  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
  },

  // Deliberately no `alternates` here.
  //
  // Metadata is inherited down the tree, so a canonical declared at the root
  // is not a default - it is what every page that forgets to set its own ends
  // up claiming. A page announcing the homepage as its canonical is worse
  // than a page announcing none at all, because Google self-canonicalises in
  // the second case and drops the page in the first. `buildMetadata` always
  // sets a canonical, so every real page has one.
};
