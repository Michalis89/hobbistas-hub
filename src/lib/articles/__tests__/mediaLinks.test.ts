import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  collectArticleMediaLinks,
  fetchArticlesForMedia,
  syncArticleMediaLinks,
} from '@/lib/articles/mediaLinks';

const asClient = (client: unknown) => client as unknown as SupabaseClient<Database>;

const card = (mediaId: unknown) => ({ type: 'mediaCard', attrs: { mediaId } });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('collectArticleMediaLinks', () => {
  it('returns nothing for an article with no subject and no embeds', () => {
    expect(collectArticleMediaLinks({ contentRich: doc(), subjectMediaId: null })).toEqual([]);
  });

  it('records the subject from the article row', () => {
    expect(collectArticleMediaLinks({ contentRich: null, subjectMediaId: 53 })).toEqual([
      { media_id: 53, role: 'subject', position: 0 },
    ]);
  });

  it('records embedded cards as mentions, in reading order', () => {
    const links = collectArticleMediaLinks({
      contentRich: doc(card(10), { type: 'paragraph' }, card(11)),
      subjectMediaId: null,
    });
    expect(links).toEqual([
      { media_id: 10, role: 'mentioned', position: 0 },
      { media_id: 11, role: 'mentioned', position: 1 },
    ]);
  });

  it('finds cards nested inside other blocks', () => {
    const links = collectArticleMediaLinks({
      contentRich: doc({ type: 'blockquote', content: [card(7)] }),
      subjectMediaId: null,
    });
    expect(links.map(l => l.media_id)).toEqual([7]);
  });

  it('keeps the subject role when the subject is also embedded', () => {
    // The table allows one row per (article, media), so roles cannot both apply.
    const links = collectArticleMediaLinks({
      contentRich: doc(card(53), card(60)),
      subjectMediaId: 53,
    });
    expect(links).toEqual([
      { media_id: 53, role: 'subject', position: 0 },
      { media_id: 60, role: 'mentioned', position: 1 },
    ]);
  });

  it('de-duplicates a title embedded more than once', () => {
    const links = collectArticleMediaLinks({
      contentRich: doc(card(10), card(10), card(10)),
      subjectMediaId: null,
    });
    expect(links).toHaveLength(1);
  });

  it('accepts content stored as a JSON string', () => {
    const links = collectArticleMediaLinks({
      contentRich: JSON.stringify(doc(card(4))),
      subjectMediaId: null,
    });
    expect(links.map(l => l.media_id)).toEqual([4]);
  });

  it('ignores malformed ids and unparsable content', () => {
    expect(
      collectArticleMediaLinks({
        contentRich: doc(card(null), card('abc'), card(0), card(-3), card(1.5)),
        subjectMediaId: null,
      }),
    ).toEqual([]);
    expect(collectArticleMediaLinks({ contentRich: 'not json', subjectMediaId: null })).toEqual([]);
  });

  it('reads numeric ids stored as strings', () => {
    const links = collectArticleMediaLinks({ contentRich: doc(card('42')), subjectMediaId: null });
    expect(links.map(l => l.media_id)).toEqual([42]);
  });
});

describe('syncArticleMediaLinks', () => {
  const makeSupabase = (overrides: { deleteError?: unknown; insertError?: unknown } = {}) => {
    const eq = jest.fn().mockResolvedValue({ error: overrides.deleteError ?? null });
    const insert = jest.fn().mockResolvedValue({ error: overrides.insertError ?? null });
    const client = {
      from: jest.fn(() => ({ delete: () => ({ eq }), insert })),
    };
    return { client, spies: { eq, insert } };
  };

  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => errorSpy.mockRestore());

  it('replaces the existing links', async () => {
    const { client, spies } = makeSupabase();
    await syncArticleMediaLinks(asClient(client), 12, [
      { media_id: 53, role: 'subject', position: 0 },
    ]);

    expect(spies.eq).toHaveBeenCalledWith('article_id', 12);
    expect(spies.insert).toHaveBeenCalledWith([
      { media_id: 53, role: 'subject', position: 0, article_id: 12 },
    ]);
  });

  it('clears links without inserting when there are none left', async () => {
    const { client, spies } = makeSupabase();
    await syncArticleMediaLinks(asClient(client), 12, []);

    expect(spies.eq).toHaveBeenCalled();
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it('does not insert when clearing failed', async () => {
    const { client, spies } = makeSupabase({ deleteError: { message: 'nope' } });
    await syncArticleMediaLinks(asClient(client), 12, [
      { media_id: 1, role: 'mentioned', position: 0 },
    ]);

    expect(spies.insert).not.toHaveBeenCalled();
  });

  it('swallows write failures so the article save still succeeds', async () => {
    const { client } = makeSupabase({ insertError: { message: 'boom' } });
    await expect(
      syncArticleMediaLinks(asClient(client), 12, [
        { media_id: 1, role: 'mentioned', position: 0 },
      ]),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('fetchArticlesForMedia', () => {
  const makeSupabase = (rows: unknown, error: unknown = null) => ({
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ limit: () => Promise.resolve({ data: rows, error }) }),
        }),
      }),
    })),
  });

  const article = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    slug: `a-${id}`,
    title: `Article ${id}`,
    description: null,
    cover_image: null,
    topic: 'articles',
    published_at: '2026-01-0' + id + 'T00:00:00Z',
    status: 'published',
    ...overrides,
  });

  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('puts the article the item is about before passing mentions', async () => {
    const rows = [
      { role: 'mentioned', articles: article(1) },
      { role: 'subject', articles: article(2) },
    ];
    const result = await fetchArticlesForMedia(asClient(makeSupabase(rows)), 53);
    expect(result.map(r => r.role)).toEqual(['subject', 'mentioned']);
  });

  it('orders same-role articles newest first', async () => {
    const rows = [
      { role: 'mentioned', articles: article(1, { published_at: '2026-01-01T00:00:00Z' }) },
      { role: 'mentioned', articles: article(3, { published_at: '2026-03-01T00:00:00Z' }) },
      { role: 'mentioned', articles: article(2, { published_at: '2026-02-01T00:00:00Z' }) },
    ];
    const result = await fetchArticlesForMedia(asClient(makeSupabase(rows)), 53);
    expect(result.map(r => r.id)).toEqual([3, 2, 1]);
  });

  it('skips rows whose article did not join', async () => {
    const rows = [
      { role: 'subject', articles: null },
      { role: 'mentioned', articles: article(1) },
    ];
    const result = await fetchArticlesForMedia(asClient(makeSupabase(rows)), 53);
    expect(result.map(r => r.id)).toEqual([1]);
  });

  it('treats an unknown role as a mention', async () => {
    const rows = [{ role: 'something-else', articles: article(1) }];
    const result = await fetchArticlesForMedia(asClient(makeSupabase(rows)), 53);
    expect(result[0].role).toBe('mentioned');
  });

  it('returns an empty list instead of throwing when the query fails', async () => {
    const result = await fetchArticlesForMedia(
      asClient(makeSupabase(null, { message: 'boom' })),
      53,
    );
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });
});
