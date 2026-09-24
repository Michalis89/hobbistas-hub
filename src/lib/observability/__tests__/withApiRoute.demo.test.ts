/**
 * @jest-environment node
 */

import 'whatwg-fetch';

jest.mock('@/lib/observability/requestLogger', () => ({
  logApiRequest: jest.fn(),
}));

const DEMO_ID = '11111111-2222-3333-4444-555555555555';

function tokenFor(subject: string) {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('withApiRoute demo guard', () => {
  const originalDemoId = process.env.NEXT_PUBLIC_DEMO_USER_ID;

  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_DEMO_USER_ID = DEMO_ID;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_DEMO_USER_ID = originalDemoId;
  });

  async function wrap(handler: jest.Mock) {
    const { withApiRoute } = await import('@/lib/observability/withApiRoute');
    return withApiRoute(handler);
  }

  it('refuses a write from the demo session without running the handler', async () => {
    const handler = jest.fn();
    const route = await wrap(handler);

    const response = await route(
      new Request('https://example.test/api/articles', {
        method: 'POST',
        headers: { cookie: `sb-access-token=${tokenFor(DEMO_ID)}` },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'DEMO_READ_ONLY' });
    // The point of guarding in the wrapper is that routes writing with the
    // service role never get the chance to.
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets the demo session read', async () => {
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const route = await wrap(handler);

    const response = await route(
      new Request('https://example.test/api/articles', {
        method: 'GET',
        headers: { cookie: `sb-access-token=${tokenFor(DEMO_ID)}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets everyone else write', async () => {
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 201 }));
    const route = await wrap(handler);

    const response = await route(
      new Request('https://example.test/api/articles', { method: 'POST' }),
    );

    expect(response.status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
