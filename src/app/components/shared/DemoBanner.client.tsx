'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { useIsDemoUser } from '@/lib/demo/useIsDemoUser';

/**
 * Tells the visitor what they are looking at.
 *
 * Deliberately not dismissible: a demo session is short and shared, and the
 * one thing it must never do is let someone believe their changes were saved.
 */
export default function DemoBanner() {
  const isDemo = useIsDemoUser();

  if (!isDemo) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-[hsl(var(--accent-primary)/0.35)] bg-[hsl(var(--accent-muted)/0.5)]"
    >
      <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs sm:text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[hsl(var(--text-primary))]">
          <Eye className="h-3.5 w-3.5" />
          Demo mode
        </span>
        <span className="text-[hsl(var(--text-secondary))]">
          Browse everything freely - nothing you change here is saved.
        </span>
        <Link
          href="/auth/register"
          className="font-semibold text-[hsl(var(--accent-primary))] underline underline-offset-4 hover:opacity-80"
        >
          Create your own account
        </Link>
      </div>
    </div>
  );
}
