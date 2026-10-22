import { SITE_CONTACT_EMAIL } from '@/config/site';
import { sanitizeProviderError } from './adminMessage';
import { getResendClient } from './resend';
import { renderAdminMessageEmail, renderConfirmEmail, renderResetPasswordEmail } from './templates';

const FROM_ADDRESS = 'Hobbistas <no-reply@mail.hobbistas-hub.com>';
const isDevelopment = process.env.NODE_ENV === 'development';
const ENABLE_DEV_EMAIL_LOGGING = process.env.ENABLE_DEV_EMAIL_LOGGING === 'true';

/**
 * Send email in development or production
 * In development: logs to console if ENABLE_DEV_EMAIL_LOGGING is true
 * In production: sends actual email via Resend
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  type: 'confirm' | 'reset';
}) {
  const { to, subject, html, type } = params;

  // In development, log email instead of sending (unless API key is provided)
  if (isDevelopment && (ENABLE_DEV_EMAIL_LOGGING || !process.env.RESEND_API_KEY)) {
    console.warn('\n📧 [DEV EMAIL] Would send email:');
    console.warn('  To:', to);
    console.warn('  Subject:', subject);
    console.warn('  Type:', type);
    console.warn('  Full HTML:');
    console.warn(html);
    console.warn('');
    return; // Don't actually send in dev mode
  }

  // Production or dev with API key: send actual email
  await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to: [to],
    subject,
    html,
  });
}

export async function sendConfirmEmail(toEmail: string, actionLink: string) {
  await sendEmail({
    to: toEmail,
    subject: 'Hobbistas Account Verification',
    html: renderConfirmEmail(actionLink),
    type: 'confirm',
  });
}

export async function sendResetPasswordEmail(toEmail: string, actionLink: string) {
  await sendEmail({
    to: toEmail,
    subject: 'Hobbistas Password Reset',
    html: renderResetPasswordEmail(actionLink),
    type: 'reset',
  });
}

export type AdminMessageSendResult =
  | { status: 'accepted'; providerMessageId: string }
  | { status: 'simulated' }
  | { status: 'failed'; errorCode: string; errorMessage: string };

/**
 * Sends an owner-authored message to one user. Unlike the auth emails this
 * reports the outcome instead of throwing or swallowing it, so the caller can
 * record it in the audit log. `idempotencyKey` is passed to Resend so a
 * retried request cannot produce a second email.
 *
 * 'accepted' means Resend took the message, not that it was delivered.
 */
export async function sendAdminMessageEmail(params: {
  to: string;
  subject: string;
  message: string;
  idempotencyKey: string;
}): Promise<AdminMessageSendResult> {
  const { to, subject, message, idempotencyKey } = params;

  if (isDevelopment && (ENABLE_DEV_EMAIL_LOGGING || !process.env.RESEND_API_KEY)) {
    console.warn('\n📧 [DEV EMAIL] Would send admin message:');
    console.warn('  To:', to);
    console.warn('  Subject:', subject);
    console.warn('');
    return { status: 'simulated' };
  }

  try {
    const { data, error } = await getResendClient().emails.send(
      {
        from: FROM_ADDRESS,
        to: [to],
        replyTo: SITE_CONTACT_EMAIL,
        subject,
        text: message,
        html: renderAdminMessageEmail({ subject, message }),
      },
      { idempotencyKey },
    );

    if (error || !data?.id) {
      return {
        status: 'failed',
        errorCode: error?.name ?? 'unknown_error',
        errorMessage: sanitizeProviderError(error?.message),
      };
    }

    return { status: 'accepted', providerMessageId: data.id };
  } catch (error) {
    return {
      status: 'failed',
      errorCode: 'send_exception',
      errorMessage: sanitizeProviderError(error instanceof Error ? error.message : null),
    };
  }
}
