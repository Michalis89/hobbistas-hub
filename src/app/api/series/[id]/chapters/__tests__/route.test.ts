/** @jest-environment node */
import { PUT } from '../route';
import { editorContext, managedSeries } from '@/lib/articles/seriesEditor';

jest.mock('@/lib/articles/seriesEditor', () => {
  const actual = jest.requireActual('@/lib/articles/seriesEditor');
  return {
    ...actual,
    editorContext: jest.fn(),
    managedSeries: jest.fn(),
  };
});
jest.mock('@/lib/cache/tags', () => ({ revalidateCache: { article: jest.fn() } }));
jest.mock('@/lib/observability/withApiRoute', () => ({
  withApiRoute: (handler: unknown) => handler,
}));
jest.mock('@/lib/supabase-route-handler', () => ({ createRouteHandlerClient: jest.fn() }));
jest.mock('@/lib/services/userService', () => ({ getUserFullInfo: jest.fn() }));

describe('series chapter replacement', () => {
  const rpc = jest.fn();
  const author = { roles: ['author'] };
  const context = () => ({ params: Promise.resolve({ id: '5' }) });
  beforeEach(() => {
    jest.clearAllMocks();
    (editorContext as jest.Mock).mockResolvedValue({
      db: { rpc },
      user: author,
      userId: 'owner',
      canCreate: true,
      canManageAll: false,
    });
    (managedSeries as jest.Mock).mockResolvedValue({ id: 5, owner_id: 'owner' });
  });
  const request = (body: object) =>
    new Request('http://localhost/api/series/5/chapters', {
      method: 'PUT',
      body: JSON.stringify(body),
    });

  it('rejects duplicate chapters before invoking the RPC', async () => {
    const response = await PUT(request({ version: 1, article_ids: [2, 2] }), context());
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('checks management rights with the caller roles, not just ownership', async () => {
    (managedSeries as jest.Mock).mockResolvedValue(null);
    const response = await PUT(request({ version: 1, article_ids: [2] }), context());
    expect(response.status).toBe(404);
    expect(managedSeries).toHaveBeenCalledWith({ rpc }, 5, author, 'owner');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the version and list to the RPC and returns the new version', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    const response = await PUT(request({ version: 1, article_ids: [2, 3] }), context());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('replace_series_chapters', {
      p_series_id: 5,
      p_version: 1,
      p_article_ids: [2, 3],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PT409', 409], // stale version
    ['23505', 409], // article already in another series
    ['40P01', 409], // deadlock between concurrent saves
    ['42501', 403], // another author's chapter
    ['P0002', 404],
    ['22023', 400],
    ['XX000', 500],
  ])('maps database error %s to HTTP %i without retrying', async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    const response = await PUT(request({ version: 1, article_ids: [2, 3] }), context());
    expect(response.status).toBe(status);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
