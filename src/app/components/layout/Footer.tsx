import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageContainer } from './PageContainer';
import VersionBadge from '@/utils/components/VersionBadge';

const LEGAL_LINKS = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Copyright', href: '/copyright' },
];

const NAV_LINKS = [
  { label: 'Home', href: '/home' },
  { label: 'About', href: '/about' },
  { label: 'Hobbies', href: '/hobbies' },
  { label: 'Articles', href: '/articles' },
  { label: 'Reviews', href: '/review' },
];

const CONTACT = [
  { label: 'GitHub', href: 'https://github.com/Michalis89/hobbistas-hub' },
  { label: 'Email', href: 'mailto:support@hobbistas-hub.com' },
];

function FooterTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm">
      {children}
    </Link>
  );
}

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative mt-auto" data-app-footer="true">
      <PageContainer size="full" noPadding className="relative">
        <div className="relative rounded-lg bg-[radial-gradient(circle_at_0%_0%,hsl(var(--primary)/0.12),transparent_46%)] px-6 py-8 md:px-8 md:py-10">
          <div className="relative grid gap-8 md:grid-cols-[1.55fr_1fr_1fr]">
            <section className="space-y-4">
              <Link href="/" className="inline-flex w-fit items-center gap-3 rounded-2xl px-1 py-1">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-[hsl(var(--accent-primary))/0.35] bg-[hsl(var(--accent-muted))]">
                  <span className="text-lg font-black leading-none text-primary">H</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[1.125rem] font-semibold text-foreground">Hobbistas</span>
                  <span className="text-xs font-medium">
                    <VersionBadge />
                  </span>
                </div>
              </Link>

              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Your space for gaming, anime, manga, movies, TV series, and books. Everything
                organized without the noise.
              </p>

              <div className="flex flex-wrap gap-2">
                {CONTACT.map(contact => (
                  <Link
                    key={contact.label}
                    href={contact.href}
                    className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium"
                  >
                    {contact.label}
                  </Link>
                ))}
              </div>
            </section>

            <section className="hidden md:block">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                Navigation
              </h2>

              <ul className="space-y-3">
                {NAV_LINKS.map(link => (
                  <li key={link.href}>
                    <FooterTextLink href={link.href}>{link.label}</FooterTextLink>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                Legal
              </h2>

              <ul className="space-y-3">
                {LEGAL_LINKS.map(link => (
                  <li key={link.href}>
                    <FooterTextLink href={link.href}>{link.label}</FooterTextLink>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="mt-8 border-t pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                &copy; {currentYear} Hobbistas. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    </footer>
  );
}
