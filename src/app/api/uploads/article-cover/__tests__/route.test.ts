import 'whatwg-fetch';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const randomUUIDMock = jest.fn();
jest.mock('crypto', () => ({
  randomUUID: () => randomUUIDMock(),
}));

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

const createRouteHandlerClientMock = jest.fn();
const getSupabaseServerMock = jest.fn();
const requireAuthMock = jest.fn();

jest.mock('@/lib/supabase-route-handler', () => ({
  createRouteHandlerClient: () => createRouteHandlerClientMock(),
}));

jest.mock('@/lib/supabase-server', () => ({
  __esModule: true,
  default: () => getSupabaseServerMock(),
}));

jest.mock('@/lib/api/auth', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    code = 'UNAUTHORIZED';
  },
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
}));

import { UnauthorizedError } from '@/lib/api/auth';
import { POST } from '@/app/api/uploads/article-cover/route';
import { MAX_IMAGE_BYTES } from '@/lib/api/uploads/articleImages';

function makeTestFile(name: string, type: string, content = 'x'): File {
  const file = new File([content], name, { type });
  const bytes = Buffer.from(content);
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return file;
}

function makeRequest(formData: FormData): Request {
  return {
    formData: async () => formData,
  } as unknown as Request;
}

function makeSupabaseServerMock(config?: {
  userData?: unknown;
  userError?: unknown;
  uploadError?: unknown;
  publicUrl?: string | null;
}) {
  const usersSingle = jest.fn().mockResolvedValue({
    data: config?.userData ?? { roles: ['admin'] },
    error: config?.userError ?? null,
  });
  const usersEq = jest.fn().mockReturnValue({ single: usersSingle });
  const usersSelect = jest.fn().mockReturnValue({ eq: usersEq });
  const usersFrom = jest.fn().mockReturnValue({ select: usersSelect });

  const upload = jest.fn().mockResolvedValue({ error: config?.uploadError ?? null });
  const getPublicUrl = jest.fn().mockReturnValue({
    data: {
      publicUrl:
        config && 'publicUrl' in config
          ? (config.publicUrl ?? null)
          : 'https://cdn.example.com/articles/cover.jpg',
    },
  });
  const storageFrom = jest.fn().mockReturnValue({ upload, getPublicUrl });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'users') {
      return usersFrom();
    }
    return {};
  });

  return {
    client: {
      from,
      storage: { from: storageFrom },
    },
    spies: { upload, getPublicUrl, storageFrom },
  };
}

describe('app/api/uploads/article-cover/route', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    randomUUIDMock.mockReturnValue('fixed-uuid');
    createRouteHandlerClientMock.mockResolvedValue({ auth: {} });
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns 401 when auth fails with UnauthorizedError', async () => {
    requireAuthMock.mockRejectedValueOnce(new UnauthorizedError());
    getSupabaseServerMock.mockReturnValue(makeSupabaseServerMock().client);

    const response = await POST(makeRequest(new FormData()));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized access.' });
  });

  it('returns 400 when file is missing or not a File', async () => {
    getSupabaseServerMock.mockReturnValue(makeSupabaseServerMock().client);

    const f1 = new FormData();
    const r1 = await POST(makeRequest(f1));
    expect(r1.status).toBe(400);

    const f2 = new FormData();
    f2.set('file', 'not-file');
    const r2 = await POST(makeRequest(f2));
    expect(r2.status).toBe(400);
  });

  it('returns 403 when user roles cannot be loaded or missing', async () => {
    getSupabaseServerMock.mockReturnValueOnce(
      makeSupabaseServerMock({ userData: null, userError: { message: 'fail' } }).client,
    );
    const form = new FormData();
    form.set('file', makeTestFile('cover.jpg', 'image/jpeg'));
    const response = await POST(makeRequest(form));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Action is not allowed.' });
  });

  it('returns 403 when user does not have allowed role', async () => {
    getSupabaseServerMock.mockReturnValue(
      makeSupabaseServerMock({ userData: { roles: ['user'] } }).client,
    );
    const form = new FormData();
    form.set('file', makeTestFile('cover.jpg', 'image/jpeg'));
    const response = await POST(makeRequest(form));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'You do not have permission for this action.',
    });
  });

  it('returns 403 when user roles value is not an array', async () => {
    getSupabaseServerMock.mockReturnValue(
      makeSupabaseServerMock({ userData: { roles: 'admin' } }).client,
    );
    const form = new FormData();
    form.set('file', makeTestFile('cover.jpg', 'image/jpeg'));
    const response = await POST(makeRequest(form));
    expect(response.status).toBe(403);
  });

  it('returns 500 when upload fails', async () => {
    const supabase = makeSupabaseServerMock({ uploadError: { message: 'upload-failed' } });
    getSupabaseServerMock.mockReturnValue(supabase.client);
    const form = new FormData();
    form.set('file', makeTestFile('cover.JPG', 'image/jpeg'));
    const response = await POST(makeRequest(form));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: 'Upload failed.' });
  });

  it('returns 500 when public url is missing', async () => {
    getSupabaseServerMock.mockReturnValue(makeSupabaseServerMock({ publicUrl: null }).client);
    const form = new FormData();
    form.set('file', makeTestFile('cover.jpg', 'image/jpeg'));
    const response = await POST(makeRequest(form));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: 'We cannot return the image URL.' });
  });

  it('uploads successfully and derives the extension from the MIME type', async () => {
    const supabase = makeSupabaseServerMock({
      userData: { roles: ['author'] },
      publicUrl: 'https://cdn.example.com/articles/cover-fixed.png',
    });
    getSupabaseServerMock.mockReturnValue(supabase.client);

    const form = new FormData();
    // Hostile filename: the extension must come from the validated MIME type.
    form.set('file', makeTestFile('My Cover.###', 'image/png', 'abc'));
    const response = await POST(makeRequest(form));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://cdn.example.com/articles/cover-fixed.png',
    });
    expect(supabase.spies.upload).toHaveBeenCalledWith(
      'articles/cover-fixed-uuid.png',
      expect.any(Buffer),
      expect.objectContaining({
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/png',
      }),
    );
  });

  it('rejects a non-image disguised with an image filename', async () => {
    const supabase = makeSupabaseServerMock({ userData: { roles: ['author'] } });
    getSupabaseServerMock.mockReturnValue(supabase.client);
    const form = new FormData();
    form.set('file', makeTestFile('cover.png', 'text/html', '<script>alert(1)</script>'));

    const response = await POST(makeRequest(form));

    expect(response.status).toBe(415);
    expect(supabase.spies.upload).not.toHaveBeenCalled();
  });

  it('rejects a file with no declared MIME type', async () => {
    const supabase = makeSupabaseServerMock({ userData: { roles: ['author'] } });
    getSupabaseServerMock.mockReturnValue(supabase.client);
    const form = new FormData();
    form.set('file', makeTestFile('cover.jpg', ''));

    const response = await POST(makeRequest(form));

    expect(response.status).toBe(415);
    expect(supabase.spies.upload).not.toHaveBeenCalled();
  });

  it('rejects images above the size limit', async () => {
    const supabase = makeSupabaseServerMock({ userData: { roles: ['author'] } });
    getSupabaseServerMock.mockReturnValue(supabase.client);
    const file = makeTestFile('cover.png', 'image/png');
    Object.defineProperty(file, 'size', { value: MAX_IMAGE_BYTES + 1 });
    const form = new FormData();
    form.set('file', file);

    const response = await POST(makeRequest(form));

    expect(response.status).toBe(413);
    expect(supabase.spies.upload).not.toHaveBeenCalled();
  });

  it('returns 500 for unexpected errors', async () => {
    createRouteHandlerClientMock.mockRejectedValueOnce(new Error('boom'));
    getSupabaseServerMock.mockReturnValue(makeSupabaseServerMock().client);
    const response = await POST(makeRequest(new FormData()));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: 'Image upload error.' });
  });
});
