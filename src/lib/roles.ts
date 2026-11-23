import type { UserRole } from '@/types/user';

const VALID_ROLES: UserRole[] = ['user', 'author', 'reviewer', 'moderator', 'admin', 'owner'];

const VALID_ROLE_SET = new Set<UserRole>(VALID_ROLES);

type RoleCarrier = { roles?: string[] | null } | null | undefined;

const normalizeRole = (role: string | null | undefined): UserRole | null => {
  if (!role) {
    return null;
  }
  const normalized = role.toLowerCase();
  if (normalized === 'mod') {
    return 'moderator';
  }
  if (VALID_ROLE_SET.has(normalized as UserRole)) {
    return normalized as UserRole;
  }
  return null;
};

const normalizeRoles = (roles: (string | null | undefined)[]) =>
  roles.map(normalizeRole).filter((role): role is UserRole => role !== null);

export const getUserRoles = (user: RoleCarrier): UserRole[] => {
  if (!user) {
    return [];
  }
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return normalizeRoles(user.roles);
  }
  return [];
};

export const hasRole = (user: RoleCarrier, role: UserRole): boolean =>
  getUserRoles(user).includes(role);

export const hasAnyRole = (user: RoleCarrier, roles: UserRole[]): boolean => {
  const userRoles = getUserRoles(user);
  return roles.some(role => userRoles.includes(role));
};

export const isAdminLike = (user: RoleCarrier): boolean => hasAnyRole(user, ['admin', 'owner']);

export const isAdminOrModerator = (user: RoleCarrier): boolean =>
  hasAnyRole(user, ['admin', 'owner', 'moderator']);

/**
 * May read and edit every article and review, drafts included, not just their
 * own. The database enforces the same rule as `public.can_manage_all_articles()`
 * (supabase/migrations/20261123_rc060_staff_article_access.sql), so the two
 * must change together.
 */
export const canManageAllArticles = (user: RoleCarrier): boolean => isAdminOrModerator(user);

export const isOwner = (user: RoleCarrier): boolean => hasAnyRole(user, ['owner']);
