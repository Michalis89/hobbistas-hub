import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildMetadata } from '@/utils/seo/metadata/helpers';

/**
 * The service worker's navigation fallback, not a page anyone should reach
 * from search. Without its own metadata it inherited the root defaults, which
 * made it indexable *and* had it declare the homepage as its canonical.
 */
export const metadata = buildMetadata({
  title: 'Offline',
  description: 'You are offline. Cached pages may still be available.',
  path: '/offline',
  noindex: true,
});

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-6 text-center shadow-lg backdrop-blur">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted">
          <WifiOff className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Offline
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">No internet connection</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Some pages may still work from cache. Try again when you are back online or return home.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/home">Go to Home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Retry</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
