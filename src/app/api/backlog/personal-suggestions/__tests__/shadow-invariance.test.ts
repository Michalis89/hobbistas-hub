/**
 * @jest-environment node
 *
 * The core Phase 2 invariant: whatever the shadow reranker does, the bytes this endpoint returns
 * are the bytes it would have returned with the feature switched off.
 *
 * Each case runs the same request twice — once with the shadow path disabled, once with it
 * enabled and behaving in some particular way — and compares the serialised responses. Anything
 * that could leak AI influence into the user's payload fails here.
 */

import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const requireAuthMock = jest.fn();
const generateWithInternalsMock = jest.fn();
const runGamesRerankShadowMock = jest.fn();
const afterCallbacks: Array<() => unknown> = [];

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => body,
    }),
  },
  after: (callback: () => unknown) => {
    afterCallbacks.push(callback);
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

jest.mock('@/lib/api/response', () => ({
  __esModule: true,
  fail: jest.fn((body: unknown, status: number) => ({ status, json: async () => body })),
}));

jest.mock('@/lib/recommendations/v3/recommender', () => ({
  __esModule: true,
  generateRecommendationsV3WithInternals: (...args: unknown[]) =>
    generateWithInternalsMock(...args),
}));

jest.mock('@/lib/ai/gaming-rerank/service', () => ({
  __esModule: true,
  runGamesRerankShadow: (...args: unknown[]) => runGamesRerankShadowMock(...args),
}));

import { GET } from '@/app/api/backlog/personal-suggestions/route';

const SHADOW_CONTEXT = {
  discoveryShortlist: [
    {
      candidate: { id: 31, title: 'C', slug: 'c', genres: [], themes: [], platforms: [], cover: '', popularityScore: 0 },
      score: 80,
      confidence: 0.8,
      matchedSignals: [],
      debug: {},
      familyKey: 'f31',
      deterministicRank: 1,
    },
  ],
  continuationContext: {
    chosenFamilyKeys: ['god-of-war'],
    continuationSlotsUsed: 1,
    remainingDiscoverySlots: 3,
    possibleNextLimit: 4,
  },
};

function recommendationResponse() {
  return {
    category: 'games',
    tasteProfile: { summary: 'Authored drama.' },
    fromBacklog: [],
    possibleNext: [
      {
        id: 'rec-games-11',
        mediaDbId: 11,
        title: 'God of War Ragnarök',
        cover: 'cover-11',
        slug: 'gow-r',
        category: 'games',
        source: 'continuation',
        confidence: 1,
        reason: 'Direct sequel to a game you finished.',
        matchedSignals: ['known direct follow-up'],
      },
      {
        id: 'rec-games-21',
        mediaDbId: 21,
        title: 'Mass Effect Legendary Edition',
        cover: 'cover-21',
        slug: 'mele',
        category: 'games',
        source: 'discovery',
        confidence: 0.94,
        reason: 'Authored sci-fi drama.',
        matchedSignals: ['core genre alignment'],
      },
      {
        id: 'rec-games-31',
        mediaDbId: 31,
        title: 'Lies of P',
        cover: 'cover-31',
        slug: 'lop',
        category: 'games',
        source: 'discovery',
        confidence: 0.9,
        reason: 'Methodical combat.',
        matchedSignals: ['dark fantasy / cinematic affinity'],
      },
    ],
  };
}

async function callRoute(): Promise<string> {
  const res = await GET(
    new Request('http://localhost/api/backlog/personal-suggestions?category=games'),
  );
  expect(res.status).toBe(200);
  return JSON.stringify(await res.json());
}

async function drainAfterCallbacks(): Promise<void> {
  while (afterCallbacks.length > 0) {
    const callback = afterCallbacks.shift()!;
    await callback();
  }
}

describe('personal-suggestions shadow invariance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    afterCallbacks.length = 0;
    createRouteHandlerClientMock.mockResolvedValue({
      from: jest.fn(() => ({ upsert: jest.fn().mockResolvedValue({ error: null }) })),
    });
    requireAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
    runGamesRerankShadowMock.mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Flag OFF is modelled as the engine reporting no shadow context to act on. */
  async function baselineBody(): Promise<string> {
    generateWithInternalsMock.mockResolvedValue({
      response: recommendationResponse(),
      gamesShadowContext: null,
    });
    const body = await callRoute();
    await drainAfterCallbacks();
    return body;
  }

  it('schedules no shadow work when there is no shadow context', async () => {
    await baselineBody();

    expect(afterCallbacks).toHaveLength(0);
    expect(runGamesRerankShadowMock).not.toHaveBeenCalled();
  });

  it('returns an identical body when the shadow path is active', async () => {
    const off = await baselineBody();

    generateWithInternalsMock.mockResolvedValue({
      response: recommendationResponse(),
      gamesShadowContext: SHADOW_CONTEXT,
    });
    const on = await callRoute();
    await drainAfterCallbacks();

    expect(on).toEqual(off);
    expect(runGamesRerankShadowMock).toHaveBeenCalledTimes(1);
  });

  it('returns the response before the shadow work runs', async () => {
    generateWithInternalsMock.mockResolvedValue({
      response: recommendationResponse(),
      gamesShadowContext: SHADOW_CONTEXT,
    });

    await callRoute();

    // The response has already been built and returned; the shadow callback is still queued.
    expect(runGamesRerankShadowMock).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
  });

  it.each([
    ['a provider failure', () => Promise.reject(new Error('gemini exploded'))],
    ['a cache failure', () => Promise.reject(new Error('db gone'))],
    ['an invalid AI ranking', () => Promise.resolve(undefined)],
    ['a slow shadow run', () => Promise.resolve(undefined)],
  ])('returns an identical body despite %s', async (_label, behaviour) => {
    const off = await baselineBody();

    runGamesRerankShadowMock.mockImplementation(behaviour);
    generateWithInternalsMock.mockResolvedValue({
      response: recommendationResponse(),
      gamesShadowContext: SHADOW_CONTEXT,
    });

    const on = await callRoute();
    await drainAfterCallbacks().catch(() => undefined);

    expect(on).toEqual(off);
  });

  it('passes only discovery items to the shadow run, never continuations', async () => {
    generateWithInternalsMock.mockResolvedValue({
      response: recommendationResponse(),
      gamesShadowContext: SHADOW_CONTEXT,
    });

    await callRoute();
    await drainAfterCallbacks();

    const passed = runGamesRerankShadowMock.mock.calls[0][0];
    expect(passed.servedDiscoveryIds).toEqual([21, 31]);
    expect(passed.servedDiscoveryIds).not.toContain(11);
    expect(passed.continuationContext).toEqual(SHADOW_CONTEXT.continuationContext);
  });

  it('never lets shadow output reach the serialised response', async () => {
    generateWithInternalsMock.mockResolvedValue({
      response: recommendationResponse(),
      gamesShadowContext: SHADOW_CONTEXT,
    });

    const body = await callRoute();
    await drainAfterCallbacks();

    for (const forbidden of [
      'aiOrder',
      'blendedOrder',
      'rationale',
      'rerankInputHash',
      'discoveryShortlist',
      'continuationContext',
      'deterministicRank',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('keeps the deterministic ordering of the visible items', async () => {
    generateWithInternalsMock.mockResolvedValue({
      response: recommendationResponse(),
      gamesShadowContext: SHADOW_CONTEXT,
    });

    const parsed = JSON.parse(await callRoute());
    await drainAfterCallbacks();

    expect(parsed.items.map((item: { mediaId: number }) => item.mediaId)).toEqual([11, 21, 31]);
    expect(parsed.items[0].title).toBe('God of War Ragnarök');
    expect(parsed.items[0].score).toBe('10.0');
  });
});
