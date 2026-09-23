'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { fetchSession } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store/store';
import { isDemoEnabled } from '@/lib/demo';

/**
 * One-click entry into the shared read-only account.
 *
 * The credentials are server-only, so this posts to `/api/auth/demo-login`
 * rather than filling the form in. Renders nothing when the demo is not
 * configured, which keeps the login screen honest in environments without one.
 */
export default function DemoLoginButton() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isDemoEnabled()) {
    return null;
  }

  const enterDemo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/demo-login', { method: 'POST' });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.error || 'Could not start the demo.');
      }

      // The session cookie is set; pull the hydrated user into Redux before
      // navigating so the shell does not render a signed-out frame first.
      await dispatch(fetchSession()).unwrap();
      router.push(body?.data?.redirectTo ?? '/dashboard');
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : 'Could not start the demo.');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Separator className="flex-1 bg-border" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">or</span>
        <Separator className="flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={isLoading}
        onClick={() => void enterDemo()}
      >
        {isLoading ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {isLoading ? 'Opening demo...' : 'Explore the demo'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        A ready-made account with a full library. Read-only - nothing you do is saved.
      </p>

      {error ? (
        <p className="text-center text-xs text-[hsl(var(--error))]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
