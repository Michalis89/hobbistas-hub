import { getResendClient } from './resend';
import { renderConfirmEmail, renderResetPasswordEmail } from './templates';

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
