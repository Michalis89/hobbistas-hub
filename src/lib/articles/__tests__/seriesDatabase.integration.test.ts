/**
 * @jest-environment node
 *
 * Database integration test for 20261123_rc058_article_series.sql.
 *
 * Runs only against a LOCAL, disposable Supabase Postgres:
 *
 *   SERIES_DB_TEST_URL=postgresql://postgres:<pw>@127.0.0.1:<port>/postgres
 *   SERIES_DB_TEST_SUPERUSER_URL=postgresql://supabase_admin:<pw>@127.0.0.1:<port>/postgres  (optional)
 *
 * Skipped without SERIES_DB_TEST_URL; any non-local host is refused. It DROPS
 * and recreates public.users, public.articles and the series objects, so do
 * not point it at the same database as another suite running in parallel.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client, type QueryResult } from 'pg';

const DB_URL = process.env.SERIES_DB_TEST_URL;
const SUPERUSER_URL = process.env.SERIES_DB_TEST_SUPERUSER_URL;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to run destructive database tests against non-local host "${host}"`);
  }
}

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');
const USERS_FIXTURE = read('src/lib/users/__tests__/fixtures/users-baseline.sql');
const USERS_MIGRATION = read('supabase/migrations/20261123_rc057_users_privileged_columns.sql');
const ARTICLES_FIXTURE = read('src/lib/articles/__tests__/fixtures/series-articles-baseline.sql');
const SERIES_MIGRATION = read('supabase/migrations/20261123_rc058_article_series.sql');

// Series objects depend on public.users and is_demo_account(), which the users
// fixture recreates; drop them first so the suite can be re-run, and again at
// the end so the database is left as the users suite expects.
const SERIES_TEARDOWN = `
  drop table if exists public.article_series_chapters cascade;
  drop table if exists public.article_series_translations cascade;
  drop table if exists public.article_series cascade;
  drop function if exists public.replace_series_chapters(bigint, bigint, bigint[]);
  drop function if exists public.public_series_sitemap();
  drop function if exists public.series_is_public(bigint);
  drop function if exists public.series_can_manage(bigint);
  drop function if exists public.series_can_manage_all();
  drop function if exists public.series_can_create();
  drop table if exists public.articles cascade;
`;

const U = {
  authorA: '00000000-0000-4000-8000-00000000aa01',
  authorB: '00000000-0000-4000-8000-00000000bb02',
  moderator: '00000000-0000-4000-8000-00000000cc03',
  admin: '00000000-0000-4000-8000-00000000dd04',
  formerAuthor: '00000000-0000-4000-8000-00000000ee05',
  demoAuthor: '00000000-0000-4000-8000-00000000ff06',
  reader: '00000000-0000-4000-8000-0000000011a7',
} as const;
const ROLES: Record<keyof typeof U, string[]> = {
  authorA: ['user', 'author'],
  authorB: ['user', 'author'],
  moderator: ['user', 'moderator'],
  admin: ['user', 'admin'],
  formerAuthor: ['user'],
  demoAuthor: ['user', 'author'],
  reader: ['user'],
};

type Role = 'anon' | 'authenticated' | 'service_role' | 'postgres';
type Attempt = { ok: true; result: QueryResult } | { ok: false; code?: string; message: string };

const describeDb = DB_URL ? describe : describe.skip;

jest.setTimeout(30_000);

describeDb('article series (local database)', () => {
  let db: Client;
  /** Article ids by slug, filled in beforeAll. */
  const A: Record<string, number> = {};

  /** A transaction that is always rolled back; `as` switches role and JWT subject. */
  async function tx<T>(
    fn: (t: {
      q: (sql: string, params?: unknown[]) => Promise<QueryResult>;
      attempt: (sql: string, params?: unknown[]) => Promise<Attempt>;
      as: (role: Role, uid?: string | null) => Promise<void>;
    }) => Promise<T>,
    client: Client = db,
  ): Promise<T> {
    await client.query('begin');
    let n = 0;
    const q = (sql: string, params?: unknown[]) => client.query(sql, params);
    const as = async (role: Role, uid: string | null = null) => {
      await client.query('reset role');
      if (role !== 'postgres') {
        await client.query(`set local role ${role}`);
      }
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(uid ? { sub: uid, role } : { role }),
      ]);
    };
    const attempt = async (sql: string, params?: unknown[]): Promise<Attempt> => {
      const sp = `sp_${n++}`;
      await client.query(`savepoint ${sp}`);
      try {
        const result = await client.query(sql, params);
        await client.query(`release savepoint ${sp}`);
        return { ok: true, result };
      } catch (error) {
        await client.query(`rollback to savepoint ${sp}`);
        const e = error as { code?: string; message: string };
        return { ok: false, code: e.code, message: e.message };
      }
    };
    try {
      return await fn({ q, attempt, as });
    } finally {
      await client.query('rollback');
    }
  }

  /** Creates a series as postgres (bypassing the API) with the given chapters. */
  async function makeSeries(
    q: (sql: string, params?: unknown[]) => Promise<QueryResult>,
    opts: { slug: string; owner: string | null; status?: string; chapters?: number[] },
  ): Promise<number> {
    const { rows } = await q(
      'insert into public.article_series (slug, title, owner_id, status) values ($1, $1, $2, $3) returning id',
      [opts.slug, opts.owner, opts.status ?? 'draft'],
    );
    const id = Number(rows[0].id);
    for (const [index, articleId] of (opts.chapters ?? []).entries()) {
      await q(
        'insert into public.article_series_chapters (series_id, article_id, position) values ($1, $2, $3)',
        [id, articleId, index + 1],
      );
    }
    return id;
  }

  const replace =
    'select public.replace_series_chapters($1::bigint, $2::bigint, $3::bigint[]) as v';
  const chapterIds = async (
    q: (sql: string, params?: unknown[]) => Promise<QueryResult>,
    seriesId: number,
  ) =>
    (
      await q(
        'select article_id from public.article_series_chapters where series_id = $1 order by position',
        [seriesId],
      )
    ).rows.map(r => Number(r.article_id));

  beforeAll(async () => {
    assertLocal(DB_URL!);
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    expect((await db.query('select current_user as r')).rows[0].r).toBe('postgres');

    const { rows: col } = await db.query(
      `select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at'`,
    );
    if (col.length === 0) {
      if (!SUPERUSER_URL) {
        throw new Error(
          'auth.users.email_confirmed_at is missing; set SERIES_DB_TEST_SUPERUSER_URL',
        );
      }
      assertLocal(SUPERUSER_URL);
      const su = new Client({ connectionString: SUPERUSER_URL });
      await su.connect();
      await su.query(
        'alter table auth.users add column if not exists email_confirmed_at timestamptz',
      );
      await su.end();
    }

    await db.query('delete from auth.users where id = any($1::uuid[])', [Object.values(U)]);
    await db.query(SERIES_TEARDOWN);
    await db.query(USERS_FIXTURE);
    await db.query(USERS_MIGRATION);
    await db.query(ARTICLES_FIXTURE);
    await db.query(SERIES_MIGRATION);

    for (const [name, id] of Object.entries(U)) {
      await db.query(
        'insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
        [id, `${name}@example.test`],
      );
      await db.query('update public.users set roles = $2 where id = $1', [
        id,
        ROLES[name as keyof typeof U],
      ]);
    }
    await db.query('update public.users set is_demo = true where id = $1', [U.demoAuthor]);

    const articles: Array<[string, string, string, string | null]> = [
      ['a1', U.authorA, 'published', null],
      ['a2', U.authorA, 'published', null],
      ['a3', U.authorA, 'published', null],
      ['a-draft', U.authorA, 'draft', null],
      ['a-future', U.authorA, 'published', '2999-01-01T00:00:00Z'],
      ['b1', U.authorB, 'published', null],
      ['b2', U.authorB, 'published', null],
      ['b-draft', U.authorB, 'draft', null],
      ['former1', U.formerAuthor, 'published', null],
    ];
    for (const [slug, author, status, publishedAt] of articles) {
      const { rows } = await db.query(
        `insert into public.articles (slug, title, author_id, status, published_at)
         values ($1, $1, $2, $3, coalesce($4::timestamptz, now() - interval '1 day')) returning id`,
        [slug, author, status, publishedAt],
      );
      A[slug] = Number(rows[0].id);
    }
  });

  afterAll(async () => {
    if (db) {
      await db.query('delete from auth.users where id = any($1::uuid[])', [Object.values(U)]);
      await db.query(SERIES_TEARDOWN);
      await db.end();
    }
  });

  describe('migration', () => {
    it('is re-runnable', async () => {
      await expect(db.query(SERIES_MIGRATION)).resolves.toBeDefined();
    });

    it('gives anon no privileges on any series table', async () => {
      const { rows } = await db.query(`
        select t, has_table_privilege('anon', t, 'SELECT, INSERT, UPDATE, DELETE') as any_priv
        from unnest(array['public.article_series', 'public.article_series_translations',
                          'public.article_series_chapters']) t`);
      expect(rows.every(r => r.any_priv === false)).toBe(true);
    });

    it('lets authenticated update only the editable series columns and never write chapters', async () => {
      const { rows } = await db.query(`
        select has_column_privilege('authenticated', 'public.article_series', 'title', 'UPDATE') as title,
               has_column_privilege('authenticated', 'public.article_series', 'status', 'UPDATE') as status,
               has_column_privilege('authenticated', 'public.article_series', 'slug', 'UPDATE') as slug,
               has_column_privilege('authenticated', 'public.article_series', 'owner_id', 'UPDATE') as owner,
               has_column_privilege('authenticated', 'public.article_series', 'version', 'UPDATE') as version,
               has_table_privilege('authenticated', 'public.article_series_chapters', 'INSERT, UPDATE, DELETE') as chapter_write`);
      expect(rows[0]).toEqual({
        title: true,
        status: true,
        slug: false,
        owner: false,
        version: false,
        chapter_write: false,
      });
    });

    it('grants function EXECUTE only where needed, with pinned search_path', async () => {
      const { rows } = await db.query(`
        select p.proname,
               pg_get_userbyid(p.proowner) as owner,
               p.prosecdef,
               p.proconfig,
               has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
               has_function_privilege('service_role', p.oid, 'EXECUTE') as service,
               exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as public_exec
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname like any (array['series_%', '%series_%'])
        order by 1`);
      const byName = Object.fromEntries(rows.map(r => [r.proname, r]));
      for (const r of rows) {
        expect(r).toMatchObject({
          owner: 'postgres',
          prosecdef: true,
          proconfig: ['search_path=""'],
        });
        expect(r.anon).toBe(false);
        expect(r.public_exec).toBe(false);
      }
      expect(byName.replace_series_chapters.auth).toBe(true);
      expect(byName.series_can_manage.auth).toBe(true);
      expect(byName.series_is_public.auth).toBe(false);
      expect(byName.public_series_sitemap.auth).toBe(false);
      expect(byName.public_series_sitemap.service).toBe(true);
      expect(byName.series_is_elevated).toBeUndefined();
    });
  });

  describe('visibility (RLS)', () => {
    it('anon cannot read series, translations or chapters at all', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, {
          slug: 'pub',
          owner: U.authorA,
          status: 'published',
          chapters: [A.a1, A['a-draft']],
        });
        await q(
          "insert into public.article_series_translations values ($1, 'el', 'Δημόσιο', null)",
          [id],
        );
        await as('anon');
        for (const table of [
          'article_series',
          'article_series_translations',
          'article_series_chapters',
        ]) {
          expect(await attempt(`select * from public.${table}`)).toMatchObject({
            ok: false,
            code: '42501',
          });
        }
        expect(await attempt('select * from public.public_series_sitemap()')).toMatchObject({
          ok: false,
          code: '42501',
        });
      });
    });

    it('a signed-in reader or another author sees nothing, even of a published series', async () => {
      await tx(async ({ q, as }) => {
        const id = await makeSeries(q, {
          slug: 'pub',
          owner: U.authorA,
          status: 'published',
          chapters: [A.a1, A['a-draft']],
        });
        for (const uid of [U.reader, U.authorB]) {
          await as('authenticated', uid);
          expect(
            (await q('select * from public.article_series where id = $1', [id])).rowCount,
          ).toBe(0);
          expect(
            (await q('select * from public.article_series_chapters where series_id = $1', [id]))
              .rowCount,
          ).toBe(0);
        }
      });
    });

    it('the owner and those who manage all series see it; a demoted owner does not', async () => {
      await tx(async ({ q, as }) => {
        const own = await makeSeries(q, { slug: 'own', owner: U.authorA, chapters: [A.a1] });
        const former = await makeSeries(q, {
          slug: 'former',
          owner: U.formerAuthor,
          chapters: [A.former1],
        });
        await as('authenticated', U.authorA);
        expect(
          (await q('select id from public.article_series')).rows.map(r => Number(r.id)),
        ).toEqual([own]);
        for (const uid of [U.moderator, U.admin]) {
          await as('authenticated', uid);
          const seen = (await q('select id from public.article_series order by id')).rows.map(r =>
            Number(r.id),
          );
          expect(seen).toEqual([own, former]);
        }
        await as('authenticated', U.formerAuthor);
        expect((await q('select id from public.article_series')).rowCount).toBe(0);
        expect((await q('select * from public.article_series_chapters')).rowCount).toBe(0);
      });
    });
  });

  describe('writes through the Data API (RLS)', () => {
    it('authors and reviewers create drafts they own; others cannot', async () => {
      await tx(async ({ q, as, attempt }) => {
        const insert =
          "insert into public.article_series (slug, title, owner_id) values ($1, 'T', $2) returning id, owner_id, status";
        await as('authenticated', U.authorA);
        const created = await attempt(insert, ['mine', U.authorA]);
        expect(created.ok && created.result.rows[0]).toMatchObject({
          owner_id: U.authorA,
          status: 'draft',
        });

        expect(await attempt(insert, ['for-someone-else', U.authorB])).toMatchObject({
          ok: false,
          code: '42501',
        });
        expect(
          await attempt(
            "insert into public.article_series (slug, title, owner_id, status) values ('pub-now', 'T', $1, 'published')",
            [U.authorA],
          ),
        ).toMatchObject({ ok: false, code: '42501' });

        await q('reset role');
        await q("update public.users set roles = array['user','reviewer'] where id = $1", [
          U.reader,
        ]);
        await as('authenticated', U.reader);
        expect(await attempt(insert, ['by-reviewer', U.reader])).toMatchObject({ ok: true });

        for (const uid of [U.formerAuthor, U.moderator, U.demoAuthor]) {
          await as('authenticated', uid);
          expect(await attempt(insert, [`by-${uid.slice(-4)}`, uid])).toMatchObject({
            ok: false,
            code: '42501',
          });
        }
      });
    });

    it('the owner edits metadata; slug, owner and version stay locked', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, { slug: 'meta', owner: U.authorA });
        await as('authenticated', U.authorA);
        const ok = await attempt(
          "update public.article_series set title = 'New', status = 'published' where id = $1",
          [id],
        );
        expect(ok.ok && ok.result.rowCount).toBe(1);
        for (const set of ["slug = 'x'", `owner_id = '${U.authorB}'`, 'version = 99']) {
          expect(
            await attempt(`update public.article_series set ${set} where id = $1`, [id]),
          ).toMatchObject({ ok: false, code: '42501' });
        }
      });
    });

    it('non-managers and demoted owners cannot update, translate or delete', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, { slug: 'locked', owner: U.formerAuthor });
        for (const uid of [U.formerAuthor, U.authorB]) {
          await as('authenticated', uid);
          const upd = await attempt("update public.article_series set title = 'x' where id = $1", [
            id,
          ]);
          expect(upd.ok && upd.result.rowCount).toBe(0);
          const del = await attempt('delete from public.article_series where id = $1', [id]);
          expect(del.ok && del.result.rowCount).toBe(0);
          expect(
            await attempt(
              "insert into public.article_series_translations values ($1, 'el', 'Τίτλος', null)",
              [id],
            ),
          ).toMatchObject({ ok: false, code: '42501' });
        }
        await as('authenticated', U.moderator);
        const mod = await attempt(
          "update public.article_series set title = 'by mod' where id = $1",
          [id],
        );
        expect(mod.ok && mod.result.rowCount).toBe(1);
      });
    });

    it('the demo account cannot write even its own series', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, { slug: 'demo', owner: U.demoAuthor });
        await as('authenticated', U.demoAuthor);
        const upd = await attempt("update public.article_series set title = 'x' where id = $1", [
          id,
        ]);
        expect(upd.ok && upd.result.rowCount).toBe(0);
        expect(await attempt(replace, [id, 0, [A.a1]])).toMatchObject({ ok: false, code: '42501' });
      });
    });

    it('deleting a series keeps its articles; deleting the owner keeps the series', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, { slug: 'del', owner: U.authorA, chapters: [A.a1, A.a2] });
        await as('authenticated', U.authorA);
        const del = await attempt('delete from public.article_series where id = $1', [id]);
        expect(del.ok && del.result.rowCount).toBe(1);
        await as('postgres');
        expect(
          (
            await q('select count(*)::int as n from public.articles where id = any($1)', [
              [A.a1, A.a2],
            ])
          ).rows[0].n,
        ).toBe(2);

        const kept = await makeSeries(q, {
          slug: 'orphan',
          owner: U.formerAuthor,
          chapters: [A.former1],
        });
        await q('delete from auth.users where id = $1', [U.formerAuthor]);
        const { rows } = await q('select owner_id from public.article_series where id = $1', [
          kept,
        ]);
        expect(rows[0].owner_id).toBeNull();
        await as('authenticated', U.moderator);
        expect(await attempt(replace, [kept, 0, []])).toMatchObject({ ok: true });
      });
    });
  });

  describe('replace_series_chapters: ordering rules', () => {
    // authorA owns the series; authorB wrote b1/b2.
    const ok = { ok: true };
    const forbidden = { ok: false, code: '42501' };

    it.each([
      ['insert own before a foreign chapter', [['b1'], ['a1', 'b1']]],
      [
        'insert own between foreign chapters',
        [
          ['b1', 'b2'],
          ['b1', 'a1', 'b2'],
        ],
      ],
      ['insert own after a foreign chapter', [['b1'], ['b1', 'a1']]],
      [
        'remove own around foreign chapters',
        [
          ['a1', 'b1', 'a2'],
          ['b1', 'a2'],
        ],
      ],
      [
        'reorder own around foreign chapters',
        [
          ['a1', 'b1', 'a2'],
          ['a2', 'b1', 'a1'],
        ],
      ],
      [
        'move own across two foreign chapters',
        [
          ['a1', 'b1', 'b2'],
          ['b1', 'b2', 'a1'],
        ],
      ],
    ])('owner may %s', async (_label, [before, after]) => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, {
          slug: 's',
          owner: U.authorA,
          chapters: before.map(s => A[s]),
        });
        await as('authenticated', U.authorA);
        const res = await attempt(replace, [id, 0, after.map(s => A[s])]);
        expect(res).toMatchObject(ok);
        expect(res.ok && Number(res.result.rows[0].v)).toBe(1);
        expect(await chapterIds(q, id)).toEqual(after.map(s => A[s]));
      });
    });

    it.each([
      ['remove a foreign chapter', [['a1', 'b1'], ['a1']]],
      ['add a foreign article', [['a1'], ['a1', 'b1']]],
      [
        'swap two foreign chapters',
        [
          ['b1', 'a1', 'b2'],
          ['b2', 'a1', 'b1'],
        ],
      ],
      ['add an article whose author is gone', [['a1'], ['a1', 'former1']]],
    ])('owner may not %s', async (_label, [before, after]) => {
      await tx(async ({ q, as, attempt }) => {
        if (after.includes('former1')) {
          await q('update public.articles set author_id = null where id = $1', [A.former1]);
        }
        const id = await makeSeries(q, {
          slug: 's',
          owner: U.authorA,
          chapters: before.map(s => A[s]),
        });
        await as('authenticated', U.authorA);
        expect(await attempt(replace, [id, 0, after.map(s => A[s])])).toMatchObject(forbidden);
        expect(await chapterIds(q, id)).toEqual(before.map(s => A[s]));
      });
    });

    it('does not reveal whether an unknown article id exists to a non-elevated owner', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, { slug: 's', owner: U.authorA, chapters: [A.a1] });
        await as('authenticated', U.authorA);
        expect(await attempt(replace, [id, 0, [A.a1, 987654321]])).toMatchObject(forbidden);
        expect(await attempt(replace, [id, 0, [A.a1, A.b2]])).toMatchObject(forbidden);
      });
    });

    it('moderators and admins may add, remove and reorder any chapter', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, {
          slug: 's',
          owner: U.authorA,
          chapters: [A.b1, A.a1, A.b2],
        });
        await as('authenticated', U.moderator);
        expect(await attempt(replace, [id, 0, [A.b2, A.a1]])).toMatchObject(ok);
        await as('authenticated', U.admin);
        expect(await attempt(replace, [id, 1, [A.a1, A.b2, A.b1]])).toMatchObject(ok);
        expect(await chapterIds(q, id)).toEqual([A.a1, A.b2, A.b1]);
        expect(await attempt(replace, [id, 2, [A.a1, 987654321]])).toMatchObject({
          ok: false,
          code: '22023',
        });
      });
    });

    it('a demoted owner and another author are refused', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, { slug: 's', owner: U.formerAuthor, chapters: [A.former1] });
        await as('authenticated', U.formerAuthor);
        expect(await attempt(replace, [id, 0, []])).toMatchObject(forbidden);
        await as('authenticated', U.authorB);
        expect(await attempt(replace, [id, 0, [A.former1, A.b1]])).toMatchObject(forbidden);
        await as('anon');
        expect(await attempt(replace, [id, 0, []])).toMatchObject(forbidden);
      });
    });

    it('rejects invalid lists, unknown series and stale versions', async () => {
      await tx(async ({ q, as, attempt }) => {
        const id = await makeSeries(q, { slug: 's', owner: U.authorA, chapters: [A.a1] });
        await as('authenticated', U.authorA);
        expect(await attempt(replace, [id, 0, [A.a1, A.a1]])).toMatchObject({
          ok: false,
          code: '22023',
        });
        expect(await attempt(replace, [id, 0, [A.a1, null]])).toMatchObject({
          ok: false,
          code: '22023',
        });
        expect(await attempt(replace, [id, 0, null])).toMatchObject({ ok: false, code: '22023' });
        expect(await attempt(replace, [id, 5, [A.a1]])).toMatchObject({ ok: false, code: 'PT409' });
        // A series this caller cannot see is reported as forbidden, not missing,
        // so its existence is not revealed.
        await as('authenticated', U.admin);
        expect(await attempt(replace, [999999, 0, []])).toMatchObject(forbidden);
      });
    });

    it('refuses an article that is already in another series', async () => {
      await tx(async ({ q, as, attempt }) => {
        await makeSeries(q, { slug: 'first', owner: U.authorA, chapters: [A.a1] });
        const second = await makeSeries(q, { slug: 'second', owner: U.authorA });
        await as('authenticated', U.authorA);
        expect(await attempt(replace, [second, 0, [A.a1]])).toMatchObject({
          ok: false,
          code: '23505',
        });
      });
    });
  });

  describe('concurrency', () => {
    let other: Client;
    beforeAll(async () => {
      other = new Client({ connectionString: DB_URL });
      await other.connect();
    });
    afterAll(async () => {
      await db.query("delete from public.article_series where slug like 'conc-%'");
      await other.end();
    });

    async function asAuthor(client: Client, uid: string) {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: uid, role: 'authenticated' }),
      ]);
    }

    it('two simultaneous saves of the same series: the second gets PT409 (409)', async () => {
      const { rows } = await db.query(
        "insert into public.article_series (slug, title, owner_id) values ('conc-same', 'c', $1) returning id",
        [U.authorA],
      );
      const id = rows[0].id;
      await asAuthor(db, U.authorA);
      await asAuthor(other, U.authorA);
      const first = await db.query(replace, [id, 0, [A.a1]]);
      expect(Number(first.rows[0].v)).toBe(1);
      // Blocks on the series row lock until the first transaction commits.
      const second = other.query(replace, [id, 0, [A.a2]]);
      await new Promise(resolve => setTimeout(resolve, 300));
      await db.query('commit');
      await expect(second).rejects.toMatchObject({ code: 'PT409' });
      await other.query('rollback');
      expect(
        (await db.query('select version from public.article_series where id = $1', [id])).rows[0]
          .version,
      ).toBe('1');
      expect(await chapterIds((sql, p) => db.query(sql, p), id)).toEqual([A.a1]);
    });

    it('one article added to two series at once: the second gets 23505 (409)', async () => {
      const ids: number[] = [];
      for (const slug of ['conc-x', 'conc-y']) {
        const { rows } = await db.query(
          "insert into public.article_series (slug, title, owner_id) values ($1, 'c', $2) returning id",
          [slug, U.authorA],
        );
        ids.push(rows[0].id);
      }
      await asAuthor(db, U.authorA);
      await asAuthor(other, U.authorA);
      await db.query(replace, [ids[0], 0, [A.a3]]);
      // Passes the "already assigned" pre-check (uncommitted), then waits on the
      // unique index and fails once the first transaction commits.
      const second = other.query(replace, [ids[1], 0, [A.a3]]);
      await new Promise(resolve => setTimeout(resolve, 300));
      await db.query('commit');
      await expect(second).rejects.toMatchObject({ code: '23505' });
      await other.query('rollback');
      const { rows } = await db.query(
        'select series_id from public.article_series_chapters where article_id = $1',
        [A.a3],
      );
      expect(rows.map(r => Number(r.series_id))).toEqual([Number(ids[0])]);
    });
  });

  describe('public exposure', () => {
    it('the sitemap lists a published series only once it has a public chapter', async () => {
      await tx(async ({ q, as }) => {
        await makeSeries(q, { slug: 'draft-series', owner: U.authorA, chapters: [A.a1] });
        await makeSeries(q, {
          slug: 'only-unpublished',
          owner: U.authorA,
          status: 'published',
          chapters: [A['a-draft'], A['a-future']],
        });
        const visible = await makeSeries(q, {
          slug: 'visible',
          owner: U.authorB,
          status: 'published',
          chapters: [A['b-draft'], A.b1],
        });
        await q("insert into public.article_series_translations values ($1, 'el', 'Ορατό', null)", [
          visible,
        ]);
        await as('service_role');
        const { rows } = await q(
          'select slug, has_greek from public.public_series_sitemap() order by slug',
        );
        expect(rows).toEqual([{ slug: 'visible', has_greek: true }]);
      });
    });

    it('authenticated users cannot call the sitemap or series_is_public', async () => {
      await tx(async ({ as, attempt }) => {
        await as('authenticated', U.admin);
        expect(await attempt('select * from public.public_series_sitemap()')).toMatchObject({
          ok: false,
          code: '42501',
        });
        expect(await attempt('select public.series_is_public(1)')).toMatchObject({
          ok: false,
          code: '42501',
        });
      });
    });

    it('rejects a non-https cover image at the database level', async () => {
      await tx(async ({ q, attempt }) => {
        const id = await makeSeries(q, { slug: 'cover', owner: U.authorA });
        expect(
          await attempt(
            "update public.article_series set cover_image = 'http://x.test/a.jpg' where id = $1",
            [id],
          ),
        ).toMatchObject({ ok: false, code: '23514' });
      });
    });
  });
});
