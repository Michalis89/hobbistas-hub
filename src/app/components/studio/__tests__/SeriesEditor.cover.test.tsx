import 'whatwg-fetch';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SeriesEditor, { type SeriesEditorInitial } from '../SeriesEditor.client';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn() }),
}));
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const UPLOADED =
  'https://jolfksxuhyktpwncniks.supabase.co/storage/v1/object/public/articles/articles/series-cover-1.webp';
const REPLACED =
  'https://jolfksxuhyktpwncniks.supabase.co/storage/v1/object/public/articles/articles/series-cover-2.webp';

type Call = { url: string; method: string; body: unknown };

/** fetch stub: uploads answer with a URL; series writes echo the row back. */
function mockFetch(opts: { upload?: () => Promise<Response> } = {}) {
  const calls: Call[] = [];
  const json = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? JSON.parse(init.body)
        : init?.body instanceof FormData
          ? init.body
          : null;
    calls.push({ url, method, body });
    if (url === '/api/uploads/series-cover') {
      return opts.upload ? opts.upload() : json(200, { url: UPLOADED });
    }
    if (url === '/api/series' && method === 'POST') {
      const payload = body as Record<string, unknown>;
      return json(201, { data: { id: 42, ...payload, cover_image: payload.cover_image || null } });
    }
    if (/^\/api\/series\/\d+$/.test(url) && method === 'PUT') {
      const payload = body as Record<string, unknown>;
      return json(200, { data: { id: 7, ...payload, cover_image: payload.cover_image || null } });
    }
    return json(200, { data: { saved: true } });
  }) as unknown as typeof fetch;
  return calls;
}

const file = (name = 'cover.webp', type = 'image/webp') => new File(['x'], name, { type });
const chooseFile = (f: File) =>
  fireEvent.change(screen.getByTestId('series-cover-file'), { target: { files: [f] } });

const existing: SeriesEditorInitial = {
  id: 7,
  title: 'Lore',
  slug: 'lore',
  description: null,
  cover_image: UPLOADED,
  status: 'draft',
  version: 0,
  translation: null,
  chapterIds: [],
};

describe('SeriesEditor cover image', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  describe('create', () => {
    it('uploads a cover before the series exists and saves its URL with the new series', async () => {
      const calls = mockFetch();
      render(<SeriesEditor initial={null} articles={[]} />);
      fireEvent.change(screen.getByLabelText(/English title/), { target: { value: 'MTG Lore' } });
      fireEvent.change(screen.getByLabelText(/Stable slug/), { target: { value: 'mtg-lore' } });

      chooseFile(file());
      const preview = await screen.findByAltText('Series cover preview');
      expect(preview).toHaveAttribute('src', UPLOADED);
      const uploadCall = calls.find(c => c.url === '/api/uploads/series-cover')!;
      expect(uploadCall.method).toBe('POST');
      expect((uploadCall.body as FormData).get('file')).toBeInstanceOf(File);
      expect(screen.getByRole('button', { name: /Replace cover/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/studio/series/42'));
      const create = calls.find(c => c.url === '/api/series' && c.method === 'POST')!;
      expect(create.body).toMatchObject({
        title: 'MTG Lore',
        slug: 'mtg-lore',
        cover_image: UPLOADED,
      });
    });

    it('shows a loading state and blocks saving while the upload runs', async () => {
      let finish: (r: Response) => void = () => {};
      mockFetch({ upload: () => new Promise<Response>(resolve => (finish = resolve)) });
      render(<SeriesEditor initial={null} articles={[]} />);

      chooseFile(file());
      expect(await screen.findByText('Uploading cover…')).toHaveAttribute('role', 'status');
      expect(screen.getByRole('button', { name: /Uploading/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();

      await act(async () => {
        finish(new Response(JSON.stringify({ url: UPLOADED }), { status: 200 }));
      });
      expect(await screen.findByAltText('Series cover preview')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled();
    });

    it('shows the server error and keeps the form usable when an upload is rejected', async () => {
      mockFetch({
        upload: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                message: 'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.',
              }),
              { status: 415 },
            ),
          ),
      });
      render(<SeriesEditor initial={null} articles={[]} />);

      chooseFile(file('cover.svg', 'image/svg+xml'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported image type');
      expect(screen.queryByAltText('Series cover preview')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upload cover' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled();
    });

    it('still accepts a pasted https URL and flags a non-https one', () => {
      mockFetch();
      render(<SeriesEditor initial={null} articles={[]} />);
      const input = screen.getByLabelText('Cover image URL');

      fireEvent.change(input, { target: { value: 'http://example.test/a.jpg' } });
      expect(screen.getByText(/must start with https/)).toBeInTheDocument();
      expect(screen.queryByAltText('Series cover preview')).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'https://images.igdb.com/cover.jpg' } });
      expect(screen.getByAltText('Series cover preview')).toHaveAttribute(
        'src',
        'https://images.igdb.com/cover.jpg',
      );
    });
  });

  describe('edit', () => {
    it('shows the stored cover after a reload', () => {
      mockFetch();
      render(<SeriesEditor initial={existing} articles={[]} />);
      expect(screen.getByAltText('Series cover preview')).toHaveAttribute('src', UPLOADED);
      expect(screen.getByLabelText('Cover image URL')).toHaveValue(UPLOADED);
    });

    it('replaces an existing cover and saves the new URL', async () => {
      const calls = mockFetch({
        upload: () =>
          Promise.resolve(new Response(JSON.stringify({ url: REPLACED }), { status: 200 })),
      });
      render(<SeriesEditor initial={existing} articles={[]} />);

      fireEvent.click(screen.getByRole('button', { name: /Replace cover/ }));
      chooseFile(file('new.webp'));
      await waitFor(() =>
        expect(screen.getByAltText('Series cover preview')).toHaveAttribute('src', REPLACED),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Save metadata' }));
      expect(await screen.findByText('Series saved.')).toBeInTheDocument();
      const put = calls.find(c => c.url === '/api/series/7' && c.method === 'PUT')!;
      expect(put.body).toMatchObject({ cover_image: REPLACED });
      expect(screen.getByLabelText('Cover image URL')).toHaveValue(REPLACED);
    });

    it('removes the cover and saves it as empty', async () => {
      const calls = mockFetch();
      render(<SeriesEditor initial={existing} articles={[]} />);

      fireEvent.click(screen.getByRole('button', { name: /Remove cover/ }));
      expect(screen.queryByAltText('Series cover preview')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Save metadata' }));
      expect(await screen.findByText('Series saved.')).toBeInTheDocument();
      const put = calls.find(c => c.url === '/api/series/7' && c.method === 'PUT')!;
      expect(put.body).toMatchObject({ cover_image: '' });
      expect(screen.getByLabelText('Cover image URL')).toHaveValue('');
    });
  });
});
