import { withApiRoute } from '@/lib/observability/withApiRoute';

import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { verifyCaptchaToken } from '@/lib/captcha/turnstile';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { setAuthCookies } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/auth/verification';
import { resolveSiteUrl } from '@/lib/auth/site-url';
import { ONBOARDING_PATH } from '@/lib/routes/authRoutes';
import {
  LEGAL_PATHS,
  PRIVACY_POLICY_VERSION,
  TERMS_OF_USE_VERSION,
} from '@/lib/legal/policyVersions';
import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateFullName,
} from '@/utils/validation/auth';

/**
 * Signs the freshly created account in so registration ends inside the app
 * rather than at a second login form. A failure here is not fatal: the account
 * exists, and the caller falls back to the login screen.
 */
async function signInNewUser(email: string, password: string) {
  try {
    const authClient = await createRouteHandlerClient(undefined, { ignoreCookies: true });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      console.error('Auto sign-in after signup failed:', error);
      return null;
    }

    return data.session;
  } catch (error) {
    console.error('Auto sign-in after signup threw:', error);
    return null;
  }
}

async function POSTHandler(req: Request) {
  const siteUrl = resolveSiteUrl(req);
  let step = 'rate_limit';

  const clientIp = getClientIp(req);
  const rateLimitResult = await rateLimit('registerIp', clientIp);
  if (!rateLimitResult.success) {
    return fail({ error: 'Too many sign-up attempts. Please try again later.' }, 429, {
      headers: rateLimitHeaders(rateLimitResult),
    });
  }

  try {
    step = 'parse_body';
    const body = await req.json();
    const {
      email,
      password,
      username,
      agree_to_terms,
      acceptedPolicies,
      full_name,
      date_of_birth,
      country,
      bio,
      steam_id,
      captchaToken,
    } = body;

    if (agree_to_terms !== true) {
      return fail({ error: 'You must accept the terms of use and privacy policy.' }, 400);
    }

    const acceptedAt =
      typeof acceptedPolicies?.acceptedAt === 'string' ? acceptedPolicies.acceptedAt : null;
    const acceptedAtDate = acceptedAt ? new Date(acceptedAt) : null;
    const acceptedAtValid = Boolean(acceptedAtDate && Number.isFinite(acceptedAtDate.getTime()));

    const hasValidPolicyVersions =
      acceptedPolicies?.termsVersion === TERMS_OF_USE_VERSION &&
      acceptedPolicies?.privacyVersion === PRIVACY_POLICY_VERSION &&
      acceptedPolicies?.termsPath === LEGAL_PATHS.terms &&
      acceptedPolicies?.privacyPath === LEGAL_PATHS.privacy;

    if (!hasValidPolicyVersions || !acceptedAtValid) {
      return fail({ error: 'Policy consent is invalid. Refresh and try again.' }, 400);
    }

    const legalAcceptance = {
      terms_version: TERMS_OF_USE_VERSION,
      privacy_version: PRIVACY_POLICY_VERSION,
      terms_path: LEGAL_PATHS.terms,
      privacy_path: LEGAL_PATHS.privacy,
      accepted_at: acceptedAt,
    };

    step = 'verify_captcha';
    const captchaResult = await verifyCaptchaToken(captchaToken);
    if (!captchaResult.success) {
      console.warn('Signup captcha verification failed', captchaResult.errors);
      return fail({ error: 'CAPTCHA validation failed, please retry' }, 403);
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return fail({ error: emailValidation.error || 'Invalid email' }, 400);
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.isValid) {
      return fail({ error: usernameValidation.error || 'Invalid username' }, 400);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return fail({ error: passwordValidation.error || 'Invalid password' }, 400);
    }

    if (full_name) {
      const nameValidation = validateFullName(full_name);
      if (!nameValidation.isValid) {
        return fail({ error: nameValidation.error || 'Invalid full name' }, 400);
      }
    }

    const safeFullName =
      typeof full_name === 'string' && full_name.trim().length > 0 ? full_name.trim() : username;

    step = 'create_supabase_admin_client';
    const supabase = createSupabaseAdminClient();

    step = 'check_existing_email';
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id, account_status')
      .eq('email', email)
      .neq('account_status', 'deleted')
      .maybeSingle();

    if (existingEmail) {
      console.warn('Signup attempt for already registered email', email);
      return fail({ error: 'An account with this email already exists.' }, 409);
    }

    step = 'check_existing_username';
    const { data: existingUsername } = await supabase
      .from('users')
      .select('id, account_status')
      .eq('username', username)
      .neq('account_status', 'deleted')
      .maybeSingle();

    if (existingUsername) {
      console.warn('Signup attempt with existing username', username);
      return fail({ error: 'Username is already in use.' }, 409);
    }

    step = 'create_auth_user';
    // The account is created confirmed at the Supabase level so the user can be
    // signed in immediately and start using the app. Address ownership is tracked
    // separately via public.users.email_verified, which the emailed link flips.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        full_name: safeFullName,
        legal_acceptance: legalAcceptance,
      },
    });

    if (authError) {
      console.error('Admin create user error:', authError);
      if (
        authError.message.toLowerCase().includes('already') ||
        authError.status === 422
      ) {
        return fail({ error: 'An account with these details already exists.' }, 409);
      }
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    const createdUser = authData.user;
    if (!createdUser) {
      console.error('Admin create user returned no user object');
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    step = 'upsert_user_profile';
    const { error: updateError } = await supabase
      .from('users')
      .upsert(
        {
          id: createdUser.id,
          email,
          username,
          full_name: safeFullName,
          display_name: safeFullName,
          date_of_birth: date_of_birth || null,
          country: country || null,
          bio: bio || null,
          email_verified: false,
          privacy_settings: {
            legal_acceptance: legalAcceptance,
          },
        },
        { onConflict: 'id' },
      )
      .select('id')
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        await supabase.auth.admin.deleteUser(createdUser.id).catch(rollbackError => {
          console.error(
            'Signup rollback failed - orphaned auth user:',
            createdUser.id,
            rollbackError,
          );
        });
        return fail({ error: 'Username or email is already in use.' }, 409);
      }
      console.error('Profile upsert error:', updateError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    // Store steam_id in user_category_profiles if provided
    if (steam_id) {
      step = 'upsert_category_profile';
      const { error: categoryError } = await supabase.from('user_category_profiles').upsert(
        {
          user_id: createdUser.id,
          profiles: {
            games: {
              steam_id,
            },
          },
        },
        { onConflict: 'user_id' },
      );

      if (categoryError) {
        console.error('Category profile upsert error:', categoryError);
        // Don't fail signup if category profile fails - user can add it later
      }
    }

    // From here on the account exists and is usable. Email delivery problems must
    // never fail the request — that would leave the user with an account they were
    // told was not created. Failures are reported as a flag instead, and the user
    // can always trigger /api/auth/resend-verification.
    step = 'send_verification_email';
    const verificationEmailSent = await sendVerificationEmail(supabase, email, siteUrl);

    step = 'create_session';
    const session = await signInNewUser(email, password);

    if (session) {
      step = 'set_auth_cookies';
      await setAuthCookies(session.access_token, session.refresh_token, true);
    }

    step = 'complete';
    return ok({
      ok: true,
      user: { id: createdUser.id, email, username },
      session,
      // No session means the browser has to fall back to the login screen, but the
      // account itself was created successfully either way.
      redirectUrl: session ? ONBOARDING_PATH : '/auth/login',
      verificationEmailSent,
    });
  } catch (error) {
    console.error('Signup handler error:', { step, error });
    if (process.env.NODE_ENV === 'development') {
      const message = error instanceof Error ? error.message : 'Unknown signup error';
      return fail({ error: `Signup failed at step "${step}": ${message}` }, 500);
    }
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const POST = withApiRoute(POSTHandler);
