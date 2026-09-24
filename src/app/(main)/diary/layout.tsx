import type { ReactNode } from 'react';
import { buildMetadata } from '@/utils/seo/metadata/helpers';

/**
 * Lives in a layout because `diary/page.tsx` is a client component and so
 * cannot export metadata itself. Without this the diary inherited the root
 * metadata and was advertised as an indexable page - which, for an
 * end-to-end encrypted journal, is the last thing it should be.
 */
export const metadata = buildMetadata({
  title: 'Diary',
  description: 'Your private, end-to-end encrypted journal.',
  path: '/diary',
  noindex: true,
});

export default function DiaryLayout({ children }: { children: ReactNode }) {
  return children;
}
