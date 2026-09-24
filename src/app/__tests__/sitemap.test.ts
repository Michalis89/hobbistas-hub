const unstableCacheMock = jest.fn();
const createSupabaseAdminClientMock = jest.fn();

jest.mock('next/cache', () => ({
  unstable_cache: (...args: unknown[]) => unstableCacheMock(...args),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => createSupabaseAdminClientMock(),
}));

jest.mock('@/config/site', () => ({
  SITE_URL: 'https://hobbistas-hub.com',
}));

type QueryResult = { data: unknown[] | null; error: unknown };

function createSupabaseForArticles(
  result: QueryResult,
  translations: QueryResult = { data: [], error: null },
) {
  const order = jest.fn().mockResolvedValue(result);
  const firstOrder = jest.fn().mockReturnValue({ order });
  const or = jest.fn().mockReturnValue({ order: firstOrder });
  const eq = jest.fn().mockReturnValue({ or });
  const select = jest.fn().mockReturnValue({ eq });

  const translationsSelect = jest.fn().mockResolvedValue(translations);

  // Two tables are read now, so the mock dispatches on the table name rather
  // than returning one chain for everything.
  const from = jest.fn((table: string) =>
    table === 'article_translations' ? { select: translationsSelect } : { select },
  );

  return {
    client: { from },
    spies: { from, select, eq, or, translationsSelect },
  };
}

describe('sitemap', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    unstableCacheMock.mockImplementation((fn: () => Promise<unknown>) => fn);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('generates static URLs and current published article/review URLs only', async () => {
    const supabase = createSupabaseForArticles({
      data: [
        {
          id: 1,
          slug: 'normal-article',
          topic: 'articles',
          updated_at: '2026-08-01T00:00:00.000Z',
          published_at: '2026-07-01T00:00:00.000Z',
          created_at: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 2,
          slug: 'review-article',
          topic: 'reviews',
          updated_at: null,
          published_at: '2026-07-02T00:00:00.000Z',
          created_at: '2026-06-02T00:00:00.000Z',
        },
        {
          id: 3,
          slug: '-legacy-slug-',
          topic: 'articles',
          updated_at: null,
          published_at: null,
          created_at: '2026-06-03T00:00:00.000Z',
        },
        {
          id: 4,
          slug: '',
          topic: 'articles',
          updated_at: '2026-08-04T00:00:00.000Z',
          published_at: '2026-07-04T00:00:00.000Z',
          created_at: '2026-06-04T00:00:00.000Z',
        },
        {
          id: 5,
          slug: 'bad/path',
          topic: 'articles',
          updated_at: '2026-08-05T00:00:00.000Z',
          published_at: '2026-07-05T00:00:00.000Z',
          created_at: '2026-06-05T00:00:00.000Z',
        },
        {
          id: 6,
          slug: 'normal-article',
          topic: 'articles',
          updated_at: '2026-08-06T00:00:00.000Z',
          published_at: '2026-07-06T00:00:00.000Z',
          created_at: '2026-06-06T00:00:00.000Z',
        },
      ],
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const { default: sitemap } = await import('@/app/sitemap');
    const result = await sitemap();
    const urls = result.map(entry => entry.url);

    expect(urls).toEqual([
      'https://hobbistas-hub.com/',
      'https://hobbistas-hub.com/about',
      'https://hobbistas-hub.com/hobbies',
      'https://hobbistas-hub.com/articles',
      'https://hobbistas-hub.com/review',
      'https://hobbistas-hub.com/terms',
      'https://hobbistas-hub.com/privacy',
      'https://hobbistas-hub.com/articles/normal-article',
      'https://hobbistas-hub.com/review/review-article',
      'https://hobbistas-hub.com/articles/legacy-slug',
    ]);
    expect(urls).not.toContain('https://hobbistas-hub.com/articles/review-article');
    expect(urls.some(url => url.includes('?category=') || url.includes('?tag='))).toBe(false);
    expect(urls.some(url => url.includes('/pages/news/'))).toBe(false);

    expect(result.find(entry => entry.url.endsWith('/normal-article'))?.lastModified).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(result.find(entry => entry.url.endsWith('/review-article'))?.lastModified).toEqual(
      new Date('2026-07-02T00:00:00.000Z'),
    );
    expect(result.find(entry => entry.url.endsWith('/legacy-slug'))?.lastModified).toEqual(
      new Date('2026-06-03T00:00:00.000Z'),
    );
    expect(result.find(entry => entry.url === 'https://hobbistas-hub.com/')?.lastModified).toBeUndefined();
  });

  it('queries only published non-future content', async () => {
    const supabase = createSupabaseForArticles({ data: [], error: null });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const { default: sitemap } = await import('@/app/sitemap');
    await sitemap();

    expect(supabase.spies.from).toHaveBeenCalledWith('articles');
    expect(supabase.spies.select).toHaveBeenCalledWith(
      'id, slug, topic, updated_at, published_at, created_at',
    );
    expect(supabase.spies.eq).toHaveBeenCalledWith('status', 'published');
    expect(supabase.spies.or).toHaveBeenCalledWith(
      expect.stringMatching(/^published_at\.is\.null,published_at\.lte\./),
    );
  });

  it('throws when Supabase fails instead of returning a partial sitemap', async () => {
    const supabase = createSupabaseForArticles({
      data: null,
      error: { message: 'db down', code: 'XX000', details: 'connection refused' },
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const { default: sitemap } = await import('@/app/sitemap');

    await expect(sitemap()).rejects.toThrow('Failed to build sitemap from published articles');
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to build sitemap from Supabase articles',
      expect.objectContaining({
        message: 'db down',
        code: 'XX000',
      }),
    );
  });
  it('annotates a translated article with reciprocal hreflang alternates', async () => {
    const supabase = createSupabaseForArticles(
      {
        data: [
          {
            id: 1,
            slug: 'translated-post',
            topic: 'articles',
            updated_at: null,
            published_at: '2026-07-01T00:00:00.000Z',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [{ article_id: 1, locale: 'el', title: 'Greek title' }], error: null },
    );
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const { default: sitemap } = await import('@/app/sitemap');
    const entry = (await sitemap()).find(item => item.url.endsWith('/translated-post'));

    expect(entry?.alternates).toEqual({
      languages: {
        en: 'https://hobbistas-hub.com/articles/translated-post',
        el: 'https://hobbistas-hub.com/articles/translated-post?lang=el',
      },
    });
  });

  it('ignores a half-started translation that has no title yet', async () => {
    const supabase = createSupabaseForArticles(
      {
        data: [
          {
            id: 1,
            slug: 'draft-translation',
            topic: 'articles',
            updated_at: null,
            published_at: '2026-07-01T00:00:00.000Z',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [{ article_id: 1, locale: 'el', title: '   ' }], error: null },
    );
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const { default: sitemap } = await import('@/app/sitemap');
    const entry = (await sitemap()).find(item => item.url.endsWith('/draft-translation'));

    expect(entry?.alternates).toBeUndefined();
  });

  it('still emits the sitemap when the translations read fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = createSupabaseForArticles(
      {
        data: [
          {
            id: 1,
            slug: 'lonely-post',
            topic: 'articles',
            updated_at: null,
            published_at: '2026-07-01T00:00:00.000Z',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: null, error: { message: 'relation does not exist' } },
    );
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const { default: sitemap } = await import('@/app/sitemap');
    const urls = (await sitemap()).map(entry => entry.url);

    expect(urls).toContain('https://hobbistas-hub.com/articles/lonely-post');
    expect(warnSpy).toHaveBeenCalledWith(
      'Could not load article translations for sitemap:',
      'relation does not exist',
    );
    warnSpy.mockRestore();
  });
});
