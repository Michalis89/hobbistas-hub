'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ErrorAlert } from '@/components/ui/alert';
import {
  ADMIN_EMAIL_MESSAGE_MAX,
  ADMIN_EMAIL_SUBJECT_MAX,
  DISPLAY_NAME_PLACEHOLDER,
  personalizeAdminMessage,
  resolveRecipientName,
  validateAdminEmailInput,
} from '@/lib/email/adminMessage';

export type EmailRecipient = {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
};

type Step = 'compose' | 'review';

type AdminUserEmailComposerProps = {
  recipient: EmailRecipient | null;
  onClose: () => void;
  onSent: (message: string) => void;
};

/**
 * Owner-only composer for one user. Plain text with an optional
 * `{{displayName}}` placeholder; the review step shows the personalized
 * result and is the confirmation before anything is sent.
 *
 * One idempotency key per compose session: a double click or a retry after a
 * lost response is rejected by the server instead of sending twice. The key
 * is renewed only when the server says nothing was sent.
 */
export default function AdminUserEmailComposer({
  recipient,
  onClose,
  onSent,
}: AdminUserEmailComposerProps) {
  const open = recipient !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        {recipient ? (
          // Keyed so every new recipient starts from a clean form and key.
          <ComposerBody
            key={recipient.id}
            recipient={recipient}
            onClose={onClose}
            onSent={onSent}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ComposerBody({
  recipient,
  onClose,
  onSent,
}: {
  recipient: EmailRecipient;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>('compose');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipientName = resolveRecipientName(recipient);

  const review = () => {
    const result = validateAdminEmailInput({ subject, message, idempotencyKey });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setStep('review');
  };

  const send = useCallback(async () => {
    if (sending) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/users/${recipient.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, idempotencyKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // Rejected before or by the provider: nothing went out, so a new
        // attempt gets a new key. A duplicate keeps it - the first one stands.
        if (payload?.code !== 'DUPLICATE_SUBMISSION') {
          setIdempotencyKey(crypto.randomUUID());
        }
        throw new Error(payload?.error || 'Failed to send email');
      }
      onSent(
        payload?.data?.status === 'simulated'
          ? `Email to "${recipient.username}" logged (development mode, not sent).`
          : `Email to "${recipient.username}" accepted for delivery.`,
      );
    } catch (err) {
      // A network error leaves the outcome unknown: the key is kept, so
      // trying again cannot produce a second email.
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  }, [idempotencyKey, message, onSent, recipient, sending, subject]);

  return (
    <div className="flex max-h-[90dvh] flex-col">
      <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
          <Mail className="h-5 w-5" aria-hidden />
          {step === 'compose' ? 'Send email' : 'Review and send'}
        </DialogTitle>
      </DialogHeader>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div
          className="rounded-xl border border-border bg-muted/20 p-3 text-sm"
          data-testid="email-recipient"
        >
          <p className="text-muted-foreground">To</p>
          <p className="font-medium text-foreground">
            {recipientName}{' '}
            <span className="font-normal text-muted-foreground">(@{recipient.username})</span>
          </p>
          <p className="break-all text-muted-foreground">{recipient.email}</p>
        </div>

        {step === 'compose' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email-subject">Subject</Label>
              <Input
                id="admin-email-subject"
                value={subject}
                maxLength={ADMIN_EMAIL_SUBJECT_MAX}
                onChange={event => setSubject(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email-message">Message</Label>
              <Textarea
                id="admin-email-message"
                value={message}
                rows={10}
                maxLength={ADMIN_EMAIL_MESSAGE_MAX}
                onChange={event => setMessage(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Plain text. Use <code className="font-mono">{DISPLAY_NAME_PLACEHOLDER}</code> for
                the recipient&apos;s name. {message.length}/{ADMIN_EMAIL_MESSAGE_MAX}
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-3" data-testid="email-preview">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 font-semibold text-foreground">
                {personalizeAdminMessage(subject.trim(), recipientName)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {personalizeAdminMessage(message.trim(), recipientName)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Sent from no-reply@mail.hobbistas-hub.com; replies go to the support address. This
              email will be recorded in the admin audit log.
            </p>
          </div>
        )}

        {error ? <ErrorAlert message={error} /> : null}
      </div>

      <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:px-6">
        {step === 'compose' ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={review}>
              Review
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep('compose')}
              disabled={sending}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Edit
            </Button>
            <Button type="button" onClick={() => void send()} disabled={sending}>
              <Send className="h-4 w-4" aria-hidden />
              {sending ? 'Sending...' : 'Send email'}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
