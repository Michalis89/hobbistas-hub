/**
 * Addresses for admin email: the sender identity of owner-composed emails
 * (the admin email composer) and the recipient of internal admin
 * notifications. Transactional emails (verification, password reset) do not
 * use this.
 *
 * Server-side only: it reads non-public environment variables, and only
 * `send.ts` imports it. Keep it out of client components.
 *
 * Every value is configurable, and each falls back to a safe default when
 * the configured value is missing or malformed, so a bad env var can never
 * reach a mail header or make Resend reject every send.
 */

/** The domain verified in Resend. Mail can be sent from any local part on it. */
export const VERIFIED_SENDING_DOMAIN = 'mail.hobbistas-hub.com';

export const DEFAULT_ADMIN_EMAIL_FROM = `Michail from Hobbistas <hello@${VERIFIED_SENDING_DOMAIN}>`;

/** Where replies go: the From address above has no inbox (no MX on the subdomain). */
export const DEFAULT_ADMIN_EMAIL_REPLY_TO = 'support@hobbistas-hub.com';

const LOCAL_PART = /^[A-Za-z0-9._%+-]+$/;
// One bare address: no display name, whitespace, line breaks or lists.
const BARE_EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
// Display name: printable text without the characters that change how a
// From header is parsed (quotes, angle brackets, separators, backslash).
const UNSAFE_DISPLAY_NAME = /[\u0000-\u001F\u007F<>()[\]"\\,;:@]/;
const DISPLAY_NAME_MAX = 64;

/** True for `local@mail.hobbistas-hub.com` with a plain local part. */
function isVerifiedDomainAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  if (at <= 0) {
    return false;
  }
  return (
    LOCAL_PART.test(address.slice(0, at)) &&
    address.slice(at + 1).toLowerCase() === VERIFIED_SENDING_DOMAIN
  );
}

/**
 * ADMIN_EMAIL_FROM, accepted as `Name <local@mail.hobbistas-hub.com>` or a
 * bare `local@mail.hobbistas-hub.com`. Any other domain is refused: Resend
 * only sends from the verified domain, so it would fail every email.
 */
export function resolveAdminEmailFrom(): string {
  const configured = process.env.ADMIN_EMAIL_FROM?.trim();
  if (!configured) {
    return DEFAULT_ADMIN_EMAIL_FROM;
  }

  const named = /^(.+?)\s*<([^<>]+)>$/.exec(configured);
  if (named) {
    const displayName = named[1].trim();
    const address = named[2].trim();
    const validName =
      displayName.length > 0 &&
      displayName.length <= DISPLAY_NAME_MAX &&
      !UNSAFE_DISPLAY_NAME.test(displayName);
    return validName && isVerifiedDomainAddress(address)
      ? `${displayName} <${address}>`
      : DEFAULT_ADMIN_EMAIL_FROM;
  }

  return isVerifiedDomainAddress(configured) ? configured : DEFAULT_ADMIN_EMAIL_FROM;
}

/**
 * ADMIN_EMAIL_REPLY_TO, accepted only as one bare address. Unlike the From
 * address it may be on any domain: it only has to receive mail.
 */
export function resolveAdminEmailReplyTo(): string {
  const configured = process.env.ADMIN_EMAIL_REPLY_TO?.trim();
  return configured && BARE_EMAIL.test(configured) ? configured : DEFAULT_ADMIN_EMAIL_REPLY_TO;
}

/** Who is told about new registrations, unless ADMIN_REGISTRATION_NOTIFICATION_EMAIL overrides it. */
export const DEFAULT_REGISTRATION_NOTIFICATION_EMAIL = 'support@hobbistas-hub.com';

/**
 * ADMIN_REGISTRATION_NOTIFICATION_EMAIL, accepted only as one bare address.
 * Read from the server environment only: nothing in a request can change it.
 */
export function resolveRegistrationNotificationRecipient(): string {
  const configured = process.env.ADMIN_REGISTRATION_NOTIFICATION_EMAIL?.trim();
  return configured && BARE_EMAIL.test(configured)
    ? configured
    : DEFAULT_REGISTRATION_NOTIFICATION_EMAIL;
}
