import { sanitizeProviderError } from './adminMessage';
import {
  resolveAdminEmailFrom,
  resolveAdminEmailReplyTo,
  resolveRegistrationNotificationRecipient,
} from './adminSender';
import { getResendClient } from './resend';
import {
  NEW_USER_NOTIFICATION_SUBJECT,
  renderAdminMessageEmail,
  renderConfirmEmail,
  renderNewUserNotificationEmail,
  renderResetPasswordEmail,
} from './templates';

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
  // Not FROM_ADDRESS: owner-composed mail goes out under a personal sender.
  const from = resolveAdminEmailFrom();
  const replyTo = resolveAdminEmailReplyTo();

  if (isDevelopment && (ENABLE_DEV_EMAIL_LOGGING || !process.env.RESEND_API_KEY)) {
    console.warn('\n📧 [DEV EMAIL] Would send admin message:');
    console.warn('  From:', from);
    console.warn('  To:', to);
    console.warn('  Reply-To:', replyTo);
    console.warn('  Subject:', subject);
    console.warn('');
    return { status: 'simulated' };
  }

  try {
    const { data, error } = await getResendClient().emails.send(
      {
        from,
        to: [to],
        replyTo,
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

export type NewUserNotification = {
  userId: string;
  username: string;
  displayName: string | null;
  /** Already formatted, e.g. "2026-10-22 18:04 UTC". */
  registeredAtUtc: string;
  adminUsersUrl: string;
};

/**
 * Tells the owner that an account was created. Internal only: it goes to
 * ADMIN_REGISTRATION_NOTIFICATION_EMAIL from the transactional sender, never
 * to the new user, and reports its outcome instead of throwing.
 *
 * The idempotency key is derived from the user id, so a retried call cannot
 * notify twice for the same account.
 */
export async function sendNewUserNotificationEmail(
  notification: NewUserNotification,
): Promise<AdminMessageSendResult> {
  const { userId, username, displayName, registeredAtUtc, adminUsersUrl } = notification;
  const to = resolveRegistrationNotificationRecipient();

  if (isDevelopment && (ENABLE_DEV_EMAIL_LOGGING || !process.env.RESEND_API_KEY)) {
    console.warn('\n📧 [DEV EMAIL] Would send new user notification:');
    console.warn('  To:', to);
    console.warn('  Username:', username);
    console.warn('');
    return { status: 'simulated' };
  }

  const text = [
    'A new user just joined Hobbistas Hub!',
    '',
    `Username: @${username}`,
    ...(displayName ? [`Display name: ${displayName}`] : []),
    `Registered: ${registeredAtUtc}`,
    '',
    `Users Management: ${adminUsersUrl}`,
  ].join('\n');

  try {
    const { data, error } = await getResendClient().emails.send(
      {
        from: FROM_ADDRESS,
        to: [to],
        subject: NEW_USER_NOTIFICATION_SUBJECT,
        text,
        html: renderNewUserNotificationEmail({
          username,
          displayName,
          registeredAtUtc,
          adminUsersUrl,
        }),
      },
      { idempotencyKey: `new-user-registration/${userId}` },
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
