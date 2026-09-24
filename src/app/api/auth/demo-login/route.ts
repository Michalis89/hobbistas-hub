import { withApiRoute } from '@/lib/observability/withApiRoute';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { setAuthCookies } from '@/lib/auth';
import { DASHBOARD_PATH } from '@/lib/routes/authRoutes';
import { isDemoEnabled } from '@/lib/demo';
import { getDemoCredentials } from '@/lib/demo/credentials.server';

/**
 * POST /api/auth/demo-login
 *
 * Signs the visitor into the shared read-only demo account. The credentials
 * live in server-only environment variables and never reach the client, so the
 * button is a request to this route rather than a pre-filled login form.
 *
 * There is deliberately no captcha: the account has nothing to protect - it
 * cannot write - and a challenge would only get between a recruiter and the
 * thing they came to look at. The rate limit is what keeps this from becoming
 * a free session-minting endpoint.
 */
async function POSTHandler(req: Request) {
  if (!isDemoEnabled()) {
    return fail({ error: 'Demo access is not available.', code: 'DEMO_DISABLED' }, 404);
  }

  const credentials = getDemoCredentials();
  if (!credentials) {
    // Enabled in the client bundle but not configured on the server: a
    // deployment mistake, not something the visitor can act on.
    console.error('Demo login is enabled but DEMO_USER_EMAIL/DEMO_USER_PASSWORD are unset.');
    return fail({ error: 'Demo access is not available.', code: 'DEMO_DISABLED' }, 503);
  }

  const clientIp = getClientIp(req);
  const rateLimitResult = await rateLimit('loginIp', clientIp);
  if (!rateLimitResult.success) {
    return fail({ error: 'Too many attempts. Please try again later.' }, 429, {
      headers: rateLimitHeaders(rateLimitResult),
    });
  }

  try {
    const supabase = await createRouteHandlerClient(undefined, { ignoreCookies: true });
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword(credentials);

    if (authError || !authData.user || !authData.session) {
      console.error('Demo login failed:', authError);
      return fail({ error: 'Demo account is unavailable right now.' }, 503);
    }

    // Same gate the normal login applies: setting the demo account to
    // suspended has to actually turn the demo off.
    const { data: profile } = await supabase
      .from('users')
      .select('account_status')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profile?.account_status && profile.account_status !== 'active') {
      return fail({ error: 'Demo access is not available.', code: 'DEMO_DISABLED' }, 403);
    }

    // Never remembered: a demo session should expire with the browser rather
    // than leave a stranger's device signed into a shared account.
    await setAuthCookies(authData.session.access_token, authData.session.refresh_token, false);

    return ok({
      redirectTo: DASHBOARD_PATH,
      user: {
        id: authData.user.id,
        email: authData.user.email ?? credentials.email,
      },
    });
  } catch (error) {
    console.error('Demo login error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const POST = withApiRoute(POSTHandler);
