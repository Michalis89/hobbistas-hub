/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const requireAuthMock = jest.fn();
const rateLimitMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: class {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
  },
}));

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  __esModule: true,
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));

jest.mock('@/lib/api/auth', () => ({
  __esModule: true,
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

jest.mock('@/lib/rate-limit', () => ({
  __esModule: true,
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

jest.mock('@/lib/api/response', () => ({
  __esModule: true,
  fail: jest.fn((body: unknown, status: number) => ({ status, json: async () => body })),
}));

import { POST } from '@/app/api/recommendations/events/route';

const SERVE_ID = '3f2504e0-4f89-81d3-9a0c-0305e82c3301';

const IMPRESSION = {
  category: 'games',
  surface: 'dashboard_media_suggestions',
  slot_index: 2,
  source: 'discovery',
  subtype: 'discovery',
  deterministic_rank: 3,
};

function buildClient(impression: unknown, upsert = jest.fn().mockResolvedValue({ error: null })) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: impression, error: null });
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    maybeSingle,
    upsert,
  };
  return { supabase: { from: jest.fn(() => chain) }, upsert, chain };
}

function request(body: unknown) {
  return new Request('http://localhost/api/recommendations/events', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('app/api/recommendations/events/route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
    rateLimitMock.mockResolvedValue({ success: true });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('copies the analytical fields from the recorded impression', async () => {
    const { supabase, upsert } = buildClient(IMPRESSION);
    createRouteHandlerClientMock.mockResolvedValue(supabase);

    const res = await POST(request({ serveId: SERVE_ID, mediaId: 42, eventType: 'click' }));

    expect(res.status).toBe(204);
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        serve_id: SERVE_ID,
        media_id: 42,
        category: 'games',
        surface: 'dashboard_media_suggestions',
        slot_index: 2,
        source: 'discovery',
        subtype: 'discovery',
        deterministic_rank: 3,
        event_type: 'click',
      },
      { onConflict: 'serve_id,media_id,event_type', ignoreDuplicates: true },
    );
  });

  it('scopes the impression lookup to the authenticated user', async () => {
    const { supabase, chain } = buildClient(IMPRESSION);
    createRouteHandlerClientMock.mockResolvedValue(supabase);

    await POST(request({ serveId: SERVE_ID, mediaId: 42, eventType: 'click' }));

    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.eq).toHaveBeenCalledWith('serve_id', SERVE_ID);
    expect(chain.eq).toHaveBeenCalledWith('event_type', 'impression');
  });

  it('drops a click against a serve that was never recorded', async () => {
    const { supabase, upsert } = buildClient(null);
    createRouteHandlerClientMock.mockResolvedValue(supabase);

    const res = await POST(request({ serveId: SERVE_ID, mediaId: 999, eventType: 'click' }));

    expect(res.status).toBe(204);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-uuid serve id', { serveId: 'nope', mediaId: 42, eventType: 'click' }],
    ['a missing media id', { serveId: SERVE_ID, eventType: 'click' }],
    ['an unsupported event type', { serveId: SERVE_ID, mediaId: 42, eventType: 'purchase' }],
    ['a client-supplied slot index', { serveId: SERVE_ID, mediaId: 'x', eventType: 'click' }],
  ])('rejects %s without writing', async (_label, body) => {
    const { supabase, upsert } = buildClient(IMPRESSION);
    createRouteHandlerClientMock.mockResolvedValue(supabase);

    const res = await POST(request(body));

    expect(res.status).toBe(204);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a malformed body without throwing', async () => {
    const { supabase, upsert } = buildClient(IMPRESSION);
    createRouteHandlerClientMock.mockResolvedValue(supabase);

    const res = await POST(request('not json at all'));

    expect(res.status).toBe(204);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('drops the event when the user is rate limited', async () => {
    const { supabase, upsert } = buildClient(IMPRESSION);
    createRouteHandlerClientMock.mockResolvedValue(supabase);
    rateLimitMock.mockResolvedValue({ success: false });

    const res = await POST(request({ serveId: SERVE_ID, mediaId: 42, eventType: 'click' }));

    expect(res.status).toBe(204);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never surfaces a database failure to the caller', async () => {
    const upsert = jest.fn().mockRejectedValue(new Error('db gone'));
    const { supabase } = buildClient(IMPRESSION, upsert);
    createRouteHandlerClientMock.mockResolvedValue(supabase);

    const res = await POST(request({ serveId: SERVE_ID, mediaId: 42, eventType: 'click' }));

    expect(res.status).toBe(204);
  });
});
