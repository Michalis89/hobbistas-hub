import { withApiRoute } from '@/lib/observability/withApiRoute';

/**
 * POST /api/auth/resend-verification
 *
 * Sends a fresh verification link. Previously a lost confirmation email was a
 * dead end: the confirm screen told people to sign up again, and signing up
 * again returned 409 because the address already existed.
 */

import { ok, fail } from '@/lib/api/response';
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveSiteUrl } from '@/lib/auth/site-url';
import { sendVerificationEmail } from '@/lib/auth/verification';
import { validateEmail } from '@/utils/validation/auth';

// Deliberately identical for "sent" and "no such account" so this endpoint
// cannot be used to discover which addresses are registered.
const GENERIC_RESPONSE = {
  message: 'If that address has an account, a verification link is on its way.',
};

async function POSTHandler(req: Request) {
  const clientIp = getClientIp(req);
  const ipLimit = await rateLimit('resendVerificationIp', clientIp);
  if (!ipLimit.success) {
    return fail({ error: 'Too many requests. Please try again later.' }, 429, {
      headers: rateLimitHeaders(ipLimit),
    });
  }

  let email: unknown;
  try {
    ({ email } = await req.json());
  } catch {
    return fail({ error: 'Invalid request body' }, 400);
  }

  if (typeof email !== 'string') {
    return fail({ error: 'Email is required' }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailValidation = validateEmail(normalizedEmail);
  if (!emailValidation.isValid) {
    return fail({ error: emailValidation.error || 'Invalid email' }, 400);
  }

  const emailLimit = await rateLimit('resendVerificationEmail', normalizedEmail);
  if (!emailLimit.success) {
    return fail({ error: 'Too many requests for this address. Please try again later.' }, 429, {
      headers: rateLimitHeaders(emailLimit),
    });
  }

  const supabase = createSupabaseAdminClient();

  const { data: existingUser } = await supabase
    .from('users')
    .select('id, email_verified')
    .eq('email', normalizedEmail)
    .neq('account_status', 'deleted')
    .maybeSingle();

  // Unknown address, or one that is already verified: nothing to send, but the
  // response must not reveal which case it was.
  if (!existingUser || existingUser.email_verified) {
    return ok(GENERIC_RESPONSE);
  }

  const sent = await sendVerificationEmail(supabase, normalizedEmail, resolveSiteUrl(req));
  if (!sent) {
    return fail({ error: 'We could not send the email right now. Please try again shortly.' }, 502);
  }

  return ok(GENERIC_RESPONSE);
}

export const POST = withApiRoute(POSTHandler);
