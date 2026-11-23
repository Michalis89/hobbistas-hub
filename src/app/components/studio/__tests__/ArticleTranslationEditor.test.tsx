import 'whatwg-fetch';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArticleTranslationEditor, {
  UNSAVED_TRANSLATION_MESSAGE,
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

function renderEditor() {
  return render(
    <ArticleTranslationEditor
      articleId={5}
      locale="el"
      mediaCategory="games"
      source={source}
      slug="lore"
      basePath="/articles"
    />,
  );
}

async function open() {
  fireEvent.click(screen.getByRole('button', { name: /version/ }));
  await screen.findByLabelText('Meta title');
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
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(unloadIsBlocked()).toBe(false);
  });

  it('blocks leaving after an edit, and clears once saved', async () => {
    const calls = mockFetch();
    renderEditor();
    await open();

    fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: 'Ελληνικό meta' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(unloadIsBlocked()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Save Ελληνικά/ }));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    expect(unloadIsBlocked()).toBe(false);
    const put = calls.find(c => c.method === 'PUT')!;
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
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('keeps unsaved edits when the section is collapsed and reopened, without refetching', async () => {
    const calls = mockFetch();
    renderEditor();
    await open();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Αλλαγμένος' } });

    const toggle = screen.getByRole('button', { name: /version/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(screen.getByLabelText('Title')).toHaveValue('Αλλαγμένος');
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
      act(() => {
        fireEvent.click(link);
      });
      expect(confirm).not.toHaveBeenCalled();
    });
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
