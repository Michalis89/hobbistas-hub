/**
 * @jest-environment node
 */

import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const requireAuthMock = jest.fn();
const generateRecommendationsV3Mock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => body,
    }),
  },
  // Shadow work is scheduled, never awaited by the response path.
  after: () => {},
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

jest.mock('@/lib/api/response', () => ({
  __esModule: true,
  fail: jest.fn((body: unknown, status: number, init?: ResponseInit) => ({
    status,
    headers: new Headers((init as { headers?: HeadersInit } | undefined)?.headers),
    json: async () => body,
  })),
}));

jest.mock('@/lib/recommendations/v3/recommender', () => ({
  __esModule: true,
  generateRecommendationsV3WithInternals: (...args: unknown[]) =>
    generateRecommendationsV3Mock(...args),
}));

import { GET } from '@/app/api/backlog/personal-suggestions/route';
import { API_ERRORS } from '@/lib/api/errors';
import { DEFAULT_COVER } from '@/lib/constants/messages';
import { UnauthorizedError } from '@/lib/api/auth';

/** The route reads { response, shadowContext }; there is no shadow context in these cases. */
function v3(possibleNext: unknown[]) {
  return { response: { possibleNext }, shadowContext: null };
}

describe('app/api/backlog/personal-suggestions/route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createRouteHandlerClientMock.mockResolvedValue({});
    requireAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
    generateRecommendationsV3Mock.mockResolvedValue(v3([]));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses games recommender for default/invalid category and maps items', async () => {
    generateRecommendationsV3Mock.mockResolvedValueOnce(v3([
      {
        id: 'personal-games-10',
        mediaDbId: 10,
        title: 'Elden Ring',
        reason: 'Popular in your backlog cluster',
        confidence: 0.91,
        matchedSignals: ['RPG'],
        cover: '',
      },
      {
        id: 'personal-games-11',
        mediaDbId: 11,
        title: 'Should be filtered',
        reason: 'ignore',
        confidence: 0.2,
        matchedSignals: [],
      },
      {
        id: 'personal-games-12',
        mediaDbId: 12,
        title: 'Hades',
        reason: 'Strong match',
        confidence: 0.87,
        matchedSignals: ['Roguelike'],
        cover: 'https://img/hades.jpg',
      },
    ]));

    const res = await GET(
      new Request('http://localhost/api/backlog/personal-suggestions?category=INVALID'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(generateRecommendationsV3Mock).toHaveBeenCalledWith('user-1', 'games');
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toEqual({
      source: 'local',
      id: 'personal-games-10',
      mediaId: 10,
      title: 'Elden Ring',
      subtitle: 'Popular in your backlog cluster',
      status: 'planned',
      score: '9.1',
      tags: ['RPG'],
      cover: DEFAULT_COVER,
      description: 'Popular in your backlog cluster',
      serveId: expect.any(String),
      slotIndex: 0,
    });
    expect(body.items[2].id).toBe('personal-games-12');
    expect(body.items[2].tags).toEqual(['Roguelike']);
  });

  it('uses generic recommender for non-games category and slices to max 4 items', async () => {
    generateRecommendationsV3Mock.mockResolvedValueOnce(v3([
        { id: 'personal-movies-1', mediaDbId: 1, title: 'A', reason: 'r1', confidence: 0.1, matchedSignals: [] },
        { id: 'personal-movies-2', mediaDbId: 2, title: 'B', reason: 'r2', confidence: 0.2, matchedSignals: [] },
        { id: 'personal-movies-3', mediaDbId: 3, title: 'C', reason: 'r3', confidence: 0.3, matchedSignals: [] },
        { id: 'personal-movies-4', mediaDbId: 4, title: 'D', reason: 'r4', confidence: 0.4, matchedSignals: [] },
        { id: 'personal-movies-5', mediaDbId: 5, title: 'E', reason: 'r5', confidence: 0.5, matchedSignals: [] },
      ]));

    const res = await GET(
      new Request('http://localhost/api/backlog/personal-suggestions?category=movies'),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(generateRecommendationsV3Mock).toHaveBeenCalledWith('user-1', 'movies');
    expect(body.items).toHaveLength(4);
    expect(body.items[0].id).toBe('personal-movies-1');
    expect(body.items[3].id).toBe('personal-movies-4');
  });

  it('falls back to games when category query is missing and defaults tags to empty array', async () => {
    generateRecommendationsV3Mock.mockResolvedValueOnce(v3([
      {
        id: 'personal-games-77',
        mediaDbId: 77,
        title: 'No Tags Item',
        reason: 'Because of your profile',
        confidence: 0.66,
        cover: null,
      },
    ]));

    const res = await GET(new Request('http://localhost/api/backlog/personal-suggestions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('personal-games-77');
    expect(body.items[0].tags).toEqual([]);
    expect(body.items[0].cover).toBe(DEFAULT_COVER);
  });

  it('stamps every item of one response with the same serve id and its own slot index', async () => {
    generateRecommendationsV3Mock.mockResolvedValueOnce(v3([
        { id: 'p-1', mediaDbId: 1, title: 'A', reason: 'r', confidence: 0.5, matchedSignals: [] },
        { id: 'p-2', mediaDbId: 2, title: 'B', reason: 'r', confidence: 0.5, matchedSignals: [] },
      ]));

    const body = await (
      await GET(new Request('http://localhost/api/backlog/personal-suggestions?category=games'))
    ).json();

    expect(body.items[0].serveId).toBe(body.items[1].serveId);
    expect(body.items.map((item: { slotIndex: number }) => item.slotIndex)).toEqual([0, 1]);
  });

  it('records impressions without blocking the response', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    createRouteHandlerClientMock.mockResolvedValueOnce({ from: jest.fn(() => ({ upsert })) });
    generateRecommendationsV3Mock.mockResolvedValueOnce(v3([
        { id: 'p-1', mediaDbId: 1, title: 'A', reason: 'r', confidence: 0.5, matchedSignals: [] },
      ]));

    const res = await GET(
      new Request('http://localhost/api/backlog/personal-suggestions?category=games'),
    );

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0][0]).toMatchObject({
      user_id: 'user-1',
      media_id: 1,
      category: 'games',
      surface: 'backlog_personal_suggestions',
      slot_index: 0,
      event_type: 'impression',
    });
  });

  it('still returns recommendations when the impression write fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const upsert = jest.fn().mockRejectedValue(new Error('db gone'));
    createRouteHandlerClientMock.mockResolvedValueOnce({ from: jest.fn(() => ({ upsert })) });
    generateRecommendationsV3Mock.mockResolvedValueOnce(v3([
        { id: 'p-1', mediaDbId: 1, title: 'A', reason: 'r', confidence: 0.5, matchedSignals: [] },
      ]));

    const res = await GET(
      new Request('http://localhost/api/backlog/personal-suggestions?category=games'),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ items: [{ id: 'p-1' }] });
  });

  it('returns unauthorized fail response when auth fails', async () => {
    requireAuthMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new Request('http://localhost/api/backlog/personal-suggestions?category=games'),
    );
    expect(res.status).toBe(API_ERRORS.UNAUTHORIZED.status);
    await expect(res.json()).resolves.toEqual(API_ERRORS.UNAUTHORIZED);
  });

  it('returns internal fail response on unexpected errors', async () => {
    createRouteHandlerClientMock.mockRejectedValueOnce(new Error('boom'));

    const res = await GET(
      new Request('http://localhost/api/backlog/personal-suggestions?category=games'),
    );
    expect(res.status).toBe(API_ERRORS.INTERNAL.status);
    await expect(res.json()).resolves.toEqual(API_ERRORS.INTERNAL);
    expect(console.error).toHaveBeenCalledWith(
      'Backlog personal suggestions error:',
      expect.any(Error),
    );
  });
});
