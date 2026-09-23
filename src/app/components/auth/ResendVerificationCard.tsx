'use client';

/**
 * Recovery path for a verification email that never arrived or expired.
 *
 * Without this the confirm screen was a dead end: it pointed people back to
 * registration, which then rejected them because the address already existed.
 */

import { useState, type FormEvent } from 'react';
import { MailPlus } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AuthTextField } from '@/app/components/auth/shared/AuthTextField';
import { validateEmail } from '@/utils/validation/auth';

type Status = { type: 'success' | 'error'; message: string } | null;

export default function ResendVerificationCard() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    const validation = validateEmail(email);
    if (!validation.isValid) {
      setStatus({ type: 'error', message: validation.error || 'Invalid email address.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not send the email. Please try again.');
      }

      setStatus({
        type: 'success',
        message: (data.data ?? data).message || 'Verification link sent. Check your inbox.',
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not send the email. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <AuthTextField
        id="resend-email"
        name="email"
        label="Send a new verification link"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@domain.com"
        disabled={loading}
      />

      {status ? (
        <Alert variant={status.type === 'error' ? 'destructive' : 'success'}>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" variant="outline" className="w-full gap-2" disabled={loading}>
        {loading ? (
          <>
            Sending
            <Spinner className="h-4 w-4" />
          </>
        ) : (
          <>
            <MailPlus className="h-4 w-4" />
            Resend verification email
          </>
        )}
      </Button>
    </form>
  );
}
