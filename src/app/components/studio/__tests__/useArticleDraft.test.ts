import { act, renderHook, waitFor } from '@testing-library/react';

const mockGetSession = jest.fn();
const mockSyncCookies = jest.fn();
jest.mock('@/lib/supabase-client', () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}));
jest.mock('@/lib/auth/syncCookies', () => ({
  syncCookies: (session: unknown) => mockSyncCookies(session),
}));
import {
  AUTOSAVE_DELAY_MS,
  buildArticlePayload,
  emptyDraft,
  isSaveable,
  useArticleDraft,
  type ComposerDraft,
} from '@/app/components/studio/useArticleDraft';

const makeDraft = (overrides: Partial<ComposerDraft> = {}): ComposerDraft => ({
  ...emptyDraft(),
  title: 'Spira Revisited',
  category: 'games',
  ...overrides,
});

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

const errorResponse = (body: unknown) =>
  ({ ok: false, json: async () => body }) as unknown as Response;

describe('buildArticlePayload', () => {
  it('splits tags and drops blanks', () => {
    const payload = buildArticlePayload(makeDraft({ tags: 'jrpg, , final fantasy ,' }));
    expect(payload.tags).toEqual(['jrpg', 'final fantasy']);
  });

  it('forces the reviews topic and parses the score for reviews', () => {
    const payload = buildArticlePayload(
      makeDraft({ type: 'review', topic: 'articles', score: '8.5' }),
    );
    expect(payload.topic).toBe('reviews');
    expect(payload.score).toBe(8.5);
  });

  it('keeps the chosen topic and nulls the score for articles', () => {
    const payload = buildArticlePayload(makeDraft({ type: 'article', topic: 'tutorials' }));
    expect(payload.topic).toBe('tutorials');
    expect(payload.score).toBeNull();
  });

  it('nulls empty optional fields instead of sending empty strings', () => {
    const payload = buildArticlePayload(makeDraft());
    expect(payload.description).toBeNull();
    expect(payload.cover_image).toBeNull();
    expect(payload.meta_title).toBeNull();
    expect(payload.content_html).toBeNull();
  });

  it('sanitizes content html', () => {
    const payload = buildArticlePayload(
      makeDraft({ contentHtml: '<p>real</p><script>alert(1)</script>' }),
    );
    expect(payload.content_html).toBe('<p>real</p>');
  });

  it('keeps blank paragraphs, which are how authors space their text', () => {
    const payload = buildArticlePayload(makeDraft({ contentHtml: '<p>one</p><p></p><p>two</p>' }));
    expect(payload.content_html).toBe('<p>one</p><p></p><p>two</p>');
  });

  it('treats a document of only blank paragraphs as empty', () => {
    expect(
      buildArticlePayload(makeDraft({ contentHtml: '<p></p><p></p>' })).content_html,
    ).toBeNull();
  });

  it('passes rich content through untouched', () => {
    const doc = { type: 'doc', content: [] };
    expect(buildArticlePayload(makeDraft({ contentRich: doc })).content_rich).toBe(doc);
  });
});

describe('isSaveable', () => {
  it('requires a title and a category', () => {
    expect(isSaveable(makeDraft())).toBe(true);
    expect(isSaveable(makeDraft({ title: '   ' }))).toBe(false);
    expect(isSaveable(makeDraft({ category: '' }))).toBe(false);
  });
});

describe('useArticleDraft', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const setup = (overrides: Partial<ComposerDraft> = {}, initialId: number | null = null) => {
    const onCreated = jest.fn();
    const view = renderHook(() =>
      useArticleDraft({ initial: makeDraft(overrides), initialId, onCreated }),
    );
    return { ...view, onCreated };
  };

  it('creates the article with POST on first save and reports the new id', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: { article: { id: 42 } } }));
    const { result, onCreated } = setup();

    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/articles',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onCreated).toHaveBeenCalledWith(42, { slug: null, previewPath: null });
    expect(result.current.articleId).toBe(42);
    expect(result.current.saveState).toBe('saved');
  });

  it('derives the slug from the title on create', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: { article: { id: 1 } } }));
    const { result } = setup({ title: 'Ο νέος Kratos' });

    await act(async () => {
      await result.current.save();
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.slug).toBe('o-neos-kratos');
  });

  describe('a draft started in Greek (no English title yet)', () => {
    const setupGreek = (greekTitle: string, initialId: number | null = null) => {
      const onCreated = jest.fn();
      const view = renderHook(() =>
        useArticleDraft({
          initial: makeDraft({ title: '' }),
          initialId,
          onCreated,
          getOtherLanguageTitle: () => greekTitle,
        }),
      );
      return { ...view, onCreated };
    };

    it('creates the article with an empty English title and a slug from the Greek title', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ data: { article: { id: 12, slug: 'o-neos-kratos' } } }),
      );
      const { result, onCreated } = setupGreek('Ο νέος Kratos');

      let saved = false;
      await act(async () => {
        saved = await result.current.save();
      });

      expect(saved).toBe(true);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({ title: '', slug: 'o-neos-kratos', status: 'draft' });
      expect(onCreated).toHaveBeenCalledWith(12, { slug: 'o-neos-kratos', previewPath: null });
      expect(result.current.getArticleId()).toBe(12);
    });

    it('does not save when neither language has a title', async () => {
      const { result } = setupGreek('   ');
      let saved = true;
      await act(async () => {
        saved = await result.current.save();
      });
      expect(saved).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('prefers the English title for the slug once there is one', async () => {
      fetchMock.mockResolvedValue(okResponse({ data: { article: { id: 13 } } }));
      const onCreated = jest.fn();
      const { result } = renderHook(() =>
        useArticleDraft({
          initial: makeDraft({ title: 'Kratos returns' }),
          initialId: null,
          onCreated,
          getOtherLanguageTitle: () => 'Ο νέος Kratos',
        }),
      );
      await act(async () => {
        await result.current.save();
      });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).slug).toBe('kratos-returns');
    });
  });

  it('updates with PUT once the article exists', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: { article: { id: 7 } } }));
    const { result } = setup({}, 7);

    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/articles/7',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('autosaves as a draft after the debounce and never changes status', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: { article: { id: 5 } } }));
    const { result } = setup({}, 5);

    act(() => {
      result.current.update({ title: 'Edited title' });
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.status).toBeUndefined();
  });

  it('does not autosave a draft that has no title or category', async () => {
    const { result } = setup({ title: '', category: '' });

    act(() => {
      result.current.update({ description: 'just a description' });
    });

    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debounces rapid edits into a single request', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: { article: { id: 5 } } }));
    const { result } = setup({}, 5);

    act(() => {
      result.current.update({ title: 'a' });
    });
    act(() => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100);
    });
    act(() => {
      result.current.update({ title: 'ab' });
    });

    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title).toBe('ab');
  });

  it('sends the status only on an explicit publish', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: { article: { id: 5 } } }));
    const { result } = setup({}, 5);

    await act(async () => {
      await result.current.save({ status: 'published' });
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).status).toBe('published');
    expect(result.current.draft.status).toBe('published');
  });

  it('surfaces the server error and keeps the draft dirty', async () => {
    fetchMock.mockResolvedValue(
      errorResponse({ error: 'An article with this slug already exists.' }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveState).toBe('error');
    expect(result.current.error).toBe('An article with this slug already exists.');
  });

  it('does not fire a second request while one is in flight', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          resolveFetch = resolve;
        }),
    );
    const { result } = setup({}, 5);

    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.save();
    });
    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.(okResponse({ data: { article: { id: 5 } } }));
      await first;
    });
  });
});

describe('useArticleDraft: session re-sync on 401', () => {
  let fetchMock: jest.Mock;
  const browserSession = { access_token: 'fresh-access', refresh_token: 'fresh-refresh' };
  const unauthorized = () =>
    ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized access', code: 'UNAUTHORIZED' }),
    }) as unknown as Response;
  const created = () =>
    ({
      ok: true,
      status: 201,
      json: async () => ({ data: { article: { id: 42 } } }),
    }) as unknown as Response;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetSession.mockReset().mockResolvedValue({ data: { session: browserSession } });
    mockSyncCookies.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const setup = (initialId: number | null = null) => {
    const onCreated = jest.fn();
    const view = renderHook(() => useArticleDraft({ initial: makeDraft(), initialId, onCreated }));
    return { ...view, onCreated };
  };

  it('first save: re-syncs the cookies from the browser session and retries the POST once', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(created());
    const { result, onCreated } = setup();

    await act(async () => {
      await result.current.save();
    });

    expect(mockSyncCookies).toHaveBeenCalledWith(browserSession);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/articles', 'POST'],
      ['/api/articles', 'POST'],
    ]);
    // Same payload both times.
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    expect(result.current.saveState).toBe('saved');
    expect(onCreated).toHaveBeenCalledWith(42, { slug: null, previewPath: null });
  });

  it('existing article: retries the PUT once', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response);
    const { result } = setup(7);

    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/articles/7', 'PUT'],
      ['/api/articles/7', 'PUT'],
    ]);
    expect(result.current.saveState).toBe('saved');
  });

  it('retries at most once and then shows the server error', async () => {
    fetchMock.mockResolvedValue(unauthorized());
    const { result } = setup();

    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockSyncCookies).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('error');
    expect(result.current.error).toBe('Unauthorized access');
  });

  it('does not retry when the browser has no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    fetchMock.mockResolvedValue(unauthorized());
    const { result } = setup();

    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockSyncCookies).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Unauthorized access');
  });

  it('does not retry when the server rejects the re-sync', async () => {
    mockSyncCookies.mockResolvedValue(false);
    fetchMock.mockResolvedValue(unauthorized());
    const { result } = setup();

    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('error');
  });

  it('never retries a permission refusal (403) or a validation error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Access forbidden' }),
    } as unknown as Response);
    const { result } = setup(7);

    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Access forbidden');
  });
});
