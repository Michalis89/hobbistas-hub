/**
 * @jest-environment node
 *
 * Database integration test for 20261123_rc057_users_privileged_columns.sql.
 *
 * Runs only against a LOCAL, disposable Supabase Postgres:
 *
 *   USERS_PRIVILEGES_TEST_DB_URL=postgresql://postgres:<pw>@127.0.0.1:<port>/postgres
 *   USERS_PRIVILEGES_TEST_SUPERUSER_URL=postgresql://supabase_admin:<pw>@127.0.0.1:<port>/postgres  (optional)
 *
 * Without the first variable the suite is skipped, so the normal `npm test`
 * run never touches a database. Any host other than localhost is refused.
 *
 * It DROPS and recreates public.users (fixtures/users-baseline.sql), proves the
 * escalation exists on that baseline, applies the migration, and checks every
 * permitted and forbidden write path.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client, type QueryResult } from 'pg';
import { USER_SELF_EDITABLE_COLUMNS } from '../editableColumns';

const DB_URL = process.env.USERS_PRIVILEGES_TEST_DB_URL;
const SUPERUSER_URL = process.env.USERS_PRIVILEGES_TEST_SUPERUSER_URL;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to run destructive database tests against non-local host "${host}"`);
  }
}

const ROOT = process.cwd();
const FIXTURE = readFileSync(path.join(__dirname, 'fixtures/users-baseline.sql'), 'utf8');
const MIGRATION = readFileSync(
  path.join(ROOT, 'supabase/migrations/20261123_rc057_users_privileged_columns.sql'),
  'utf8',
);

const ID = {
  alice: '00000000-0000-4000-8000-0000000000a1',
  bob: '00000000-0000-4000-8000-0000000000b2',
  demo: '00000000-0000-4000-8000-0000000000d3',
  fresh: '00000000-0000-4000-8000-0000000000f4',
  signup: '00000000-0000-4000-8000-0000000000e5',
} as const;

type Role = 'anon' | 'authenticated' | 'service_role' | 'postgres';
type Attempt = { ok: true; result: QueryResult } | { ok: false; code?: string; message: string };

const describeDb = DB_URL ? describe : describe.skip;

jest.setTimeout(30_000);

describeDb('public.users privileged columns (local database)', () => {
  let db: Client;

  /**
   * Runs `fn` in a transaction that is always rolled back, as `role`, with the
   * JWT subject that auth.uid() reads. `attempt` wraps each statement in a
   * savepoint so a refused write can be followed by reads.
   */
  async function session<T>(
    role: Role,
    uid: string | null,
    fn: (tools: {
      attempt: (sql: string, params?: unknown[]) => Promise<Attempt>;
      query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
    }) => Promise<T>,
  ): Promise<T> {
    await db.query('begin');
    try {
      if (role !== 'postgres') {
        await db.query(`set local role ${role}`);
      }
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(uid ? { sub: uid, role } : { role }),
      ]);
      let n = 0;
      const attempt = async (sql: string, params?: unknown[]): Promise<Attempt> => {
        const sp = `sp_${n++}`;
        await db.query(`savepoint ${sp}`);
        try {
          const result = await db.query(sql, params);
          await db.query(`release savepoint ${sp}`);
          return { ok: true, result };
        } catch (error) {
          await db.query(`rollback to savepoint ${sp}`);
          const e = error as { code?: string; message: string };
          return { ok: false, code: e.code, message: e.message };
        }
      };
      return await fn({ attempt, query: (sql, params) => db.query(sql, params) });
    } finally {
      await db.query('rollback');
    }
  }

  const userRow = async (id: string) =>
    (await db.query('select * from public.users where id = $1', [id])).rows[0];

  beforeAll(async () => {
    assertLocal(DB_URL!);
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    const { rows } = await db.query('select current_user as role');
    expect(rows[0].role).toBe('postgres');

    // A bare supabase/postgres image carries the pre-GoTrue auth.users; a real
    // project's GoTrue migrations add email_confirmed_at, which the auth sync
    // triggers read. Add it the way GoTrue does (as a superuser) when missing.
    const { rows: confirmedColumn } = await db.query(
      `select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at'`,
    );
    if (confirmedColumn.length === 0) {
      if (!SUPERUSER_URL) {
        throw new Error(
          'auth.users.email_confirmed_at is missing; set USERS_PRIVILEGES_TEST_SUPERUSER_URL so the test can add it',
        );
      }
      assertLocal(SUPERUSER_URL);
      const setup = new Client({ connectionString: SUPERUSER_URL });
      await setup.connect();
      try {
        await setup.query(
          'alter table auth.users add column if not exists email_confirmed_at timestamptz',
        );
      } finally {
        await setup.end();
      }
    }

    await db.query('delete from auth.users where id = any($1::uuid[])', [Object.values(ID)]);
    await db.query(FIXTURE);
    // Seed through auth.users so handle_new_user creates the profile rows, the
    // same way signup does.
    for (const [name, id] of Object.entries(ID)) {
      if (name === 'signup') {
        continue;
      }
      await db.query(
        'insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
        [id, `${name}@example.test`],
      );
    }
    await db.query('update public.users set is_demo = true where id = $1', [ID.demo]);
  });

  afterAll(async () => {
    if (db) {
      await db.query('delete from auth.users where id = any($1::uuid[])', [Object.values(ID)]);
      await db.end();
    }
  });

  describe('baseline (before the migration) reproduces the vulnerability', () => {
    it('lets a signed-in user make themselves owner', async () => {
      await session('authenticated', ID.alice, async ({ attempt }) => {
        const res = await attempt(
          "update public.users set roles = array['owner'] where id = $1 returning roles",
          [ID.alice],
        );
        expect(res.ok).toBe(true);
        expect(res.ok && res.result.rows[0].roles).toEqual(['owner']);
      });
    });

    it('lets a suspended user lift their own suspension', async () => {
      await session('postgres', null, async ({ query }) => {
        await query("update public.users set account_status = 'suspended' where id = $1", [ID.bob]);
        await query('set local role authenticated');
        await query("select set_config('request.jwt.claim.sub', $1, true)", [ID.bob]);
        const res = await query(
          "update public.users set account_status = 'active' where id = $1 returning account_status",
          [ID.bob],
        );
        expect(res.rows[0].account_status).toBe('active');
      });
    });

    it('lets anon set anyone’s last_login through the RPC', async () => {
      await session('anon', null, async ({ attempt }) => {
        const res = await attempt('select public.update_user_last_login($1)', [ID.bob]);
        expect(res.ok).toBe(true);
      });
    });
  });

  describe('migration preconditions', () => {
    it('aborts without changing anything when a maintenance function has an untrusted owner', async () => {
      await db.query(`
        do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'hob_untrusted_owner') then
            create role hob_untrusted_owner nologin;
          end if;
        end $$;
        grant hob_untrusted_owner to postgres;
        grant create on schema public to hob_untrusted_owner;
        alter function public.handle_new_user() owner to hob_untrusted_owner;
      `);
      try {
        await expect(db.query(MIGRATION)).rejects.toThrow(/not owned by a trusted role/);
        await db.query('rollback');
        const { rows } = await db.query(
          "select has_table_privilege('authenticated', 'public.users', 'UPDATE') as still_open",
        );
        expect(rows[0].still_open).toBe(true);
      } finally {
        await db.query(`
          alter function public.handle_new_user() owner to postgres;
          revoke create on schema public from hob_untrusted_owner;
          revoke hob_untrusted_owner from postgres;
          drop role hob_untrusted_owner;
        `);
      }
    });

    // A table-level REVOKE run as postgres only removes grants postgres made.
    it('aborts when a column grant from another grantor would survive the REVOKE', async () => {
      await db.query(`
        create role hob_third_grantor nologin;
        grant hob_third_grantor to postgres;
        grant update (roles) on public.users to hob_third_grantor with grant option;
        set role hob_third_grantor;
        grant update (roles) on public.users to authenticated;
        reset role;
      `);
      try {
        await expect(db.query(MIGRATION)).rejects.toThrow(
          /privileges still present after REVOKE: .*authenticated UPDATE on roles/,
        );
        await db.query('rollback');
        const { rows } = await db.query(`
          select has_table_privilege('authenticated', 'public.users', 'UPDATE') as table_update,
                 exists (select 1 from pg_trigger
                         where tgrelid = 'public.users'::regclass
                           and tgname = 'users_guard_privileged_columns') as guard_installed`);
        expect(rows[0]).toEqual({ table_update: true, guard_installed: false });
      } finally {
        await db.query(`
          set role hob_third_grantor;
          revoke update (roles) on public.users from authenticated;
          reset role;
          revoke update (roles) on public.users from hob_third_grantor cascade;
          revoke hob_third_grantor from postgres;
          drop role hob_third_grantor;
        `);
      }
    });

    it('aborts when PUBLIC holds a privileged column grant', async () => {
      await db.query('grant update (account_status) on public.users to public');
      try {
        await expect(db.query(MIGRATION)).rejects.toThrow(
          /privileges still present after REVOKE: .*UPDATE on account_status/,
        );
        await db.query('rollback');
      } finally {
        await db.query('revoke update (account_status) on public.users from public');
      }
    });
  });

  describe('after the migration', () => {
    beforeAll(async () => {
      // Independent column-level grants made by the owner, as a manual GRANT in
      // the SQL editor would leave them. The migration must remove them.
      await db.query(`
        grant update (roles, email, account_status) on public.users to authenticated;
        grant insert (id, email, username, roles) on public.users to anon;
      `);
      await db.query(MIGRATION);
    });

    it('removed the independent column-level grants that existed before', async () => {
      const { rows } = await db.query(`
        select has_column_privilege('authenticated', 'public.users', 'roles', 'UPDATE') as roles,
               has_column_privilege('authenticated', 'public.users', 'email', 'UPDATE') as email,
               has_column_privilege('authenticated', 'public.users', 'account_status', 'UPDATE') as status,
               has_column_privilege('anon', 'public.users', 'roles', 'INSERT') as anon_insert`);
      expect(rows[0]).toEqual({ roles: false, email: false, status: false, anon_insert: false });
    });

    describe('catalog', () => {
      it('grants authenticated UPDATE on exactly the self-editable columns', async () => {
        const { rows } = await db.query(`
          select column_name from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'users'
            and grantee = 'authenticated' and privilege_type = 'UPDATE'`);
        expect(rows.map(r => r.column_name).sort()).toEqual([...USER_SELF_EDITABLE_COLUMNS].sort());
      });

      it('leaves anon and authenticated no table-level INSERT or UPDATE', async () => {
        const { rows } = await db.query(`
          select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and table_name = 'users'
            and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE')`);
        expect(rows).toEqual([]);
        const { rows: anonCols } = await db.query(`
          select column_name from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'users'
            and grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE')`);
        expect(anonCols).toEqual([]);
      });

      it('keeps the privileges the app still relies on', async () => {
        const { rows } = await db.query(`
          select has_table_privilege('authenticated', 'public.users', 'SELECT') as auth_select,
                 has_table_privilege('authenticated', 'public.users', 'DELETE') as auth_delete,
                 has_table_privilege('service_role', 'public.users', 'INSERT, UPDATE, DELETE') as service_write`);
        expect(rows[0]).toEqual({ auth_select: true, auth_delete: true, service_write: true });
      });

      it('installs the guard as an enabled, non-callable SECURITY INVOKER trigger', async () => {
        const { rows } = await db.query(`
          select t.tgenabled, p.prosecdef, p.proconfig,
                 has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
          from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = 'public.users'::regclass and t.tgname = 'users_guard_privileged_columns'`);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          tgenabled: 'O',
          prosecdef: false,
          proconfig: ['search_path=""'],
          anon_exec: false,
          auth_exec: false,
        });
      });

      it('update_user_last_login is owned by postgres, pinned, and not executable by anon or PUBLIC', async () => {
        const { rows } = await db.query(`
          select pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig,
                 has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
                 exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as public_exec
          from pg_proc p where p.oid = 'public.update_user_last_login(uuid)'::regprocedure`);
        expect(rows[0]).toEqual({
          owner: 'postgres',
          prosecdef: true,
          proconfig: ['search_path=""'],
          anon_exec: false,
          auth_exec: true,
          public_exec: false,
        });
      });

      it('the SECURITY DEFINER maintenance functions are owned by a trusted role', async () => {
        const { rows } = await db.query(`
          select p.proname, pg_get_userbyid(p.proowner) as owner from pg_proc p
          where p.pronamespace = 'public'::regnamespace
            and p.proname in ('handle_new_user', 'handle_user_email_verified', 'update_user_last_login')
          order by 1`);
        expect(rows).toEqual([
          { proname: 'handle_new_user', owner: 'postgres' },
          { proname: 'handle_user_email_verified', owner: 'postgres' },
          { proname: 'update_user_last_login', owner: 'postgres' },
        ]);
      });

      it('is re-runnable', async () => {
        await expect(db.query(MIGRATION)).resolves.toBeDefined();
      });
    });

    describe('signed-in user, own row: permitted', () => {
      const values: Record<(typeof USER_SELF_EDITABLE_COLUMNS)[number], unknown> = {
        full_name: 'Alice Example',
        display_name: 'Alice',
        bio: 'Hello',
        avatar_url: 'https://example.test/a.png',
        date_of_birth: '1990-01-02',
        country: 'GR',
        timezone: 'Europe/Athens',
        language_preference: 'el',
        location_city: 'Athens',
        privacy_settings: JSON.stringify({ profile_visibility: 'public', show_email: false }),
        social_links: JSON.stringify({ website: 'https://example.test' }),
      };

      it.each(USER_SELF_EDITABLE_COLUMNS)('updates %s', async column => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const res = await attempt(`update public.users set ${column} = $1 where id = $2`, [
            values[column],
            ID.alice,
          ]);
          expect(res).toMatchObject({ ok: true });
          expect(res.ok && res.result.rowCount).toBe(1);
        });
      });

      it('saves the full profile-editor payload and reads it back (update + select)', async () => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const columns = USER_SELF_EDITABLE_COLUMNS.filter(c => c !== 'location_city');
          const set = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
          const res = await attempt(
            `update public.users set ${set} where id = $${columns.length + 1} returning *`,
            [...columns.map(c => values[c]), ID.alice],
          );
          expect(res.ok).toBe(true);
          expect(res.ok && res.result.rows[0]).toMatchObject({ bio: 'Hello', roles: ['user'] });
        });
      });

      it('saves the city (/api/me/location)', async () => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const res = await attempt(
            'update public.users set location_city = $1 where id = $2 returning location_city',
            ['Thessaloniki', ID.alice],
          );
          expect(res.ok && res.result.rows[0].location_city).toBe('Thessaloniki');
        });
      });

      it('records last_login for itself through the RPC, and only for itself', async () => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const before = await userRow(ID.bob);
          expect(
            await attempt('select public.update_user_last_login($1)', [ID.alice]),
          ).toMatchObject({ ok: true });
          expect(await attempt('select public.update_user_last_login($1)', [ID.bob])).toMatchObject(
            {
              ok: true,
            },
          );
          expect((await userRow(ID.alice)).last_login).not.toBeNull();
          expect((await userRow(ID.bob)).last_login).toEqual(before.last_login);
        });
      });

      it('can still delete its own account row', async () => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const res = await attempt('delete from public.users where id = $1', [ID.alice]);
          expect(res.ok && res.result.rowCount).toBe(1);
        });
      });
    });

    describe('signed-in user: forbidden', () => {
      const forbidden: Array<[string, string, unknown]> = [
        ['roles -> owner', 'roles', ['owner']],
        ['roles -> admin', 'roles', ['user', 'admin']],
        ['roles -> author', 'roles', ['user', 'author']],
        ['account_status', 'account_status', 'banned'],
        ['is_demo', 'is_demo', true],
        ['email', 'email', 'victim@example.test'],
        ['email_verified', 'email_verified', false],
        ['username', 'username', 'renamed'],
        ['last_login', 'last_login', '2000-01-01T00:00:00Z'],
        ['created_at', 'created_at', '2000-01-01T00:00:00Z'],
        ['notification_settings', 'notification_settings', '{}'],
        ['id', 'id', ID.fresh],
      ];

      it.each(forbidden)('refuses %s', async (_label, column, value) => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const res = await attempt(`update public.users set ${column} = $1 where id = $2`, [
            value,
            ID.alice,
          ]);
          expect(res).toMatchObject({ ok: false, code: '42501' });
        });
      });

      it('refuses a mixed payload as a whole', async () => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const before = await userRow(ID.alice);
          const res = await attempt(
            "update public.users set bio = 'changed', roles = array['owner'] where id = $1",
            [ID.alice],
          );
          expect(res).toMatchObject({ ok: false, code: '42501' });
          const after = await userRow(ID.alice);
          expect(after.bio).toEqual(before.bio);
          expect(after.roles).toEqual(['user']);
        });
      });

      it('refuses a suspended user lifting their own suspension', async () => {
        await session('postgres', null, async ({ query, attempt }) => {
          await query("update public.users set account_status = 'suspended' where id = $1", [
            ID.bob,
          ]);
          await query('set local role authenticated');
          await query("select set_config('request.jwt.claim.sub', $1, true)", [ID.bob]);
          const res = await attempt(
            "update public.users set account_status = 'active' where id = $1",
            [ID.bob],
          );
          expect(res).toMatchObject({ ok: false, code: '42501' });
        });
      });

      it("cannot touch another user's row even through a permitted column", async () => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const res = await attempt("update public.users set bio = 'pwned' where id = $1", [
            ID.bob,
          ]);
          expect(res.ok && res.result.rowCount).toBe(0);
          expect((await userRow(ID.bob)).bio).not.toBe('pwned');
        });
      });

      it('cannot INSERT a users row', async () => {
        await session('authenticated', ID.fresh, async ({ attempt, query }) => {
          await query('reset role');
          await query('delete from public.users where id = $1', [ID.fresh]);
          await query('set local role authenticated');
          const res = await attempt(
            "insert into public.users (id, email, username) values ($1, 'fresh@example.test', 'fresh')",
            [ID.fresh],
          );
          expect(res).toMatchObject({ ok: false, code: '42501' });
        });
      });

      it('cannot delete its row and re-create it as owner', async () => {
        await session('authenticated', ID.alice, async ({ attempt }) => {
          const del = await attempt('delete from public.users where id = $1', [ID.alice]);
          expect(del.ok && del.result.rowCount).toBe(1);
          const res = await attempt(
            "insert into public.users (id, email, username, roles) values ($1, 'alice@example.test', 'alice2', array['owner'])",
            [ID.alice],
          );
          expect(res).toMatchObject({ ok: false, code: '42501' });
        });
      });

      it('demo account still cannot write', async () => {
        await session('authenticated', ID.demo, async ({ attempt }) => {
          const res = await attempt("update public.users set bio = 'demo edit' where id = $1", [
            ID.demo,
          ]);
          expect(res.ok && res.result.rowCount).toBe(0);
          expect((await userRow(ID.demo)).bio).toBeNull();
        });
      });
    });

    describe('anon: forbidden', () => {
      it('cannot UPDATE any column', async () => {
        await session('anon', null, async ({ attempt }) => {
          expect(
            await attempt("update public.users set bio = 'x' where id = $1", [ID.alice]),
          ).toMatchObject({ ok: false, code: '42501' });
          expect(
            await attempt("update public.users set roles = array['owner'] where id = $1", [
              ID.alice,
            ]),
          ).toMatchObject({ ok: false, code: '42501' });
        });
      });

      it('cannot INSERT', async () => {
        await session('anon', null, async ({ attempt }) => {
          expect(
            await attempt(
              "insert into public.users (id, email, username) values ($1, 'x@example.test', 'x')",
              [ID.fresh],
            ),
          ).toMatchObject({ ok: false, code: '42501' });
        });
      });

      it('cannot execute update_user_last_login', async () => {
        await session('anon', null, async ({ attempt }) => {
          expect(await attempt('select public.update_user_last_login($1)', [ID.bob])).toMatchObject(
            { ok: false, code: '42501' },
          );
        });
      });
    });

    describe('server-side paths keep working', () => {
      it('admin user management (service role) changes roles and account_status', async () => {
        await session('service_role', null, async ({ attempt }) => {
          const res = await attempt(
            "update public.users set roles = array['user','author'], account_status = 'suspended', display_name = 'A' where id = $1 returning roles, account_status",
            [ID.alice],
          );
          expect(res.ok && res.result.rows[0]).toEqual({
            roles: ['user', 'author'],
            account_status: 'suspended',
          });
        });
      });

      it('login profile fallback (service role upsert) inserts a missing row and updates an existing one', async () => {
        const upsert = `
          insert into public.users (id, email, username, display_name, full_name)
          values ($1, $2, $3, $4, $5)
          on conflict (id) do update set email = excluded.email, username = excluded.username,
            display_name = excluded.display_name, full_name = excluded.full_name
          returning id, roles, account_status`;
        await session('service_role', null, async ({ attempt, query }) => {
          await query('delete from public.users where id = $1', [ID.fresh]);
          const inserted = await attempt(upsert, [
            ID.fresh,
            'fresh@example.test',
            'user_fresh',
            'user_fresh',
            null,
          ]);
          expect(inserted.ok && inserted.result.rows[0]).toEqual({
            id: ID.fresh,
            roles: ['user'],
            account_status: 'active',
          });
          const updated = await attempt(upsert, [
            ID.fresh,
            'fresh@example.test',
            'user_fresh2',
            'Fresh',
            'Fresh User',
          ]);
          expect(updated.ok).toBe(true);
        });
      });

      it('signup profile upsert and email confirmation (service role)', async () => {
        await session('service_role', null, async ({ attempt }) => {
          const signup = await attempt(
            `insert into public.users (id, email, username, full_name, display_name, date_of_birth,
               country, bio, email_verified, privacy_settings)
             values ($1, 'bob@example.test', 'bob_s', 'Bob', 'Bob', '1990-01-01', 'GR', null, false,
               '{"legal_acceptance":{"terms":true}}')
             on conflict (id) do update set email = excluded.email, username = excluded.username,
               full_name = excluded.full_name, display_name = excluded.display_name,
               date_of_birth = excluded.date_of_birth, country = excluded.country, bio = excluded.bio,
               email_verified = excluded.email_verified, privacy_settings = excluded.privacy_settings`,
            [ID.bob],
          );
          expect(signup).toMatchObject({ ok: true });
          const confirm = await attempt(
            'update public.users set email_verified = true where id = $1',
            [ID.bob],
          );
          expect(confirm.ok && confirm.result.rowCount).toBe(1);
        });
      });

      it('postgres (migrations, SQL editor) can still change roles', async () => {
        await session('postgres', null, async ({ attempt }) => {
          expect(
            await attempt("update public.users set roles = array['user','admin'] where id = $1", [
              ID.alice,
            ]),
          ).toMatchObject({ ok: true });
        });
      });
    });

    describe('defence in depth: the trigger holds even if grants are widened again', () => {
      it('refuses privileged UPDATE and INSERT by authenticated after a table-wide re-grant', async () => {
        await session('postgres', null, async ({ query, attempt }) => {
          await query('grant insert, update on public.users to authenticated');
          await query('delete from public.users where id = $1', [ID.fresh]);
          await query('set local role authenticated');
          await query("select set_config('request.jwt.claim.sub', $1, true)", [ID.alice]);

          const escalate = await attempt(
            "update public.users set roles = array['owner'] where id = $1",
            [ID.alice],
          );
          expect(escalate).toMatchObject({ ok: false, code: '42501' });
          expect(!escalate.ok && escalate.message).toMatch(
            /privileged columns cannot be changed by role authenticated/,
          );
          expect(
            await attempt("update public.users set bio = 'still fine' where id = $1", [ID.alice]),
          ).toMatchObject({ ok: true });

          await query("select set_config('request.jwt.claim.sub', $1, true)", [ID.fresh]);
          const insertOwner = await attempt(
            "insert into public.users (id, email, username, roles) values ($1, 'f@example.test', 'f', array['owner'])",
            [ID.fresh],
          );
          expect(insertOwner).toMatchObject({ ok: false, code: '42501' });
          const insertVerified = await attempt(
            "insert into public.users (id, email, username, email_verified) values ($1, 'f@example.test', 'f', true)",
            [ID.fresh],
          );
          expect(insertVerified).toMatchObject({ ok: false, code: '42501' });
          const insertPlain = await attempt(
            "insert into public.users (id, email, username) values ($1, 'f@example.test', 'f')",
            [ID.fresh],
          );
          expect(insertPlain).toMatchObject({ ok: true });
        });
      });

      it('does not trust roles outside the allowlist', async () => {
        await session('postgres', null, async ({ query, attempt }) => {
          await query(`
            create role hob_untrusted_writer nologin;
            grant hob_untrusted_writer to postgres;
            grant usage on schema public to hob_untrusted_writer;
            grant select, update on public.users to hob_untrusted_writer;
            set local role hob_untrusted_writer`);
          // A JWT subject so the own-row RLS policy lets the row reach the trigger.
          await query("select set_config('request.jwt.claim.sub', $1, true)", [ID.alice]);
          const res = await attempt(
            "update public.users set roles = array['owner'] where id = $1",
            [ID.alice],
          );
          expect(res).toMatchObject({ ok: false, code: '42501' });
          expect(!res.ok && res.message).toMatch(/by role hob_untrusted_writer/);
        });
      });
    });

    (SUPERUSER_URL ? describe : describe.skip)('auth (GoTrue) triggers', () => {
      let su: Client;
      beforeAll(async () => {
        assertLocal(SUPERUSER_URL!);
        su = new Client({ connectionString: SUPERUSER_URL });
        await su.connect();
      });
      afterAll(async () => {
        await su?.end();
      });

      it('signup and email confirmation still populate public.users when run as supabase_auth_admin', async () => {
        await su.query('begin');
        try {
          await su.query('set local role supabase_auth_admin');
          await su.query("insert into auth.users (id, email) values ($1, 'signup@example.test')", [
            ID.signup,
          ]);
          // supabase_auth_admin has no SELECT on public.users; read as the superuser.
          await su.query('reset role');
          const created = await su.query(
            'select roles, email_verified from public.users where id = $1',
            [ID.signup],
          );
          expect(created.rows[0]).toEqual({ roles: ['user'], email_verified: false });

          await su.query('set local role supabase_auth_admin');
          await su.query('update auth.users set email_confirmed_at = now() where id = $1', [
            ID.signup,
          ]);
          await su.query('reset role');
          const confirmed = await su.query(
            'select email_verified from public.users where id = $1',
            [ID.signup],
          );
          expect(confirmed.rows[0].email_verified).toBe(true);

          // A confirmed-at-creation signup (e.g. OAuth) inserts email_verified = true.
          await su.query('set local role supabase_auth_admin');
          await su.query(
            "insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-4000-8000-0000000000e6', 'oauth@example.test', now())",
          );
          await su.query('reset role');
          const oauth = await su.query(
            "select email_verified from public.users where id = '00000000-0000-4000-8000-0000000000e6'",
          );
          expect(oauth.rows[0].email_verified).toBe(true);
        } finally {
          await su.query('rollback');
        }
      });

      it('supabase_auth_admin itself cannot change privileged columns directly', async () => {
        await su.query('begin');
        try {
          await su.query('set local role supabase_auth_admin');
          await expect(
            su.query("update public.users set roles = array['owner'] where id = $1", [ID.alice]),
          ).rejects.toMatchObject({ code: '42501' });
        } finally {
          await su.query('rollback');
        }
      });
    });
  });
});
