import { withApiRoute } from '@/lib/observability/withApiRoute';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, okWithMeta } from '@/lib/api/response';
import { UnauthorizedError } from '@/lib/api/auth';
import { ForbiddenError, requireAdminRole } from '@/lib/api/permissions';
import type { UserRole } from '@/types/user';
import {
  deriveUserActivityStatus,
  latestSignIn,
  toContentCounts,
  type UserActivityStatus,
  type UserContentCounts,
} from '@/lib/admin/userActivity';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const ROLE_OPTIONS: UserRole[] = ['user', 'author', 'reviewer', 'moderator', 'admin', 'owner'];

function isUserRole(value: string): value is UserRole {
  return ROLE_OPTIONS.includes(value as UserRole);
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, match => `\\${match}`);
}

async function fetchDistinctStatuses(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await admin
    .from('users')
    .select('account_status')
    .not('account_status', 'is', null)
    .limit(2000);

  if (error) {
    throw error;
  }

  return Array.from(
    new Set(
      (data ?? [])
        .map(row => row.account_status)
        .filter(
          (status): status is string => typeof status === 'string' && status.trim().length > 0,
        ),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

type UserListRow = {
  id: string;
  account_status: string | null;
  last_login: string | null;
  [key: string]: unknown;
};

export type UserActivity = {
  status: UserActivityStatus;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  content: UserContentCounts;
};

/**
 * Sign-in, email confirmation and content counts for one page of users, in
 * a single call to admin_user_overview (migration rc055). If the function is
 * missing or fails, the list still loads; rows just carry `activity: null`.
 */
async function withActivity(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: UserListRow[],
): Promise<(UserListRow & { activity: UserActivity | null })[]> {
  const ids = rows.map(row => row.id).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }

  let overview = new Map<string, Record<string, unknown>>();
  try {
    const { data, error } = await admin.rpc('admin_user_overview', { p_user_ids: ids });
    if (error) {
      throw error;
    }
    overview = new Map(
      (data ?? []).map(entry => [entry.user_id, entry as unknown as Record<string, unknown>]),
    );
  } catch (error) {
    console.warn('Admin users overview unavailable:', error);
    return rows.map(row => ({ ...row, activity: null }));
  }

  return rows.map(row => {
    const entry = overview.get(row.id);
    if (!entry) {
      return { ...row, activity: null };
    }
    const emailConfirmedAt = (entry.email_confirmed_at as string | null) ?? null;
    const lastSignInAt = latestSignIn(row.last_login, entry.last_sign_in_at as string | null);
    return {
      ...row,
      activity: {
        status: deriveUserActivityStatus({
          accountStatus: row.account_status,
          emailConfirmedAt,
          lastSignInAt,
        }),
        emailConfirmed: Boolean(emailConfirmedAt),
        lastSignInAt,
        content: toContentCounts(entry),
      },
    };
  });
}

async function GETHandler(req: Request) {
  try {
    const supabase = await createRouteHandlerClient();
    await requireAdminRole(supabase);

    const admin = createSupabaseAdminClient();
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim() ?? '';
    const role = searchParams.get('role')?.trim().toLowerCase() ?? '';
    const status = searchParams.get('status')?.trim() ?? '';
    const limit = Math.min(
      Math.max(
        Number.parseInt(searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT,
        1,
      ),
      MAX_LIMIT,
    );
    const offset = Math.max(Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);

    let request = admin
      .from('users')
      .select(
        'id,username,display_name,full_name,email,account_status,country,roles,created_at,updated_at,last_login',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (isUserRole(role)) {
      request = request.contains('roles', [role]);
    }
    if (status) {
      request = request.eq('account_status', status);
    }
    if (q) {
      const safeQuery = `%${escapeLike(q)}%`;
      request = request.or(
        `username.ilike.${safeQuery},display_name.ilike.${safeQuery},full_name.ilike.${safeQuery},email.ilike.${safeQuery}`,
      );
    }

    const [{ data, error, count }, statuses] = await Promise.all([
      request,
      fetchDistinctStatuses(admin),
    ]);

    if (error) {
      console.error('Admin users list error:', error);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    const rows = Array.isArray(data) ? (data as UserListRow[]) : [];

    return okWithMeta(await withActivity(admin, rows), {
      total: count ?? 0,
      limit,
      offset,
      filters: {
        roles: ROLE_OPTIONS,
        statuses,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof ForbiddenError) {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin users list error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const dynamic = 'force-dynamic';

export const GET = withApiRoute(GETHandler);
