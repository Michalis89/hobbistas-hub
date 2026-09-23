import { withApiRoute } from '@/lib/observability/withApiRoute';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';
import type { User } from '@/types/user';
import type { Database } from '@/lib/supabase/database.types';
import type { CategoryProfiles } from '@/lib/validation/profile';
import { fetchTopGenres } from '@/lib/profile/genre-affinity';

/**
 * GET /api/me
 * Fetch current authenticated user's profile from new structure
 * - location_city: users.location_city (dedicated column)
 * - category_profile: user_category_profiles.profiles (dedicated table)
 * - genre_affinity: user_genre_affinity table (computed genre scores)
 */
const handler = withApiRoute(async (request: Request) => {
  try {
    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);
    const userId = session.user.id;

    if (request.method === 'GET') {
      // Fetch user profile
      type UserRow = Database['public']['Tables']['users']['Row'];
      // Explicit column list — update if new columns are added to users table
      const { data: user, error: userError } = await supabase
        .from('users')
        .select(
          'id, email, username, full_name, display_name, bio, avatar_url, date_of_birth, country, timezone, language_preference, roles, social_links, privacy_settings, location_city, account_status, email_verified, last_login, created_at, updated_at',
        )
        .eq('id', userId)
        .single<UserRow>();

      if (userError) {
        return fail({ error: 'Failed to fetch user profile' }, 500);
      }

      // Fetch category profile from dedicated table
      const { data: categoryProfile } = await supabase
        .from('user_category_profiles')
        .select('profiles, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      const categoryProfileValue = (categoryProfile?.profiles as CategoryProfiles | null) || null;

      // Fetch top genres (all top 8 per category, no threshold filtering)
      const topGenres = await fetchTopGenres(supabase, userId);

      // Return user with category_profile and genre_affinity as separate fields
      const response = {
        ...user,
        category_profile: categoryProfileValue,
        genre_affinity: topGenres,
      };

      return ok(
        // The selected row carries `Json` columns and the columns the app no
        // longer models, so it only narrows to `User` through `unknown`.
        response as unknown as User & {
          category_profile: unknown;
          genre_affinity: Record<string, string[]>;
        },
      );
    }

    return fail({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405, {
      headers: { Allow: 'GET' },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    throw error;
  }
});

export const GET = handler;
