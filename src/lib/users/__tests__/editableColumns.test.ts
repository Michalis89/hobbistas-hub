/** @jest-environment node */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { USER_SELF_EDITABLE_COLUMNS, pickSelfEditableUserFields } from '../editableColumns';

const MIGRATION = path.join(
  process.cwd(),
  'supabase/migrations/20261123_rc057_users_privileged_columns.sql',
);

/** Columns in the migration's `grant update (...) on table public.users to authenticated`. */
function grantedColumns(sql: string): string[] {
  const match = sql.match(
    /grant\s+update\s*\(([^)]*)\)\s*on\s+table\s+public\.users\s+to\s+authenticated/i,
  );
  if (!match) {
    throw new Error('Column grant for public.users not found in migration');
  }
  return match[1]
    .split(',')
    .map(column => column.trim())
    .filter(Boolean);
}

describe('self-editable public.users columns', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('matches the column-level UPDATE grant in the migration exactly', () => {
    expect([...grantedColumns(sql)].sort()).toEqual([...USER_SELF_EDITABLE_COLUMNS].sort());
  });

  it('uses the same list in the post-REVOKE effective-privilege check', () => {
    const match = sql.match(/editable\s+constant\s+text\[\]\s*:=\s*array\[([^\]]*)\]/i);
    expect(match).not.toBeNull();
    const columns = match![1]
      .split(',')
      .map(column => column.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    expect([...columns].sort()).toEqual([...USER_SELF_EDITABLE_COLUMNS].sort());
  });

  it('never includes a privileged column', () => {
    const privileged = [
      'id',
      'roles',
      'account_status',
      'is_demo',
      'email',
      'email_verified',
      'username',
      'last_login',
      'created_at',
      'updated_at',
      'notification_settings',
    ];
    for (const column of privileged) {
      expect(USER_SELF_EDITABLE_COLUMNS).not.toContain(column);
    }
  });

  it('revokes table-wide INSERT and UPDATE before granting columns', () => {
    const revoke = sql.search(
      /revoke\s+insert,\s*update\s+on\s+table\s+public\.users\s+from\s+anon,\s*authenticated/i,
    );
    const grant = sql.search(/grant\s+update\s*\(/i);
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
  });

  it('pickSelfEditableUserFields drops everything else', () => {
    expect(
      pickSelfEditableUserFields({
        bio: 'hello',
        display_name: null,
        roles: ['owner'],
        account_status: 'active',
        email_verified: true,
      }),
    ).toEqual({ bio: 'hello', display_name: null });
  });
});
