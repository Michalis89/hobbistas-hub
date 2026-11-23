import 'whatwg-fetch';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArticleComposer from '../ArticleComposer.client';
import { emptyDraft, type ComposerDraft } from '../useArticleDraft';

/** Stand-in for the TipTap editor (both language tabs use it). */
function FakeRichTextEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange?: (html: string) => void;
  label?: string;
}) {
  return (
    <textarea
      aria-label={label ?? 'English body'}
      defaultValue={value}
      onChange={event => onChange?.(event.target.value)}
    />
  );
}

jest.mock('next/dynamic', () => () => FakeRichTextEditor);
jest.mock('../ComposerSidebar.client', () => () => null);
jest.mock('../RevisionHistory.client', () => () => null);
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

type Call = { url: string; method: string; body: Record<string, unknown> | null };

const PREVIEW = '/articles/o-neos-kratos?preview=signed-token';

/**
 * Routes the composer's requests. `greekStatus` / `postStatus` take one status
 * or a sequence (one per request, the last repeating); `holdPost` keeps the
 * first POST pending until `releasePost()` is called.
 */
function mockApi({
  greekStatus = 200,
  postStatus = 201,
  holdPost = false,
}: {
  greekStatus?: number | number[];
  postStatus?: number | number[];
  holdPost?: boolean;
} = {}) {
  const calls: Call[] = [];
  const next = (statuses: number | number[], index: number) =>
    Array.isArray(statuses) ? statuses[Math.min(index, statuses.length - 1)] : statuses;
  let posts = 0;
  let greekPuts = 0;
  let releasePost: () => void = () => {};
  const postHeld = holdPost
    ? new Promise<void>(resolve => {
        releasePost = resolve;
      })
    : Promise.resolve();

  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), { status });

    if (url === '/api/articles' && method === 'POST') {
      const status = next(postStatus, posts++);
      if (posts === 1) {
        await postHeld;
      }
      return status === 201
        ? json({ data: { article: { id: 42, slug: 'o-neos-kratos' }, preview_path: PREVIEW } }, 201)
        : json({ error: 'Internal server error' }, status);
    }
    if (url.endsWith('/translations') && method === 'PUT') {
      const status = next(greekStatus, greekPuts++);
      return status === 200
        ? json({ data: { message: 'ok', translation: {} } })
        : json({ error: 'Access forbidden' }, status);
    }
    if (url.startsWith('/api/articles/') && method === 'PUT') {
      return json({ data: { article: { id: 42 } } });
    }
    return json({ data: { translations: [] } });
  }) as unknown as typeof fetch;
  return Object.assign(calls, { releasePost: () => releasePost() });
}

function renderComposer(draft: Partial<ComposerDraft> = {}) {
  return render(
    <ArticleComposer
      initialDraft={{ ...emptyDraft(), category: 'games', ...draft }}
      initialId={null}
      initialSlug={null}
      previewPath={null}
      canWriteArticles
      canWriteReviews
    />,
  );
}

const greekTab = () => screen.getByRole('tab', { name: /Ελληνικά/ });
const englishTab = () => screen.getByRole('tab', { name: /English/ });
const saveDraft = () => screen.getByRole('button', { name: 'Save draft' });
const publish = () => screen.getByRole('button', { name: /Publish/ });
/** The Greek panel's title field (the English one is labelled "Article title"). */
const greekTitle = () => screen.getByLabelText('Title');

describe('ArticleComposer: both languages from the start', () => {
  let replaceState: jest.SpyInstance;
  beforeEach(() => {
    replaceState = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });
  afterEach(() => {
    replaceState.mockRestore();
  });

  it('offers the Greek tab before the article has ever been saved', () => {
    mockApi();
    renderComposer();
    expect(englishTab()).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(greekTab());
    expect(greekTab()).toHaveAttribute('aria-selected', 'true');
    expect(greekTitle()).toBeVisible();
  });

  it('keeps unsaved text in both languages while switching tabs', () => {
    mockApi();
    renderComposer();
    fireEvent.change(screen.getByLabelText('Article title'), { target: { value: 'Kratos' } });
    fireEvent.click(greekTab());
    fireEvent.change(greekTitle(), { target: { value: 'Ο νέος Kratos' } });
    fireEvent.click(englishTab());
    fireEvent.click(greekTab());

    expect(greekTitle()).toHaveValue('Ο νέος Kratos');
    expect(screen.getByLabelText('Article title')).toHaveValue('Kratos');
    expect(screen.getByLabelText('unsaved changes')).toBeInTheDocument();
  });

  it('saves a draft started in Greek: creates the article, then stores the Greek version', async () => {
    const calls = mockApi();
    renderComposer();
    fireEvent.click(greekTab());
    expect(saveDraft()).toBeDisabled();
    fireEvent.change(greekTitle(), { target: { value: 'Ο νέος Kratos' } });
    expect(saveDraft()).toBeEnabled();
    // Publishing still needs the English version.
    expect(publish()).toBeDisabled();

    fireEvent.click(saveDraft());

    await waitFor(() => expect(calls.some(c => c.url.endsWith('/translations'))).toBe(true));
    const post = calls.find(c => c.url === '/api/articles')!;
    expect(post.body).toMatchObject({ title: '', slug: 'o-neos-kratos', status: 'draft' });
    const put = calls.find(c => c.url === '/api/articles/42/translations')!;
    expect(put.body).toMatchObject({ locale: 'el', title: 'Ο νέος Kratos' });
    // Order: the translation needs the article's id.
    expect(calls.indexOf(post)).toBeLessThan(calls.indexOf(put));

    // The URL now points at the saved draft, without remounting the editor.
    expect(replaceState).toHaveBeenCalledWith(null, '', '/studio/42');
    expect(greekTitle()).toHaveValue('Ο νέος Kratos');
    await waitFor(() => expect(screen.queryByLabelText('unsaved changes')).not.toBeInTheDocument());
    // Nothing reloads the Greek version over what was just typed.
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(0);
  });

  it('says exactly what was saved when the Greek save fails, and keeps the Greek changes', async () => {
    mockApi({ greekStatus: 403 });
    renderComposer({ title: 'Kratos' });
    fireEvent.click(greekTab());
    fireEvent.change(greekTitle(), { target: { value: 'Ο νέος Kratos' } });

    fireEvent.click(saveDraft());

    expect(
      await screen.findByText(/The English version was saved, but the Greek version was not/),
    ).toBeInTheDocument();
    expect(greekTitle()).toHaveValue('Ο νέος Kratos');
    expect(screen.getByLabelText('unsaved changes')).toBeInTheDocument();
  });

  it('saves an English-only draft without touching the Greek version', async () => {
    const calls = mockApi();
    renderComposer({ title: 'Kratos' });

    fireEvent.click(saveDraft());

    await waitFor(() => expect(calls.some(c => c.url === '/api/articles')).toBe(true));
    expect(calls.some(c => c.url.endsWith('/translations'))).toBe(false);
  });

  it('after a reload, shows the stored Greek version and does not resave it unchanged', async () => {
    const calls = mockApi();
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(input), method, body: null });
      const payload =
        method === 'GET'
          ? {
              data: {
                translations: [{ locale: 'el', title: 'Αποθηκευμένος τίτλος', content_html: '' }],
              },
            }
          : { data: { article: { id: 42 } } };
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    }) as unknown as typeof fetch;

    render(
      <ArticleComposer
        initialDraft={{ ...emptyDraft(), category: 'games', title: '' }}
        initialId={42}
        initialSlug="o-neos-kratos"
        previewPath={null}
        canWriteArticles
        canWriteReviews
      />,
    );
    fireEvent.click(greekTab());
    expect(await screen.findByDisplayValue('Αποθηκευμένος τίτλος')).toBeInTheDocument();
    // A Greek-only draft can be saved again after a reload.
    await waitFor(() => expect(saveDraft()).toBeEnabled());

    fireEvent.click(saveDraft());
    await waitFor(() =>
      expect(calls.some(c => c.url === '/api/articles/42' && c.method === 'PUT')).toBe(true),
    );
    expect(calls.some(c => c.url.endsWith('/translations') && c.method === 'PUT')).toBe(false);
    expect(screen.getByText(/\/articles\/o-neos-kratos\?lang=el/)).toBeInTheDocument();
  });

  it('enables Publish only with the English title, a category and a body', () => {
    mockApi();
    renderComposer({ title: 'Kratos', contentHtml: '<p>Body</p>' });
    expect(publish()).toBeEnabled();
  });
});

describe('ArticleComposer: repeated saves, preview link and autosave wording', () => {
  let replaceState: jest.SpyInstance;
  beforeEach(() => {
    replaceState = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });
  afterEach(() => {
    replaceState.mockRestore();
  });

  const posts = (calls: Call[]) => calls.filter(c => c.url === '/api/articles');
  const greekPuts = (calls: Call[]) =>
    calls.filter(c => c.url.endsWith('/translations') && c.method === 'PUT');
  const articlePuts = (calls: Call[]) =>
    calls.filter(c => c.url === '/api/articles/42' && c.method === 'PUT');

  it('shows the Preview link right after the first save, without a reload', async () => {
    mockApi();
    renderComposer({ title: 'Kratos' });
    expect(screen.queryByRole('link', { name: /Preview/ })).not.toBeInTheDocument();

    fireEvent.click(saveDraft());

    const link = await screen.findByRole('link', { name: /Preview/ });
    expect(link).toHaveAttribute('href', PREVIEW);
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeInTheDocument();
  });

  it('retrying after the Greek save failed updates the same article and translation', async () => {
    const calls = mockApi({ greekStatus: [403, 200] });
    renderComposer({ title: 'Kratos' });
    fireEvent.click(greekTab());
    fireEvent.change(greekTitle(), { target: { value: 'Ο νέος Kratos' } });

    fireEvent.click(saveDraft());
    await screen.findByText(/the Greek version was not/);
    await waitFor(() => expect(saveDraft()).toBeEnabled());

    fireEvent.click(saveDraft());
    await waitFor(() => expect(greekPuts(calls)).toHaveLength(2));

    // One article ever created; the retry is an update of it.
    expect(posts(calls)).toHaveLength(1);
    expect(articlePuts(calls)).toHaveLength(1);
    // Both Greek writes target the same (article, locale) key, which the API
    // upserts, so there is still one Greek version.
    expect(greekPuts(calls).map(c => [c.url, c.body?.locale])).toEqual([
      ['/api/articles/42/translations', 'el'],
      ['/api/articles/42/translations', 'el'],
    ]);
    await waitFor(() =>
      expect(screen.queryByText(/the Greek version was not/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText('unsaved changes')).not.toBeInTheDocument();
  });

  it('retrying after the article save failed creates the article once, then the Greek version', async () => {
    const calls = mockApi({ postStatus: [500, 201] });
    renderComposer({ title: 'Kratos' });
    fireEvent.click(greekTab());
    fireEvent.change(greekTitle(), { target: { value: 'Ο νέος Kratos' } });

    fireEvent.click(saveDraft());
    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    // Nothing was written for Greek while the article does not exist.
    expect(greekPuts(calls)).toHaveLength(0);
    expect(replaceState).not.toHaveBeenCalled();

    fireEvent.click(saveDraft());
    await waitFor(() => expect(greekPuts(calls)).toHaveLength(1));
    expect(posts(calls)).toHaveLength(2);
    expect(greekPuts(calls)[0].url).toBe('/api/articles/42/translations');
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it('a double click on Save draft sends one create', async () => {
    const calls = mockApi({ holdPost: true });
    renderComposer({ title: 'Kratos' });

    fireEvent.click(saveDraft());
    fireEvent.click(saveDraft());
    calls.releasePost();

    await screen.findByRole('link', { name: /Preview/ });
    expect(posts(calls)).toHaveLength(1);
  });

  it('Publish during an autosave waits for it instead of being dropped or creating a second article', async () => {
    const calls = mockApi({ holdPost: true });
    renderComposer({ contentHtml: '<p>Body</p>' });
    fireEvent.change(screen.getByLabelText('Article title'), { target: { value: 'Kratos' } });

    // The autosave's create is now in flight (held).
    await waitFor(() => expect(posts(calls)).toHaveLength(1), { timeout: 4000 });

    fireEvent.click(greekTab());
    fireEvent.change(greekTitle(), { target: { value: 'Ο νέος Kratos' } });
    fireEvent.click(publish());
    calls.releasePost();

    await waitFor(() =>
      expect(articlePuts(calls).some(c => c.body?.status === 'published')).toBe(true),
    );
    expect(posts(calls)).toHaveLength(1);
    expect(greekPuts(calls)).toHaveLength(1);
  });

  it('says that autosave does not save the Greek version', async () => {
    mockApi();
    renderComposer({ title: 'Kratos' });
    expect(
      screen.getByText(/Autosave covers the English version only/, { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/autosave covers English only/)).not.toBeInTheDocument();

    fireEvent.click(greekTab());
    fireEvent.change(greekTitle(), { target: { value: 'Ο νέος Kratos' } });
    expect(screen.getByText(/Ελληνικά not saved yet: autosave covers English only/)).toBeVisible();
    expect(
      screen.getByText(/Not autosaved: this version is saved only by Save draft/),
    ).toBeVisible();

    fireEvent.click(saveDraft());
    await waitFor(() =>
      expect(screen.queryByText(/autosave covers English only/)).not.toBeInTheDocument(),
    );
  });
});
