/**
 * @jest-environment node
 *
 * The taste endpoint is category-driven now, so what it accepts is decided by the capability
 * registry rather than by a literal in the handler. These tests pin both halves of that: a
 * registered category reaches its generator, and an unregistered one is refused before any
 * authentication, rate-limit slot or category module is touched.
 */

import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const requireAuthMock = jest.fn();
const rateLimitMock = jest.fn();
const generateForCategoryMock = jest.fn();

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
  rateLimitHeaders: () => ({}),
}));

jest.mock('@/lib/ai/dispatch/taste-profile', () => ({
  __esModule: true,
  generateAiTasteProfileForCategory: (...args: unknown[]) => generateForCategoryMock(...args),
}));

import { GET } from '../route';

const supabase = { from: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  createRouteHandlerClientMock.mockResolvedValue(supabase);
  requireAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
  rateLimitMock.mockResolvedValue({ success: true });
  generateForCategoryMock.mockResolvedValue(null);
});

function request(category?: string): Request {
  const url = category
    ? `https://example.test/api/dashboard/ai-taste-profile?category=${category}`
    : 'https://example.test/api/dashboard/ai-taste-profile';
  return new Request(url);
}

describe('supported categories', () => {
  it.each(['games', 'anime', 'manga'])('dispatches %s to its generator', async category => {
    generateForCategoryMock.mockResolvedValue({ identity: { label: 'X' } });

    const response = await GET(request(category));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ profile: { identity: { label: 'X' } } });
    expect(generateForCategoryMock).toHaveBeenCalledWith(supabase, 'user-1', category);
  });

  it('defaults to games when no category is supplied', async () => {
    await GET(request());
    expect(generateForCategoryMock).toHaveBeenCalledWith(supabase, 'user-1', 'games');
  });

  it('accepts a differently cased category', async () => {
    await GET(request('ANIME'));
    expect(generateForCategoryMock).toHaveBeenCalledWith(supabase, 'user-1', 'anime');
  });

  it('accepts manga now that it is registered, without any change to this handler', async () => {
    // Support comes from the capability registry, so enabling a category is a registry edit.
    await GET(request('MANGA'));
    expect(generateForCategoryMock).toHaveBeenCalledWith(supabase, 'user-1', 'manga');
  });

  it('returns a null profile rather than an error when the AI layer declines', async () => {
    generateForCategoryMock.mockResolvedValue(null);

    const response = await GET(request('anime'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ profile: null });
  });

  it('never caches an authenticated response', async () => {
    const response = await GET(request('anime'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('unsupported categories', () => {
  it.each(['coding', 'pet', 'vape', 'nonsense'])(
    'rejects %s without authenticating, rate limiting or dispatching',
    async category => {
      const response = await GET(request(category));

      expect(response.status).toBe(400);
      expect(createRouteHandlerClientMock).not.toHaveBeenCalled();
      expect(requireAuthMock).not.toHaveBeenCalled();
      expect(rateLimitMock).not.toHaveBeenCalled();
      expect(generateForCategoryMock).not.toHaveBeenCalled();
    },
  );
});

describe('rate limiting', () => {
  it('returns a null profile rather than dispatching when the limiter refuses', async () => {
    rateLimitMock.mockResolvedValue({ success: false });

    const response = await GET(request('anime'));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ profile: null });
    expect(generateForCategoryMock).not.toHaveBeenCalled();
  });
});
