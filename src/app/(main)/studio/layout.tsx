import type { ReactNode } from 'react';
import { buildMetadata } from '@/utils/seo/metadata/helpers';

export const metadata = buildMetadata({
  title: 'Studio',
  description: 'Write, edit and publish articles and reviews.',
  path: '/studio',
  noindex: true,
});

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <main className="pb-10 pt-6 md:pb-16 md:pt-8">{children}</main>;
}
