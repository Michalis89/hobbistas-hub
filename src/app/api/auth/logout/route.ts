import { withApiRoute } from '@/lib/observability/withApiRoute';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';
import { clearAuthCookies } from '@/lib/auth';

const NO_STORE_HEADERS = {
  headers: {
    'Cache-Control': 'no-store',
  },
} satisfies ResponseInit;

/**
 * Logout must never leave a session cookie behind.
 *
 * The cookies are httpOnly, so the browser cannot drop them on its own — this
 * route is the only thing that can. Bailing out early on a failed `signOut()`
 * used to skip the clearing entirely, and since the client signs out first the
 * refresh token is usually already invalid by the time this runs. The surviving
 * cookie then read as a live session: the proxy kept redirecting to /dashboard
 * while `AuthInit` restored the session from /api/auth/session, so "log out"
 * silently logged the user back in.
 */
async function POSTHandler() {
  try {
    const supabase = await createRouteHandlerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      // Revoking server-side is best-effort; the token may already be gone.
      console.warn('Supabase signOut during logout failed:', error.message);
    }
  } catch (error) {
    console.warn('Supabase signOut during logout threw:', error);
  }

  try {
    await clearAuthCookies();
  } catch (error) {
    console.error('Failed to clear auth cookies during logout:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status, NO_STORE_HEADERS);
  }

  return ok({ message: 'Logout successful' }, NO_STORE_HEADERS);
}

export const POST = withApiRoute(POSTHandler);
