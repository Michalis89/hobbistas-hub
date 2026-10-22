/**
 * Owner -> single user email: the rules shared by the composer (preview,
 * client-side validation) and the API route (authoritative validation).
 *
 * Messages are authored as plain text. The only dynamic value is the
 * `{{displayName}}` placeholder; HTML is produced server-side from the
 * escaped text, never from anything the author typed as markup.
 */

export const ADMIN_EMAIL_SUBJECT_MAX = 150;
export const ADMIN_EMAIL_MESSAGE_MAX = 5000;

/** Emails one recipient may receive from admins in a rolling 24 hours. */
export const ADMIN_EMAIL_PER_RECIPIENT_DAILY = 3;
/** Emails one sender may send in a rolling 24 hours (independent of Upstash). */
export const ADMIN_EMAIL_PER_SENDER_DAILY = 50;

export const DISPLAY_NAME_PLACEHOLDER = '{{displayName}}';

const PLACEHOLDER_PATTERN = /\{\{\s*displayName\s*\}\}/g;
// Control characters other than tab/newline/carriage return.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ALL_CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminEmailRecipient = {
  display_name: string | null;
  username: string;
};

export type AdminEmailInput = {
  subject: string;
  message: string;
  idempotencyKey: string;
};

/** Display name, falling back to the username. Control characters removed. */
export function resolveRecipientName(recipient: AdminEmailRecipient): string {
  const displayName = (recipient.display_name ?? '').replace(ALL_CONTROL_CHARS, '').trim();
  if (displayName) {
    return displayName;
  }
  return recipient.username.replace(ALL_CONTROL_CHARS, '').trim();
}

/**
 * Substitutes `{{displayName}}`. Returns plain text: callers rendering HTML
 * must escape the result (the email template does).
 */
export function personalizeAdminMessage(text: string, recipientName: string): string {
  return text.replace(PLACEHOLDER_PATTERN, () => recipientName);
}

/**
 * Validates the composer payload. Unknown fields (such as a recipient
 * address) are ignored: the recipient is always resolved server-side.
 */
export function validateAdminEmailInput(
  body: unknown,
): { ok: true; value: AdminEmailInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const { subject, message, idempotencyKey } = body as Record<string, unknown>;

  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return { ok: false, error: 'Subject is required.' };
  }
  const trimmedSubject = subject.trim();
  // A subject is a single header line: any line break or control character
  // could be used to inject extra headers.
  if (/[\r\n]/.test(trimmedSubject) || CONTROL_CHARS.test(trimmedSubject)) {
    return { ok: false, error: 'Subject must be a single line of plain text.' };
  }
  if (trimmedSubject.length > ADMIN_EMAIL_SUBJECT_MAX) {
    return {
      ok: false,
      error: `Subject must be at most ${ADMIN_EMAIL_SUBJECT_MAX} characters.`,
    };
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return { ok: false, error: 'Message is required.' };
  }
  const trimmedMessage = message.trim();
  if (CONTROL_CHARS.test(trimmedMessage)) {
    return { ok: false, error: 'Message contains unsupported characters.' };
  }
  if (trimmedMessage.length > ADMIN_EMAIL_MESSAGE_MAX) {
    return {
      ok: false,
      error: `Message must be at most ${ADMIN_EMAIL_MESSAGE_MAX} characters.`,
    };
  }

  if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
    return { ok: false, error: 'Invalid submission key.' };
  }

  return {
    ok: true,
    value: {
      subject: trimmedSubject,
      message: trimmedMessage,
      idempotencyKey: idempotencyKey.toLowerCase(),
    },
  };
}

/**
 * Provider errors can echo the recipient address back; keep only a short,
 * address-free message for the audit row.
 */
export function sanitizeProviderError(message: unknown): string {
  const text = typeof message === 'string' ? message : 'Unknown provider error';
  return text
    .replace(/[^\s@<>"']+@[^\s@<>"']+/g, '[redacted]')
    .replace(ALL_CONTROL_CHARS, ' ')
    .slice(0, 300);
}
