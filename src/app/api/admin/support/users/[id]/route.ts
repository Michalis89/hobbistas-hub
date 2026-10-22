import { withApiRoute } from '@/lib/observability/withApiRoute';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';
import { UnauthorizedError } from '@/lib/api/auth';
import { ForbiddenError, requireAdminRole } from '@/lib/api/permissions';
import { hasAnyRole } from '@/lib/roles';
import type { Database } from '@/lib/supabase/database.types';
import type { UserRole } from '@/types/user';

const ROLE_OPTIONS: UserRole[] = ['user', 'author', 'reviewer', 'moderator', 'admin', 'owner'];
const VALID_ROLE_SET = new Set<UserRole>(ROLE_OPTIONS);
const EDITABLE_KEYS = new Set(['display_name', 'full_name', 'country', 'account_status', 'roles']);

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRoles(value: unknown): UserRole[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const cleaned = Array.from(
    new Set(
      value
        .map(role => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
        .filter(role => VALID_ROLE_SET.has(role as UserRole)) as UserRole[],
    ),
  );
  return cleaned.length > 0 ? cleaned : ['user'];
}

function canManageTarget(actorRoles: string[], targetRoles: string[]) {
  const actorIsOwner = hasAnyRole({ roles: actorRoles }, ['owner']);
  if (actorIsOwner) {
    return true;
  }

  const actorIsAdmin = hasAnyRole({ roles: actorRoles }, ['admin']);
  const actorIsModerator = hasAnyRole({ roles: actorRoles }, ['moderator']);

  const targetIsOwner = hasAnyRole({ roles: targetRoles }, ['owner']);
  const targetIsAdmin = hasAnyRole({ roles: targetRoles }, ['admin']);

  if (actorIsAdmin) {
    return !targetIsOwner;
  }

  if (actorIsModerator) {
    return !targetIsOwner && !targetIsAdmin;
  }

  return false;
}

function canAssignRoles(actorRoles: string[], nextRoles: UserRole[]) {
  const actorIsOwner = hasAnyRole({ roles: actorRoles }, ['owner']);
  if (actorIsOwner) {
    return true;
  }

  const actorIsAdmin = hasAnyRole({ roles: actorRoles }, ['admin']);
  const actorIsModerator = hasAnyRole({ roles: actorRoles }, ['moderator']);

  if (actorIsAdmin) {
    return !nextRoles.includes('owner');
  }

  if (actorIsModerator) {
    return !nextRoles.includes('owner') && !nextRoles.includes('admin');
  }

  /* c8 ignore next -- unreachable after requireAdminRole gate ensures admin/mod/owner actor */
  /* istanbul ignore next -- unreachable after requireAdminRole gate ensures admin/mod/owner actor */
  return false;
}

async function PATCHHandler(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createRouteHandlerClient();
    const { session, user: actor } = await requireAdminRole(supabase);
    const admin = createSupabaseAdminClient();

    const { id: userId } = await context.params;
    if (!userId) {
      return fail(API_ERRORS.BAD_REQUEST, API_ERRORS.BAD_REQUEST.status);
    }

    const body = (await req.json().catch(() => null)) as {
      updates?: Record<string, unknown>;
    } | null;
    const input = body?.updates;
    if (!input || typeof input !== 'object') {
      return fail(API_ERRORS.BAD_REQUEST, API_ERRORS.BAD_REQUEST.status);
    }

    const { data: targetUser, error: targetError } = await admin
      .from('users')
      .select('id,roles')
      .eq('id', userId)
      .maybeSingle();

    if (targetError) {
      console.error('Admin user update target fetch error:', targetError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }
    if (!targetUser) {
      return fail(API_ERRORS.NOT_FOUND, API_ERRORS.NOT_FOUND.status);
    }

    const actorRoles = Array.isArray(actor.roles) ? actor.roles : [];
    const targetRoles = Array.isArray(targetUser.roles) ? targetUser.roles : [];

    if (!canManageTarget(actorRoles, targetRoles)) {
      return fail(
        {
          error: 'Insufficient permissions for this target user role.',
          code: 'FORBIDDEN_ROLE_MANAGEMENT',
        },
        403,
      );
    }

    const updates: Database['public']['Tables']['users']['Update'] = {};
    for (const [key, value] of Object.entries(input)) {
      if (!EDITABLE_KEYS.has(key)) {
        continue;
      }
      if (key === 'roles') {
        const normalizedRoles = normalizeRoles(value);
        if (!normalizedRoles) {
          return fail({ error: 'Invalid roles payload.', code: 'BAD_REQUEST' }, 400);
        }
        if (!canAssignRoles(actorRoles, normalizedRoles)) {
          return fail(
            {
              error: 'Insufficient permissions to assign one or more selected roles.',
              code: 'FORBIDDEN_ROLE_ASSIGNMENT',
            },
            403,
          );
        }
        updates.roles = normalizedRoles.includes('user')
          ? normalizedRoles
          : Array.from(new Set(['user', ...normalizedRoles]));
        continue;
      }

      // `key` is validated against EDITABLE_KEYS above but is still a plain
      // string, so this one write cannot be expressed against the row type.
      (updates as Record<string, unknown>)[key] = normalizeText(value);
    }

    if (Object.keys(updates).length === 0) {
      return fail(API_ERRORS.BAD_REQUEST, API_ERRORS.BAD_REQUEST.status);
    }

    if (userId === session.user.id && Object.prototype.hasOwnProperty.call(updates, 'roles')) {
      const nextRoles = Array.isArray(updates.roles) ? updates.roles : [];
      if (!nextRoles.includes('admin') && !nextRoles.includes('owner')) {
        return fail(
          {
            error: 'You cannot remove your own admin access from this page.',
            code: 'FORBIDDEN_SELF_DEMOTION',
          },
          403,
        );
      }
    }

    const { data, error } = await admin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select(
        'id,username,display_name,full_name,email,account_status,country,roles,created_at,updated_at,last_login',
      )
      .maybeSingle();

    if (error) {
      console.error('Admin user update error:', error);
      if (error.code === '23505') {
        return fail(
          { error: 'Duplicate value conflict (username or email).', code: 'CONFLICT' },
          409,
        );
      }
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }
    if (!data) {
      return fail(API_ERRORS.NOT_FOUND, API_ERRORS.NOT_FOUND.status);
    }

    return ok(data);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof ForbiddenError) {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin user update error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

async function DELETEHandler(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createRouteHandlerClient();
    const { session, user: actor } = await requireAdminRole(supabase);
    const admin = createSupabaseAdminClient();

    const { id: userId } = await context.params;
    if (!userId) {
      return fail(API_ERRORS.BAD_REQUEST, API_ERRORS.BAD_REQUEST.status);
    }

    if (userId === session.user.id) {
      return fail(
        { error: 'You cannot delete your own account from admin tools.', code: 'BAD_REQUEST' },
        400,
      );
    }

    const { data: targetUser, error: targetError } = await admin
      .from('users')
      .select('id,username,roles')
      .eq('id', userId)
      .maybeSingle();

    if (targetError) {
      console.error('Admin user delete target fetch error:', targetError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }
    if (!targetUser) {
      return fail(API_ERRORS.NOT_FOUND, API_ERRORS.NOT_FOUND.status);
    }

    const actorRoles = Array.isArray(actor.roles) ? actor.roles : [];
    const targetRoles = Array.isArray(targetUser.roles) ? targetUser.roles : [];
    if (!canManageTarget(actorRoles, targetRoles)) {
      return fail(
        {
          error: 'Insufficient permissions for this target user role.',
          code: 'FORBIDDEN_ROLE_MANAGEMENT',
        },
        403,
      );
    }

    const { error: deleteProfileError } = await admin.from('users').delete().eq('id', userId);
    if (deleteProfileError) {
      console.error('Admin user delete profile error:', deleteProfileError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('Admin user delete auth warning:', authDeleteError);
    }

    return ok({ id: userId, username: targetUser.username });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof ForbiddenError) {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin user delete error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const dynamic = 'force-dynamic';

export const PATCH = withApiRoute(PATCHHandler);
export const DELETE = withApiRoute(DELETEHandler);
