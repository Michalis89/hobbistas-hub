import { withApiRoute } from '@/lib/observability/withApiRoute';

/**
 * GET /api/auth/confirm
 *
 * Landing point for the link in the verification email. It exchanges the
 * `hashed_token` for a real session, marks the address as verified, and drops
 * the user straight into the app — so clicking the link from any device signs
 * them in instead of bouncing them to a login form.
 */

import { NextResponse } from 'next/server';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { setAuthCookiesOnResponse } from '@/lib/auth';
import { resolveSiteUrl } from '@/lib/auth/site-url';
import { VERIFICATION_OTP_TYPE } from '@/lib/auth/verification-link';
import { DASHBOARD_PATH, ONBOARDING_PATH } from '@/lib/routes/authRoutes';
import type { EmailOtpType } from '@supabase/supabase-js';

const SUPPORTED_OTP_TYPES: readonly EmailOtpType[] = ['magiclink', 'email', 'signup'];

/** Only same-origin relative paths may be used as a post-confirm destination. */
function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  return value;
}

async function GETHandler(req: Request) {
  const siteUrl = resolveSiteUrl(req);
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const requestedType = url.searchParams.get('type') as EmailOtpType | null;
  const type =
    requestedType && SUPPORTED_OTP_TYPES.includes(requestedType)
      ? requestedType
      : VERIFICATION_OTP_TYPE;
  const nextPath = safeRedirectPath(url.searchParams.get('next'));

  if (!tokenHash) {
    return NextResponse.redirect(`${siteUrl}/auth/confirm-email?state=error`);
  }

  const supabase = await createRouteHandlerClient(undefined, { ignoreCookies: true });
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error || !data.session || !data.user) {
    console.warn('Email confirmation failed:', error?.message);
    return NextResponse.redirect(`${siteUrl}/auth/confirm-email?state=error`);
  }

  // Service role: the verified flag must not be writable by the user themselves.
  const admin = createSupabaseAdminClient();
  const { error: flagError } = await admin
    .from('users')
    .update({ email_verified: true })
    .eq('id', data.user.id);

  if (flagError) {
    // The session is valid regardless, so let the user in and retry the flag on
    // their next confirmation attempt rather than blocking access.
    console.error('Failed to mark email as verified:', flagError);
  }

  // Someone confirming from a second device has no categories yet; send them to
  // onboarding, and everyone else to their dashboard.
  const { data: categoryProfile } = await admin
    .from('user_category_profiles')
    .select('profiles')
    .eq('user_id', data.user.id)
    .maybeSingle();

  const hasCategories = Object.keys(categoryProfile?.profiles ?? {}).length > 0;
  const destination = nextPath ?? (hasCategories ? DASHBOARD_PATH : ONBOARDING_PATH);

  const response = NextResponse.redirect(`${siteUrl}${destination}?verified=1`);
  return setAuthCookiesOnResponse(
    response,
    data.session.access_token,
    data.session.refresh_token,
    true,
  );
}

export const GET = withApiRoute(GETHandler);
