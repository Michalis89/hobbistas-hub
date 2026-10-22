type EmailTemplateConfig = {
  preheader: string;
  title: string;
  subtitle: string;
  intro: string;
  actionLabel: string;
  actionLink: string;
  outro: string;
  helper: string;
};

const palette = {
  bg: '#000000',
  surface: 'rgba(28, 28, 30, 0.92)',
  border: 'rgba(255, 255, 255, 0.1)',
  text: 'rgba(255, 255, 255, 0.95)',
  secondaryText: 'rgba(235, 235, 245, 0.6)',
  mutedText: 'rgba(235, 235, 245, 0.45)',
  brandBlue: '#007aff',
  white: '#ffffff',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderEmailTemplate(config: EmailTemplateConfig): string {
  const safeLink = escapeHtml(config.actionLink);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.title}</title>
  </head>
  <body style="margin:0;padding:0;background:${palette.bg};font-family:,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${palette.text};">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
      ${config.preheader}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${palette.bg};">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 18px;text-align:center;">
                <p style="margin:0;font-size:22px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:${palette.white};">Hobbistas</p>
                <p style="margin:6px 0 0;font-size:12px;line-height:1.4;color:${palette.secondaryText};">${config.subtitle}</p>
              </td>
            </tr>
            <tr>
              <td style="border-radius:24px;background:${palette.surface};border:1px solid ${palette.border};box-shadow:0 2px 8px rgba(0,0,0,0.45),0 18px 54px rgba(0,0,0,0.62);padding:32px 24px;">
                <div style="height:4px;border-radius:999px;background:${palette.brandBlue};margin:0 0 20px;"></div>
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.022em;color:${palette.text};">${config.title}</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:${palette.secondaryText};">${config.intro}</p>
                <div style="margin:0 0 20px;text-align:center;">
                  <a href="${safeLink}" style="display:inline-block;padding:14px 26px;border-radius:14px;background:${palette.brandBlue};color:${palette.white};font-size:15px;font-weight:700;letter-spacing:-0.011em;text-decoration:none;box-shadow:0 10px 28px rgba(0,122,255,0.35);">
                    ${config.actionLabel}
                  </a>
                </div>
                <p style="margin:0;font-size:12.5px;line-height:1.65;color:${palette.secondaryText};">${config.outro}</p>
                <div style="margin-top:18px;padding-top:16px;border-top:1px solid ${palette.border};">
                  <p style="margin:0;font-size:12px;line-height:1.65;color:${palette.mutedText};">${config.helper}</p>
                  <p style="margin:8px 0 0;font-size:12px;line-height:1.55;word-break:break-all;">
                    <a href="${safeLink}" style="color:${palette.brandBlue};text-decoration:none;">${safeLink}</a>
                  </p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 8px 0;text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${palette.secondaryText};">
                  <a href="https://www.hobbistas-hub.com/" style="color:${palette.brandBlue};font-weight:600;text-decoration:none;">© 2026 Hobbistas</a>
                </p>
                <p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:${palette.mutedText};">
                  For questions, simply reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderConfirmEmail(actionLink: string): string {
  if (!actionLink) {
    throw new Error('Missing actionLink for confirm email');
  }

  return renderEmailTemplate({
    preheader: 'Confirm your email address on Hobbistas.',
    title: 'Confirm Your Email',
    subtitle: 'Your personal hobby hub',
    intro:
      'Welcome to <strong style="color: rgba(255,255,255,0.95);">Hobbistas</strong>. Click the button below to complete your registration.',
    actionLabel: 'Confirm Account',
    actionLink,
    outro: 'If you did not request this action, you can safely ignore this email.',
    helper: 'If the button does not work, copy and open the link below:',
  });
}

export function renderResetPasswordEmail(actionLink: string): string {
  if (!actionLink) {
    throw new Error('Missing actionLink for reset password email');
  }

  return renderEmailTemplate({
    preheader: 'Reset your Hobbistas account password.',
    title: 'Reset Your Password',
    subtitle: 'Secure access recovery',
    intro:
      'You requested a password reset for your <strong style="color: rgba(255,255,255,0.95);">Hobbistas</strong> account. Click the button below to create a new password.',
    actionLabel: 'Reset Password',
    actionLink,
    outro: 'If you did not make this request, no further action is required.',
    helper: 'If the button does not work, open the link below directly:',
  });
}

/**
 * The violet-bloom dark theme (`src/app/globals.css`) as literal colors:
 * email clients do not support CSS variables. Keep in sync with the tokens.
 */
const violetBloom = {
  background: '#1a1b1e', // --background
  card: '#222327', // --card / --surface-raised
  border: '#33353a', // --border
  text: '#f0f0f0', // --foreground / --text-primary
  secondaryText: '#a0a0a0', // --muted-foreground / --text-secondary
  tertiaryText: '#7a7a7a', // --text-tertiary
  primary: '#8c5cff', // --primary / --accent-primary
  link: '#9a70ff', // --link
};

// --font-sans, with system fallbacks. Not loaded remotely: a font request on
// open would tell a third party the email was read.
const EMAIL_FONT_STACK =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The branded frame shared by the violet-bloom emails: wordmark, subtitle,
 * one card and a footer. `title`, `subtitle` and `footerNote` are plain text
 * and escaped here; `contentHtml` must already be safe HTML.
 *
 * border-collapse:separate on the card table: with `collapse`, clients draw
 * the border square around the rounded background.
 */
function renderVioletBloomEmail(params: {
  title: string;
  subtitle: string;
  contentHtml: string;
  signature?: string;
  footerNote: string;
}): string {
  const c = violetBloom;
  const safeTitle = escapeHtml(params.title);
  const signatureRow = params.signature
    ? `
                  <tr>
                    <td style="padding:0 28px 28px;">
                      <p style="margin:0;padding-top:16px;border-top:1px solid ${c.border};font-size:14px;line-height:1.5;color:${c.secondaryText};">${escapeHtml(params.signature)}</p>
                    </td>
                  </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:${c.background};font-family:${EMAIL_FONT_STACK};color:${c.text};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${c.background};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 4px 20px;">
                <p style="margin:0;font-size:20px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${c.text};">Hobbistas<span style="color:${c.primary};">.</span></p>
                <p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:${c.secondaryText};">${escapeHtml(params.subtitle)}</p>
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:${c.card};border:1px solid ${c.border};border-radius:16px;">
                  <tr>
                    <td style="padding:32px 28px ${params.signature ? '16px' : '28px'};">
                      <div style="width:40px;height:4px;border-radius:999px;background:${c.primary};margin:0 0 20px;font-size:0;line-height:0;">&nbsp;</div>
                      <h1 style="margin:0 0 20px;font-size:20px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:${c.text};">${safeTitle}</h1>
                      ${params.contentHtml}
                    </td>
                  </tr>${signatureRow}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${c.tertiaryText};">
                  ${escapeHtml(params.footerNote)}
                </p>
                <p style="margin:8px 0 0;font-size:12px;line-height:1.6;">
                  <a href="https://www.hobbistas-hub.com/" style="color:${c.link};font-weight:600;text-decoration:none;">hobbistas-hub.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * A plain-text message from the Hobbistas team to one user. Both inputs are
 * already-personalized plain text and are escaped here; blank lines become
 * paragraphs and single newlines line breaks. No images, remote resources or
 * tracking.
 */
export function renderAdminMessageEmail(params: { subject: string; message: string }): string {
  const paragraphs = params.message
    .replaceAll('\r\n', '\n')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map(
      paragraph =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:${violetBloom.text};">${escapeHtml(
          paragraph,
        ).replaceAll('\n', '<br />')}</p>`,
    )
    .join('\n                ');

  return renderVioletBloomEmail({
    title: params.subject,
    subtitle: 'A personal note from the creator of Hobbistas',
    contentHtml: paragraphs,
    signature: 'The Hobbistas team',
    footerNote:
      'You are receiving this because you have a Hobbistas account. Reply to this email to reach the team.',
  });
}

export const NEW_USER_NOTIFICATION_SUBJECT = '🎉 New Hobbistas user registered!';

/**
 * Internal notice to the owner that an account was created. Carries only what
 * an admin needs to find the account: no email address, credentials or IP.
 */
export function renderNewUserNotificationEmail(params: {
  username: string;
  displayName: string | null;
  registeredAtUtc: string;
  adminUsersUrl: string;
}): string {
  const c = violetBloom;
  const rows: [string, string][] = [['Username', `@${params.username}`]];
  if (params.displayName) {
    rows.push(['Display name', params.displayName]);
  }
  rows.push(['Registered', params.registeredAtUtc]);

  const detailRows = rows
    .map(
      ([label, value]) => `
                        <tr>
                          <td style="width:1%;padding:8px 24px 8px 0;font-size:13px;line-height:1.5;color:${c.secondaryText};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
                          <td style="padding:8px 0;font-size:14px;line-height:1.5;color:${c.text};font-weight:600;word-break:break-word;">${escapeHtml(value)}</td>
                        </tr>`,
    )
    .join('');

  const contentHtml = `<p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:${c.text};">A new user just joined Hobbistas Hub!</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;border-top:1px solid ${c.border};border-bottom:1px solid ${c.border};">${detailRows}
                      </table>
                      <a href="${escapeHtml(params.adminUsersUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${c.primary};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open Users Management</a>`;

  return renderVioletBloomEmail({
    title: NEW_USER_NOTIFICATION_SUBJECT,
    subtitle: 'Admin notification',
    contentHtml,
    footerNote: 'Internal notification for Hobbistas admins. It is not sent to the new user.',
  });
}
