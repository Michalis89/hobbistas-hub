import 'whatwg-fetch';
import { createRef, useEffect, type RefObject } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArticleTranslationEditor, {
  UNSAVED_TRANSLATION_MESSAGE,
  type ArticleTranslationEditorHandle,
  type TranslationPanelState,
} from '../ArticleTranslationEditor.client';

/**
 * Stand-in for the TipTap editor. Like the real one, it reports an update on
 * mount that the author did not make (TipTap re-serialises the loaded HTML).
 */
function FakeRichTextEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange?: (html: string) => void;
  label: string;
}) {
  useEffect(() => {
    if (value) {
      onChange?.(`${value}<!-- normalised -->`);
    }
    // Mount only, like TipTap's initial setContent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <textarea
      aria-label={label}
      defaultValue={value}
      onChange={event => onChange?.(event.target.value)}
    />
  );
}

jest.mock('next/dynamic', () => () => FakeRichTextEditor);

const source = {
  title: 'English title',
  description: 'English standfirst',
  meta_title: 'English meta title',
  meta_description: 'English meta description',
};

const savedGreek = {
  locale: 'el',
  title: 'Ελληνικός τίτλος',
  description: 'Ελληνική περίληψη',
  content_html: '<p>Σώμα</p>',
  content_rich: null,
  meta_title: null,
  meta_description: null,
};

type Call = { url: string; method: string; body: unknown };

function mockFetch(rows: unknown[] = [savedGreek]) {
  const calls: Call[] = [];
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({
      url: String(input),
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    const payload =
      method === 'GET'
        ? { data: { translations: rows } }
        : { data: { message: 'ok', translation: {} } };
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  }) as unknown as typeof fetch;
  return calls;
}

let handle: RefObject<ArticleTranslationEditorHandle | null>;
let states: TranslationPanelState[];

function panelProps(articleId: number | null) {
  return {
    ref: handle,
    articleId,
    locale: 'el' as const,
    mediaCategory: 'games' as const,
    source,
    slug: 'lore',
    basePath: '/articles',
    onStateChange: (state: TranslationPanelState) => states.push(state),
  };
}

function renderEditor(articleId: number | null = 5) {
  handle = createRef<ArticleTranslationEditorHandle>();
  states = [];
  return render(<ArticleTranslationEditor {...panelProps(articleId)} />);
}

/** Waits for the panel's fields (after any stored version has loaded). */
async function open() {
  await screen.findByLabelText('Meta title');
}

const isDirtyNow = () => handle.current!.isDirty();
const lastState = () => states[states.length - 1];

async function saveTo(id: number) {
  let result: unknown;
  await act(async () => {
    result = await handle.current!.save(id);
  });
  return result;
}

/** Whether leaving the page right now would be blocked. */
function unloadIsBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('ArticleTranslationEditor: unsaved changes', () => {
  it('does not report TipTap normalising the loaded body as an unsaved change', async () => {
    mockFetch();
    renderEditor();
    await open();
    await waitFor(() => expect(lastState()).toMatchObject({ exists: true }));
    expect(isDirtyNow()).toBe(false);
    expect(lastState()).toMatchObject({ title: 'Ελληνικός τίτλος', dirty: false });
    expect(unloadIsBlocked()).toBe(false);
  });

  it('blocks leaving after an edit, and clears once saved', async () => {
    const calls = mockFetch();
    renderEditor();
    await open();

    fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: 'Ελληνικό meta' } });
    await waitFor(() => expect(isDirtyNow()).toBe(true));
    expect(lastState().dirty).toBe(true);
    expect(unloadIsBlocked()).toBe(true);

    expect(await saveTo(5)).toEqual({ ok: true });
    await waitFor(() => expect(isDirtyNow()).toBe(false));
    expect(unloadIsBlocked()).toBe(false);
    expect(screen.getByText('Ελληνικά saved')).toBeInTheDocument();
    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.url).toBe('/api/articles/5/translations');
    expect(put.body).toMatchObject({
      locale: 'el',
      title: 'Ελληνικός τίτλος',
      meta_title: 'Ελληνικό meta',
    });
  });

  it('counts a typed body change once the author interacts with the editor', async () => {
    mockFetch();
    renderEditor();
    await open();
    const body = screen.getByLabelText('Body');
    fireEvent.keyDown(body, { key: 'a' });
    fireEvent.change(body, { target: { value: '<p>Νέο σώμα</p>' } });
    await waitFor(() => expect(isDirtyNow()).toBe(true));
  });

  it('keeps unsaved edits while hidden behind another language tab, without refetching', async () => {
    const calls = mockFetch();
    const view = renderEditor();
    await open();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Αλλαγμένος' } });

    view.rerender(<ArticleTranslationEditor {...panelProps(5)} active={false} />);
    expect(view.container.querySelector('section[lang="el"]')).toHaveAttribute('hidden');
    view.rerender(<ArticleTranslationEditor {...panelProps(5)} active />);

    expect(screen.getByLabelText('Title')).toHaveValue('Αλλαγμένος');
    expect(isDirtyNow()).toBe(true);
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(1);
  });

  describe('in-app links', () => {
    let link: HTMLAnchorElement;
    beforeEach(() => {
      link = document.createElement('a');
      link.href = '/studio';
      link.textContent = 'Studio';
      document.body.appendChild(link);
    });
    afterEach(() => {
      link.remove();
      jest.restoreAllMocks();
    });

    it('asks before following a link while there are unsaved changes', async () => {
      mockFetch();
      renderEditor();
      await open();
      fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: 'x' } });

      const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
      const stayed = !fireEvent.click(link);
      expect(confirm).toHaveBeenCalledWith(UNSAVED_TRANSLATION_MESSAGE);
      expect(stayed).toBe(true);

      confirm.mockReturnValue(true);
      const left = fireEvent.click(link);
      expect(left).toBe(true);
      // Chose to leave: the unload prompt does not ask a second time.
      expect(unloadIsBlocked()).toBe(false);
    });

    it('does not ask when nothing is unsaved', async () => {
      mockFetch();
      renderEditor();
      await open();
      const confirm = jest.spyOn(window, 'confirm');
      fireEvent.click(link);
      expect(confirm).not.toHaveBeenCalled();
    });
  });
});

describe('ArticleTranslationEditor: before the article exists (Greek-first drafts)', () => {
  it('is editable immediately and does not try to load anything', async () => {
    const calls = mockFetch();
    renderEditor(null);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ο πρώτος μου τίτλος' } });
    await waitFor(() =>
      expect(lastState()).toMatchObject({
        title: 'Ο πρώτος μου τίτλος',
        dirty: true,
        exists: false,
      }),
    );
    expect(handle.current!.getTitle()).toBe('Ο πρώτος μου τίτλος');
    expect(calls).toHaveLength(0);
  });

  it('keeps what is being typed when the article gets its id (no reload over it)', async () => {
    const calls = mockFetch([]);
    const view = renderEditor(null);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Τίτλος' } });

    view.rerender(<ArticleTranslationEditor {...panelProps(42)} />);

    expect(screen.getByLabelText('Title')).toHaveValue('Τίτλος');
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(0);
  });

  it('saves to the article id it is given', async () => {
    const calls = mockFetch([]);
    renderEditor(null);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Τίτλος' } });

    expect(await saveTo(42)).toEqual({ ok: true });

    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.url).toBe('/api/articles/42/translations');
    expect(put.body).toMatchObject({ locale: 'el', title: 'Τίτλος' });
    await waitFor(() => expect(lastState()).toMatchObject({ dirty: false, exists: true }));
  });

  it('refuses to save without a Greek title, says why, and sends nothing', async () => {
    const calls = mockFetch([]);
    renderEditor(null);
    fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: 'meta' } });

    expect(await saveTo(42)).toEqual({
      ok: false,
      error: expect.stringContaining('needs a title'),
    });
    expect(calls).toHaveLength(0);
    expect(screen.getByText(/needs a title before it can be saved/)).toBeInTheDocument();
    expect(isDirtyNow()).toBe(true);
  });

  it('reports a server failure and keeps the changes', async () => {
    renderEditor(null);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Τίτλος' } });
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Access forbidden' }), { status: 403 })),
    ) as unknown as typeof fetch;

    expect(await saveTo(42)).toEqual({ ok: false, error: 'Access forbidden' });
    expect(isDirtyNow()).toBe(true);
    expect(screen.getByLabelText('Title')).toHaveValue('Τίτλος');
  });
});

describe('ArticleTranslationEditor: Greek SEO preview', () => {
  it('shows the Greek title and standfirst ahead of the English meta fields', async () => {
    mockFetch();
    renderEditor();
    await open();
    expect(screen.getByText('Ελληνικός τίτλος', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Ελληνική περίληψη', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/\/articles\/lore\?lang=el/)).toBeInTheDocument();
    expect(
      screen.getByText(/Title from: Greek title\. Description from: Greek standfirst\./),
    ).toBeInTheDocument();
  });

  it('follows the Greek meta fields as they are typed', async () => {
    mockFetch();
    renderEditor();
    await open();
    fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: 'Ελληνικό meta' } });
    expect(screen.getByText('Ελληνικό meta', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Title from: Greek meta title\./)).toBeInTheDocument();
  });

  it('shows the English fallback, and says so, where Greek fields are empty', async () => {
    mockFetch([{ ...savedGreek, description: null }]);
    renderEditor();
    await open();
    expect(screen.getByText('English meta description', { selector: 'p' })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Description from: English meta description\. Falls back to English where the Greek fields are empty\./,
      ),
    ).toBeInTheDocument();
  });
});

describe('ArticleTranslationEditor: saving and removing exclude each other', () => {
  /** Fetch whose `method` requests stay pending until released. */
  function holdFetch(method: 'PUT' | 'DELETE') {
    const calls: Call[] = [];
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      calls.push({ url: String(input), method: m, body: null });
      if (m === method) {
        await held;
      }
      const payload = m === 'GET' ? { data: { translations: [savedGreek] } } : { data: {} };
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, release: () => release() };
  }

  const removeButton = () => screen.getByRole('button', { name: /Remove Ελληνικά version/ });

  it('disables Remove while the Greek version is being saved', async () => {
    const { calls, release } = holdFetch('PUT');
    renderEditor();
    await open();
    fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: 'meta' } });

    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = handle.current!.save(5);
    });
    await waitFor(() => expect(removeButton()).toBeDisabled());
    fireEvent.click(removeButton());

    await act(async () => {
      release();
      await saving;
    });
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
    expect(removeButton()).toBeEnabled();
  });

  it('refuses to save while the Greek version is being removed, so it is not brought back', async () => {
    const { calls, release } = holdFetch('DELETE');
    renderEditor();
    await open();
    fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: 'meta' } });

    fireEvent.click(removeButton());
    await waitFor(() => expect(calls.some(c => c.method === 'DELETE')).toBe(true));

    expect(await saveTo(5)).toEqual({
      ok: false,
      error: expect.stringContaining('is being removed'),
    });
    expect(calls.some(c => c.method === 'PUT')).toBe(false);

    await act(async () => {
      release();
    });
    // Removed: nothing left to save.
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue(''));
    expect(isDirtyNow()).toBe(false);
  });
});
