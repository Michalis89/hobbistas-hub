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
jest.mock('crypto', () => ({ randomUUID: () => randomUUIDMock() }));

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
import { POST } from '@/app/api/uploads/series-cover/route';
import { POST as POST_ARTICLE_COVER } from '@/app/api/uploads/article-cover/route';

function makeFile(type = 'image/webp', content = 'x'): File {
  const file = new File([content], 'cover.webp', { type });
  const bytes = Buffer.from(content);
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return file;
}

function requestWith(file: File | null) {
  const formData = new FormData();
  if (file) {
    formData.set('file', file);
  }
  return { formData: async () => formData } as unknown as Request;
}

function server(roles: string[]) {
  const upload = jest.fn().mockResolvedValue({ error: null });
  const getPublicUrl = jest.fn((path: string) => ({
    data: { publicUrl: `https://storage.example/articles/${path}` },
  }));
  const single = jest.fn().mockResolvedValue({ data: { roles }, error: null });
  return {
    client: {
      from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
      storage: { from: jest.fn(() => ({ upload, getPublicUrl })) },
    },
    upload,
  };
}

describe('POST /api/uploads/series-cover', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    randomUUIDMock.mockReturnValue('fixed-uuid');
    createRouteHandlerClientMock.mockResolvedValue({ auth: {} });
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each(['author', 'reviewer', 'admin', 'owner', 'moderator'])(
    'lets a %s upload, into the shared articles bucket under series-cover-',
    async role => {
      const s = server(['user', role]);
      getSupabaseServerMock.mockReturnValue(s.client);
      const response = await POST(requestWith(makeFile()));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        url: 'https://storage.example/articles/articles/series-cover-fixed-uuid.webp',
      });
      expect(s.client.storage.from).toHaveBeenCalledWith('articles');
      expect(s.upload).toHaveBeenCalledWith(
        'articles/series-cover-fixed-uuid.webp',
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'image/webp' }),
      );
    },
  );

  it('refuses a user without a Series Management role', async () => {
    const s = server(['user']);
    getSupabaseServerMock.mockReturnValue(s.client);
    const response = await POST(requestWith(makeFile()));
    expect(response.status).toBe(403);
    expect(s.upload).not.toHaveBeenCalled();
  });

  it('keeps the article pipeline validation: type, missing file, signed out', async () => {
    getSupabaseServerMock.mockReturnValue(server(['author']).client);
    expect((await POST(requestWith(makeFile('image/svg+xml')))).status).toBe(415);
    expect((await POST(requestWith(null))).status).toBe(400);
    requireAuthMock.mockRejectedValueOnce(new UnauthorizedError());
    expect((await POST(requestWith(makeFile()))).status).toBe(401);
  });

  it('leaves article cover permissions unchanged (moderators still cannot upload there)', async () => {
    const s = server(['user', 'moderator']);
    getSupabaseServerMock.mockReturnValue(s.client);
    const response = await POST_ARTICLE_COVER(requestWith(makeFile()));
    expect(response.status).toBe(403);
    expect(s.upload).not.toHaveBeenCalled();
  });
});
