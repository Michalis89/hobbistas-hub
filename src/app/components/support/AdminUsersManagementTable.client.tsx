'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Mail, MoreHorizontal, Pencil, Save, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectField as Select } from '@/components/ui/select-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import EmptyState from '@/components/ui/empty';
import { useLocale } from '@/context/LocaleContext';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { selectUser } from '@/store/slices/authSlice';
import { isOwner } from '@/lib/roles';
import AdminUserEmailComposer, {
  type EmailRecipient,
} from '@/app/components/support/AdminUserEmailComposer.client';
import type { UserRole } from '@/types/user';
import {
  ACCOUNT_STATUS_OPTIONS,
  DORMANT_AFTER_DAYS,
  deriveUserActivityStatus,
  type UserActivityStatus,
  type UserContentCounts,
} from '@/lib/admin/userActivity';

type UserActivity = {
  status: UserActivityStatus;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  content: UserContentCounts;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  full_name: string | null;
  email: string;
  account_status: string | null;
  country: string | null;
  roles: string[];
  created_at: string | null;
  updated_at: string | null;
  last_login: string | null;
  /** Null when the overview could not be loaded (e.g. migration rc055 not applied). */
  activity?: UserActivity | null;
};

type FiltersState = {
  q: string;
  role: string;
  status: string;
};

type MetaState = {
  total: number;
  limit: number;
  offset: number;
  filters: {
    roles: string[];
    statuses: string[];
  };
};

type EditingState = {
  display_name: string;
  full_name: string;
  account_status: string;
  roles: UserRole[];
};

const ROLE_OPTIONS: UserRole[] = ['user', 'author', 'reviewer', 'moderator', 'admin', 'owner'];
const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  author: 'Author',
  reviewer: 'Reviewer',
  moderator: 'Moderator',
  admin: 'Admin',
  owner: 'Owner',
};

const DEFAULT_LIMIT = 20;

const STATUS_LABELS: Record<UserActivityStatus, string> = {
  active: 'Active',
  dormant: 'Dormant',
  never_signed_in: 'Never signed in',
  unverified: 'Unverified email',
  suspended: 'Suspended',
  banned: 'Banned',
  deleted: 'Deleted',
};

const STATUS_HINTS: Record<UserActivityStatus, string> = {
  active: `Signed in within the last ${DORMANT_AFTER_DAYS} days.`,
  dormant: `No sign-in for more than ${DORMANT_AFTER_DAYS} days.`,
  never_signed_in: 'Confirmed the email but never signed in.',
  unverified: 'Never confirmed the email address.',
  suspended: 'Suspended by an admin: cannot sign in.',
  banned: 'Banned by an admin: cannot sign in.',
  deleted: 'Account deleted.',
};

const STATUS_VARIANTS: Record<
  UserActivityStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  dormant: 'secondary',
  never_signed_in: 'outline',
  unverified: 'outline',
  suspended: 'destructive',
  banned: 'destructive',
  deleted: 'destructive',
};

const CONTENT_LABELS: [keyof Omit<UserContentCounts, 'total'>, string][] = [
  ['library', 'Library'],
  ['diary', 'Diary'],
  ['articles', 'Articles'],
  ['comments', 'Comments'],
  ['characterSheets', 'D&D'],
];

/** "Library 120 · Diary 3", or null when the user created nothing. */
function contentSummary(content: UserContentCounts): string | null {
  const parts = CONTENT_LABELS.filter(([key]) => content[key] > 0).map(
    ([key, label]) => `${label} ${content[key]}`,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

const initialFilters: FiltersState = {
  q: '',
  role: '',
  status: '',
};

const emptyMeta: MetaState = {
  total: 0,
  limit: DEFAULT_LIMIT,
  offset: 0,
  filters: {
    roles: ROLE_OPTIONS,
    statuses: [],
  },
};

function normalizeRoleList(input: string[]): UserRole[] {
  const normalized = Array.from(
    new Set(
      input
        .map(role => role.toLowerCase())
        .filter((role): role is UserRole => ROLE_OPTIONS.includes(role as UserRole)),
    ),
  );
  return normalized.length > 0 ? normalized : ['user'];
}

function formatDate(value: string | null, locale: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString(locale);
}

/**
 * Why the row cannot be emailed, or null. A UI hint only: the email route
 * re-checks everything (and also refuses demo accounts) server-side.
 */
function emailBlockedReason(row: UserRow): string | null {
  if (row.account_status === 'deleted') {
    return 'Account deleted';
  }
  if (row.activity && !row.activity.emailConfirmed) {
    return 'Email not confirmed';
  }
  return null;
}

export default function AdminUsersManagementTable() {
  const locale = useLocale();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [meta, setMeta] = useState<MetaState>(emptyMeta);
  const [filters, setFilters] = useState<FiltersState>(initialFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [emailTarget, setEmailTarget] = useState<EmailRecipient | null>(null);
  // Only hides the action; the email route enforces owner access itself.
  const canSendEmail = isOwner(useSelector(selectUser));

  const closeEmailComposer = useCallback(() => setEmailTarget(null), []);
  const handleEmailSent = useCallback((message: string) => {
    setError(null);
    setSuccessMessage(message);
    setEmailTarget(null);
  }, []);

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / DEFAULT_LIMIT));

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', `${DEFAULT_LIMIT}`);
    params.set('offset', `${(page - 1) * DEFAULT_LIMIT}`);
    if (filters.q.trim()) {
      params.set('q', filters.q.trim());
    }
    if (filters.role.trim()) {
      params.set('role', filters.role.trim());
    }
    if (filters.status.trim()) {
      params.set('status', filters.status.trim());
    }
    return params.toString();
  }, [filters, page]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/support/users?${queryString}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to fetch users');
      }

      const nextRows = Array.isArray(payload?.data) ? (payload.data as UserRow[]) : [];
      const nextMeta = payload?.meta as MetaState | undefined;
      setRows(nextRows);
      setMeta(nextMeta ?? emptyMeta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const startEditing = (row: UserRow) => {
    setEditingId(row.id);
    setEditingState({
      display_name: row.display_name ?? '',
      full_name: row.full_name ?? '',
      account_status: row.account_status || 'active',
      roles: normalizeRoleList(row.roles),
    });
  };

  const resetEdit = () => {
    setEditingId(null);
    setEditingState(null);
  };

  const toggleRole = (role: UserRole, checked: boolean) => {
    if (!editingState) {
      return;
    }
    const nextRoles = checked
      ? Array.from(new Set([...editingState.roles, role]))
      : editingState.roles.filter(item => item !== role);
    setEditingState(prev =>
      prev
        ? {
            ...prev,
            roles: nextRoles.length > 0 ? nextRoles : ['user'],
          }
        : prev,
    );
  };

  const saveRow = async (rowId: string) => {
    if (!editingState) {
      return;
    }
    setSavingId(rowId);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/admin/support/users/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            display_name: editingState.display_name,
            full_name: editingState.full_name,
            account_status: editingState.account_status,
            roles: editingState.roles,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update user');
      }

      const updated = payload?.data as UserRow | undefined;
      if (updated) {
        // The PATCH response has no activity; keep it and re-derive the status,
        // which changes when an admin suspends, bans or restores the account.
        setRows(prev =>
          prev.map(row => {
            if (row.id !== rowId) {
              return row;
            }
            const activity = row.activity
              ? {
                  ...row.activity,
                  status: deriveUserActivityStatus({
                    accountStatus: updated.account_status,
                    emailConfirmedAt: row.activity.emailConfirmed ? 'confirmed' : null,
                    lastSignInAt: row.activity.lastSignInAt,
                  }),
                }
              : row.activity;
            return { ...updated, activity };
          }),
        );
      }
      setSuccessMessage('User updated successfully.');
      resetEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/admin/support/users/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete user');
      }

      setRows(prev => prev.filter(row => row.id !== deleteTarget.id));
      setSuccessMessage(`Deleted user "${deleteTarget.username}".`);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-foreground">User Management</CardTitle>
          <Button type="button" size="sm" variant="secondary" onClick={() => void fetchRows()}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Search</label>
            <Input
              value={filters.q}
              onChange={event => {
                setPage(1);
                setFilters(prev => ({ ...prev, q: event.target.value }));
              }}
              placeholder="Username, display name, full name, or email"
            />
          </div>
          <Select
            label="Role"
            value={filters.role}
            onChange={value => {
              setPage(1);
              setFilters(prev => ({ ...prev, role: value }));
            }}
            options={['', ...(meta.filters.roles ?? ROLE_OPTIONS)]}
            optionLabels={{
              '': 'All',
              user: 'User',
              author: 'Author',
              reviewer: 'Reviewer',
              moderator: 'Moderator',
              admin: 'Admin',
              owner: 'Owner',
            }}
            placeholder="All"
          />
          <Select
            label="Account status"
            value={filters.status}
            onChange={value => {
              setPage(1);
              setFilters(prev => ({ ...prev, status: value }));
            }}
            options={['', ...(meta.filters.statuses ?? [])]}
            optionLabels={{ '': 'All' }}
            placeholder="All"
          />
        </div>

        {error ? <ErrorAlert message={error} /> : null}
        {successMessage ? (
          <p className="text-sm font-medium text-emerald-400">{successMessage}</p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No users found" description="Try changing filters or search terms." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead className="min-w-[260px]">Roles</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const isEditing = editingId === row.id && editingState !== null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.username}</TableCell>
                      <TableCell className="min-w-[180px]">
                        {isEditing ? (
                          <Input
                            value={editingState.display_name}
                            onChange={event =>
                              setEditingState(prev =>
                                prev ? { ...prev, display_name: event.target.value } : prev,
                              )
                            }
                          />
                        ) : (
                          row.display_name || '-'
                        )}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        {isEditing ? (
                          <Input
                            value={editingState.full_name}
                            onChange={event =>
                              setEditingState(prev =>
                                prev ? { ...prev, full_name: event.target.value } : prev,
                              )
                            }
                          />
                        ) : (
                          row.full_name || '-'
                        )}
                      </TableCell>
                      <TableCell className="min-w-[220px]">{row.email}</TableCell>
                      <TableCell className="min-w-[150px]">
                        {isEditing ? (
                          <Select
                            label="Account"
                            value={editingState.account_status}
                            onChange={value =>
                              setEditingState(prev =>
                                prev ? { ...prev, account_status: value } : prev,
                              )
                            }
                            options={Array.from(
                              new Set<string>([
                                ...ACCOUNT_STATUS_OPTIONS,
                                editingState.account_status,
                              ]),
                            )}
                          />
                        ) : row.activity ? (
                          <Badge
                            variant={STATUS_VARIANTS[row.activity.status]}
                            title={[
                              STATUS_HINTS[row.activity.status],
                              `Account: ${row.account_status || 'active'}`,
                              `Email ${row.activity.emailConfirmed ? 'confirmed' : 'not confirmed'}`,
                            ].join('\n')}
                            data-testid="user-activity-status"
                          >
                            {STATUS_LABELS[row.activity.status]}
                          </Badge>
                        ) : (
                          row.account_status || '-'
                        )}
                      </TableCell>
                      <TableCell className="min-w-[170px] text-xs" data-testid="user-content">
                        {row.activity ? (
                          (contentSummary(row.activity.content) ?? (
                            <Badge variant="outline" className="text-muted-foreground">
                              No data
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        {isEditing ? (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            {ROLE_OPTIONS.map(role => (
                              <label
                                key={role}
                                className="flex items-center gap-2 text-xs text-foreground"
                              >
                                <Checkbox
                                  checked={editingState.roles.includes(role)}
                                  onCheckedChange={checked => toggleRole(role, checked === true)}
                                />
                                {ROLE_LABELS[role]}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {normalizeRoleList(row.roles).map(role => (
                              <Badge
                                key={`${row.id}-${role}`}
                                variant={role === 'owner' ? 'destructive' : 'secondary'}
                              >
                                {ROLE_LABELS[role]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(row.created_at, locale)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(row.activity?.lastSignInAt ?? row.last_login, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={resetEdit}
                                disabled={savingId === row.id}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void saveRow(row.id)}
                                disabled={savingId === row.id}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => startEditing(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(row)}
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {canSendEmail ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  aria-label={`More actions for ${row.username}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-48">
                                <DropdownMenuItem
                                  className="cursor-pointer"
                                  disabled={emailBlockedReason(row) !== null}
                                  onSelect={() =>
                                    setEmailTarget({
                                      id: row.id,
                                      username: row.username,
                                      display_name: row.display_name,
                                      email: row.email,
                                    })
                                  }
                                >
                                  <Mail />
                                  Send email
                                  {emailBlockedReason(row) ? (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {emailBlockedReason(row)}
                                    </span>
                                  ) : null}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            Total users: <span className="font-medium text-foreground">{meta.total}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={open => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {deleteTarget
                ? `This will permanently delete "${deleteTarget.username}" from users and authentication.${
                    deleteTarget.activity
                      ? ` ${
                          contentSummary(deleteTarget.activity.content)
                            ? `Their content goes with it: ${contentSummary(deleteTarget.activity.content)}.`
                            : 'They have no content.'
                        }`
                      : ''
                  } This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                void deleteUser();
              }}
              className="bg-destructive text-destructive-foreground hover:brightness-110"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canSendEmail ? (
        <AdminUserEmailComposer
          recipient={emailTarget}
          onClose={closeEmailComposer}
          onSent={handleEmailSent}
        />
      ) : null}
    </Card>
  );
}
