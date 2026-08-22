/**
 * Email verification helpers.
 *
 * Accounts are created already usable (see /api/auth/signup) and address
 * ownership is tracked separately in `public.users.email_verified`. The link we
 * email carries a Supabase `hashed_token` that /api/auth/confirm exchanges for a
 * session, which is why the raw `action_link` is never used: going through our
 * own route lets us both sign the user in and flip the verified flag.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { sendConfirmEmail } from '@/lib/email/send';
import { VERIFICATION_OTP_TYPE, buildVerificationLink } from './verification-link';

export { VERIFICATION_OTP_TYPE, buildVerificationLink };

type AdminClient = SupabaseClient<Database>;

/**
 * Generates a fresh verification link and emails it.
 *
 * Returns whether the email went out. Callers treat a `false` as a soft failure:
 * the account still works, and the user can ask for another email.
 */
export async function sendVerificationEmail(
  supabase: AdminClient,
  email: string,
  siteUrl: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: VERIFICATION_OTP_TYPE,
      email,
    });

    const hashedToken = data?.properties?.hashed_token;
    if (error || !hashedToken) {
      console.error('Verification link generation failed:', error);
      return false;
    }

    await sendConfirmEmail(email, buildVerificationLink(siteUrl, hashedToken));
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}
