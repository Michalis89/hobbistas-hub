import { withApiRoute } from '@/lib/observability/withApiRoute';

/**
 * Login API Route
 * POST /api/auth/login
 * PH-30: User Authentication System
 */

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { validateEmail, validatePassword } from '@/utils/validation/auth';
import type { Database } from '@/lib/supabase/database.types';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { verifyCaptchaToken } from '@/lib/captcha/turnstile';
import { setAuthCookies } from '@/lib/auth';
import { DASHBOARD_PATH, ONBOARDING_PATH } from '@/lib/routes/authRoutes';

const fallbackUsername = (email: string, userId: string) => {
  const localPart = email.split('@')[0]?.toLowerCase() ?? 'user';
  const base = localPart.replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const safeBase = base.length >= 3 ? base : 'user';
  return `${safeBase}_${userId.slice(0, 6)}`;
};

async function POSTHandler(req: Request) {
  // Rate limiting: 10 login attempts per 10 minutes per IP (Redis-backed, serverless-safe)
  const clientIp = getClientIp(req);
  const rateLimitResult = await rateLimit('loginIp', clientIp);

  if (!rateLimitResult.success) {
    return fail({ error: 'Too many login attempts. Please try again later.' }, 429, {
      headers: rateLimitHeaders(rateLimitResult),
    });
  }

  try {
    const body = await req.json();
    const { identifier, password, captchaToken, remember } = body; // Accept email OR username
    const shouldRemember = remember === true;

    const captchaResult = await verifyCaptchaToken(captchaToken);
    if (!captchaResult.success) {
      console.warn('Login captcha verification failed', captchaResult.errors);
      return fail({ error: 'CAPTCHA validation failed, please retry' }, 403);
    }

    if (!identifier || identifier.trim() === '') {
      return fail({ error: 'Email or username is required' }, 400);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return fail({ error: passwordValidation.error || 'Invalid password' }, 400);
    }

    const supabase = await createRouteHandlerClient(undefined, { ignoreCookies: true });
    let email = identifier;

    // If identifier doesn't contain @, treat it as username
    if (!identifier.includes('@')) {
      // Look up email from username in public.users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, account_status')
        .eq('username', identifier)
        .maybeSingle();

      if (userError) {
        console.error('Username lookup error:', userError);
        return fail({ error: 'Login error' }, 500);
      }

      if (!userData) {
        return fail({ error: 'Wrong username or password' }, 401);
      }

      const typedUserData = userData as Pick<
        Database['public']['Tables']['users']['Row'],
        'email' | 'account_status'
      >;

      // Check if account is deleted, suspended, or banned
      if (typedUserData.account_status === 'deleted') {
        return fail({ error: 'This account has been deleted' }, 403);
      }
      if (typedUserData.account_status === 'suspended') {
        return fail({ error: 'Your account is suspended. Contact support.' }, 403);
      }
      if (typedUserData.account_status === 'banned') {
        return fail({ error: 'Your account has been banned.' }, 403);
      }
      email = typedUserData.email;
    } else {
      // Validate email format
      const emailValidation = validateEmail(identifier);
      if (!emailValidation.isValid) {
        return fail({ error: emailValidation.error || 'Invalid email' }, 400);
      }
    }

    // SIGN IN
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error('Login error:', authError);

      // Check if email is not confirmed
      if (authError.message === 'Email not confirmed') {
        return fail(
          {
            error:
              'Your email is not confirmed yet. Check your inbox and click the confirmation link.',
          },
          401,
        );
      }

      return fail({ error: 'Wrong email or password' }, 401);
    }

    if (!authData.user) {
      return fail({ error: 'Login failed' }, 500);
    }

    const authedSupabase = await createRouteHandlerClient(authData.session?.access_token, {
      ignoreCookies: true,
    });
    const { data: userProfile, error: profileError } = await authedSupabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile fetch error:', profileError);
      return fail({ error: 'Profile loading failed' }, 500);
    }

    let resolvedUserProfile = userProfile;
    if (!resolvedUserProfile) {
      const generatedUsername = fallbackUsername(email, authData.user.id);
      const { data: createdProfile, error: createProfileError } = await authedSupabase
        .from('users')
        .upsert(
          {
            id: authData.user.id,
            email: authData.user.email || email,
            username: generatedUsername,
            display_name:
              (authData.user.user_metadata?.full_name as string | undefined) || generatedUsername,
            full_name: (authData.user.user_metadata?.full_name as string | undefined) || null,
          },
          { onConflict: 'id' },
        )
        .select('*')
        .single();

      if (createProfileError) {
        console.error('Profile upsert during login failed:', createProfileError);
        return fail({ error: 'Failed to initialize account profile' }, 500);
      }

      resolvedUserProfile = createdProfile;
    }

    // Check if account is suspended or banned
    if (resolvedUserProfile.account_status === 'suspended') {
      return fail({ error: 'Your account is suspended. Contact support.' }, 403);
    }
    if (resolvedUserProfile.account_status === 'banned') {
      return fail({ error: 'Your account has been banned.' }, 403);
    }

    // UPDATE LAST LOGIN
    await authedSupabase.rpc('update_user_last_login', { user_id: authData.user.id } as never);

    // SET SESSION COOKIES using shared utility
    if (authData.session) {
      await setAuthCookies(
        authData.session.access_token,
        authData.session.refresh_token,
        shouldRemember,
      );
    }

    // DETERMINE REDIRECT URL based on profile completeness
    // Fetch category profile to check if user has data
    const { data: categoryProfile } = await authedSupabase
      .from('user_category_profiles')
      .select('profiles')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    // User has data if they have at least one category in their profile.
    // Without it they go to onboarding — a short guided setup — rather than the
    // full profile settings screen with its avatar uploads and danger zone.
    const hasCategoryData = categoryProfile?.profiles
      ? Object.keys(categoryProfile.profiles).length > 0
      : false;
    const redirectUrl = hasCategoryData ? DASHBOARD_PATH : ONBOARDING_PATH;

    // RETURN SUCCESS
    return ok({
      user: resolvedUserProfile,
      session: authData.session,
      message: 'Login successful!',
      redirectUrl,
    });
  } catch (error) {
    console.error('Login error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const POST = withApiRoute(POSTHandler);
