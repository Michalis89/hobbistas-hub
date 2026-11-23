/** @jest-environment node */
import { POST } from '../route';
import { editorContext } from '@/lib/articles/seriesEditor';

jest.mock('@/lib/articles/seriesEditor', () => {
  const actual = jest.requireActual('@/lib/articles/seriesEditor');
  return { ...actual, editorContext: jest.fn() };
});
jest.mock('@/lib/observability/withApiRoute', () => ({
  withApiRoute: (handler: unknown) => handler,
}));
jest.mock('@/lib/supabase-route-handler', () => ({ createRouteHandlerClient: jest.fn() }));
jest.mock('@/lib/services/userService', () => ({ getUserFullInfo: jest.fn() }));

describe('POST /api/series', () => {
  const single = jest.fn();
  const insert = jest.fn(() => ({ select: () => ({ single }) }));
  const db = { from: jest.fn(() => ({ insert })) };
  const request = (body: object) =>
    new Request('http://localhost/api/series', { method: 'POST', body: JSON.stringify(body) });
  const valid = { title: 'The Brothers War', slug: 'brothers-war' };

  beforeEach(() => {
    jest.clearAllMocks();
    (editorContext as jest.Mock).mockResolvedValue({
      db,
      userId: 'u1',
      canCreate: true,
      canManageAll: false,
    });
    single.mockResolvedValue({ data: { id: 7, ...valid }, error: null });
  });

  it('creates a draft owned by the caller', async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith({
      title: 'The Brothers War',
      slug: 'brothers-war',
      description: null,
      cover_image: null,
      owner_id: 'u1',
      status: 'draft',
    });
  });

  it('refuses users who may not create series (e.g. a moderator without an editorial role)', async () => {
    (editorContext as jest.Mock).mockResolvedValue({
      db,
      userId: 'u1',
      canCreate: false,
      canManageAll: true,
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects an http cover image', async () => {
    const response = await POST(request({ ...valid, cover_image: 'http://example.test/a.jpg' }));
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it('answers 409 when the slug is taken', async () => {
    single.mockResolvedValue({ data: null, error: { code: '23505' } });
    const response = await POST(request(valid));
    expect(response.status).toBe(409);
  });
});
