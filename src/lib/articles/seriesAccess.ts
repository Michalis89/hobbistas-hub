import type { UserRole } from '@/types/user';
import { hasAnyRole, isAdminOrModerator } from '@/lib/roles';

/**
 * Who may do what with article series.
 *
 * The same rules are enforced in three places, and must stay identical:
 *   - here (Studio pages and the /api/series routes),
 *   - the database: `series_can_create`, `series_can_manage_all` and
 *     `series_can_manage` in supabase/migrations/20261123_rc058_article_series.sql,
 *     used by RLS and by `replace_series_chapters`.
 *
 * They reuse the existing editorial role sets rather than defining new ones:
 *   - create: the roles that may create articles (`requireAuthorRole`);
 *   - manage all: the roles Studio lets manage everyone's content
 *     (`canManageAllContent`, i.e. `isAdminOrModerator`).
 */
export const SERIES_EDITOR_ROLES = [
  'author',
  'reviewer',
  'admin',
  'owner',
] as const satisfies readonly UserRole[];

/** Everyone who may open Series Management (and upload series covers). */
export const SERIES_STUDIO_ROLES = [
  ...SERIES_EDITOR_ROLES,
  'moderator',
] as const satisfies readonly UserRole[];

type RoleCarrier = { roles?: string[] | null } | null | undefined;

/** May create a series (and then manage the ones they own). */
export function canCreateSeries(user: RoleCarrier): boolean {
  return hasAnyRole(user, [...SERIES_EDITOR_ROLES]);
}

/** May manage every series, including other people's chapters. */
export function canManageAllSeries(user: RoleCarrier): boolean {
  return isAdminOrModerator(user);
}

/**
 * May manage this particular series. An owner who has lost every editorial
 * role loses access to their own series too.
 */
export function canManageSeries(
  user: RoleCarrier,
  userId: string,
  series: { owner_id: string | null },
): boolean {
  return canManageAllSeries(user) || (series.owner_id === userId && canCreateSeries(user));
}

/** May open Series Management at all. */
export function canAccessSeriesStudio(user: RoleCarrier): boolean {
  return canCreateSeries(user) || canManageAllSeries(user);
}
