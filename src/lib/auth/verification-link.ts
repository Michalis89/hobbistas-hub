/**
 * Verification link shape, kept free of any email-provider imports.
 *
 * The confirm route only needs to know how to read a link, not how to send one,
 * and `@/lib/email/send` initialises the Resend client at module load.
 */

export const VERIFICATION_OTP_TYPE = 'magiclink';

export function buildVerificationLink(siteUrl: string, hashedToken: string): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: VERIFICATION_OTP_TYPE,
  });
  return `${siteUrl}/api/auth/confirm?${params.toString()}`;
}
