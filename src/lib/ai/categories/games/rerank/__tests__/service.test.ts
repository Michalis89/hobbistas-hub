jest.mock('server-only', () => ({}), { virtual: true });

const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  __esModule: true,
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockLoadCandidateSummaries = jest.fn();
jest.mock('@/lib/recommendations/v3/games/games-recommender', () => ({
  __esModule: true,
  loadCandidateSummaries: (...args: unknown[]) => mockLoadCandidateSummaries(...args),
}));

const mockReadTaste = jest.fn();
jest.mock('../taste-source', () => ({
  __esModule: true,
  readCachedTasteProfileForRerank: (...args: unknown[]) => mockReadTaste(...args),
}));

const mockReadCache = jest.fn();
const mockWriteCache = jest.fn();
const mockWriteShadowRun = jest.fn();
jest.mock('@/lib/ai/shared/cache/rerank-cache', () => ({
  __esModule: true,
  readRerankCacheRow: (...args: unknown[]) => mockReadCache(...args),
  writeRerankCacheRow: (...args: unknown[]) => mockWriteCache(...args),
  writeShadowRunRow: (...args: unknown[]) => mockWriteShadowRun(...args),
}));

import {
  resetGameRerankRuntimeState,
  runGamesRerankShadow,
  type GamesRerankShadowInput,
} from '../service';
import { GeminiRerankProviderError } from '../provider';
import type {
  GamesContinuationContext,
  GamesDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/games/games-types';

function entry(id: number, title: string, score: number): GamesDiscoveryShortlistEntry {
  return {
    candidate: {
      id,
      title,
      slug: `slug-${id}`,
      genres: ['Role-playing (RPG)'],
      themes: [],
      platforms: [],
      cover: '',
      popularityScore: 0,
      developer: 'Dev',
      studios: [],
      releaseDate: '2021-01-01',
      gameModes: [],
      playerPerspectives: [],
      summary: null,
    },
    score,
    confidence: score / 100,
    matchedSignals: [],
    debug: {},
    familyKey: `family-${id}`,
    deterministicRank: 1,
  };
}

const SHORTLIST = [entry(11, 'Alpha', 90), entry(22, 'Beta', 85), entry(33, 'Gamma', 80)];

const CONTINUATION_CONTEXT: GamesContinuationContext = {
  chosenFamilyKeys: ['god-of-war'],
  continuationSlotsUsed: 1,
  remainingDiscoverySlots: 3,
  possibleNextLimit: 4,
};

const TASTE = {
  profile: {
    identity: { label: 'Authored Drama', description: 'd' },
    pillars: [
      {
        name: 'P',
        kind: 'content',
        description: 'x',
        evidenceTitles: ['A'],
        strengthBand: 'Strong',
      },
    ],
    negativeSignals: [],
    summary: 's',
    openQuestions: [],
    dataQuality: { titleCount: 30, ratedRatio: 0.6, favoriteCount: 4, sufficiency: 'rich' },
    source: 'ai',
    model: 'gemini-3.6-flash',
    inputHash: 'taste-hash',
  },
  inputHash: 'taste-hash',
};

function goodRanking() {
  return {
    schemaVersion: 1,
    ranking: [
      { candidateId: 'c02', rank: 1, rationale: 'Best fit for the drama pillar.' },
      { candidateId: 'c03', rank: 2, rationale: 'Solid but slower.' },
      { candidateId: 'c01', rank: 3, rationale: 'Weakest against the pillars.' },
    ],
  };
}

function input(overrides: Partial<GamesRerankShadowInput> = {}): GamesRerankShadowInput {
  return {
    supabase: {} as never,
    userId: 'user-1',
    shortlist: SHORTLIST,
    continuationContext: CONTINUATION_CONTEXT,
    servedDiscoveryIds: [11, 22],
    ...overrides,
  };
}

function lastRun() {
  // writeShadowRunRow(supabase, scope, run) — the record is the third argument.
  return mockWriteShadowRun.mock.calls[mockWriteShadowRun.mock.calls.length - 1][2];
}

describe('runGamesRerankShadow', () => {
  let provider: { rerank: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    resetGameRerankRuntimeState();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    provider = { rerank: jest.fn().mockResolvedValue(goodRanking()) };
    mockRateLimit.mockResolvedValue({ success: true });
    mockReadTaste.mockResolvedValue(TASTE);
    mockReadCache.mockResolvedValue(null);
    mockWriteCache.mockResolvedValue(true);
    mockWriteShadowRun.mockResolvedValue(undefined);
    mockLoadCandidateSummaries.mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const opts = (o = {}) => ({ provider, enabled: true, model: 'gemini-test', ...o });

  it('writes nothing at all when the flag is off', async () => {
    await runGamesRerankShadow(input(), { provider, enabled: false });

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockWriteShadowRun).not.toHaveBeenCalled();
  });

  it('calls the provider and records a successful run', async () => {
    await runGamesRerankShadow(input(), opts());

    expect(provider.rerank).toHaveBeenCalledTimes(1);
    const run = lastRun();
    expect(run.status).toBe('success');
    expect(run.aiOrder).toEqual([22, 33, 11]);
    expect(run.deterministicOrder).toEqual([11, 22, 33]);
    expect(run.deterministicRawScores).toEqual([90, 85, 80]);
    expect(run.cacheHit).toBe(false);
    expect(run.model).toBe('gemini-test');
  });

  it('sends only opaque tokens to the provider, never media ids or titles of the taste evidence', async () => {
    await runGamesRerankShadow(input(), opts());

    const sent = JSON.stringify(provider.rerank.mock.calls[0][0].payload);
    expect(sent).toContain('c01');
    expect(sent).not.toContain('"id"');
    expect(sent).not.toContain('slug-11');
    expect(sent).not.toContain('popularityScore');
    expect(provider.rerank.mock.calls[0][0].tokens).toEqual(['c01', 'c02', 'c03']);
  });

  it('replays deterministic selection over the blended order', async () => {
    await runGamesRerankShadow(input(), opts());

    const run = lastRun();
    expect(run.blendedSlotMediaIds.length).toBeLessThanOrEqual(
      CONTINUATION_CONTEXT.remainingDiscoverySlots,
    );
    expect(run.servedSlotMediaIds).toEqual([11, 22]);
  });

  it('skips a shortlist below the minimum, and says why', async () => {
    await runGamesRerankShadow(input({ shortlist: SHORTLIST.slice(0, 2) }), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'skipped', failureCategory: 'shortlist_too_small' });
  });

  it('skips when there is no cached taste profile, and never generates one', async () => {
    mockReadTaste.mockResolvedValue(null);

    await runGamesRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'skipped', failureCategory: 'no_taste_profile' });
  });

  it('skips a sparse taste profile', async () => {
    mockReadTaste.mockResolvedValue({
      ...TASTE,
      profile: { ...TASTE.profile, dataQuality: { ...TASTE.profile.dataQuality, sufficiency: 'sparse' } },
    });

    await runGamesRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ failureCategory: 'sparse_taste_profile' });
  });

  it('uses a cached ranking without calling the provider, and still records the run', async () => {
    mockReadCache.mockResolvedValue({ order: [33, 11, 22], rationales: { 33: 'r' } });

    await runGamesRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'success', cacheHit: true, aiOrder: [33, 11, 22] });
  });

  it('writes the ranking to the cache after a successful call', async () => {
    await runGamesRerankShadow(input(), opts());

    expect(mockWriteCache).toHaveBeenCalledTimes(1);
    // writeRerankCacheRow(supabase, scope, key, versions, ranking)
    expect(mockWriteCache.mock.calls[0][4].order).toEqual([22, 33, 11]);
  });

  it('records a cache write failure without losing the observation', async () => {
    mockWriteCache.mockResolvedValue(false);

    await runGamesRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'success', failureCategory: 'cache_write' });
  });

  it('applies the sample rate only after a cache miss', async () => {
    await runGamesRerankShadow(input(), opts({ sampleRate: 0, random: () => 0.5 }));

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockWriteShadowRun).not.toHaveBeenCalled();
  });

  it('still records a cache hit when sampling would have skipped', async () => {
    mockReadCache.mockResolvedValue({ order: [11, 22, 33], rationales: {} });

    await runGamesRerankShadow(input(), opts({ sampleRate: 0, random: () => 0.5 }));

    expect(lastRun()).toMatchObject({ cacheHit: true });
  });

  it('deduplicates concurrent runs for the same input', async () => {
    let resolveProvider: (value: unknown) => void = () => {};
    provider.rerank.mockReturnValue(
      new Promise(resolve => {
        resolveProvider = resolve;
      }),
    );

    const first = runGamesRerankShadow(input(), opts());
    const second = runGamesRerankShadow(input(), opts());
    resolveProvider(goodRanking());
    await Promise.all([first, second]);

    expect(provider.rerank).toHaveBeenCalledTimes(1);
  });

  it('records a validation failure and does not cache it', async () => {
    provider.rerank.mockResolvedValue({
      schemaVersion: 1,
      ranking: [
        { candidateId: 'c99', rank: 1, rationale: 'x' },
        { candidateId: 'c02', rank: 2, rationale: 'x' },
        { candidateId: 'c03', rank: 3, rationale: 'x' },
      ],
    });

    await runGamesRerankShadow(input(), opts());

    expect(mockWriteCache).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'unknown_token' });
  });

  it('backs off after a validation failure', async () => {
    provider.rerank.mockResolvedValue({ nope: true });

    await runGamesRerankShadow(input(), opts());
    await runGamesRerankShadow(input(), opts());

    expect(provider.rerank).toHaveBeenCalledTimes(1);
  });

  it('classifies and backs off on quota exhaustion', async () => {
    provider.rerank.mockRejectedValue(new GeminiRerankProviderError(429, 'quota', 1_000));

    await runGamesRerankShadow(input(), opts());
    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'quota' });

    await runGamesRerankShadow(input(), opts());
    expect(provider.rerank).toHaveBeenCalledTimes(1);
  });

  it('classifies a timeout as its own failure category', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    provider.rerank.mockRejectedValue(abort);

    await runGamesRerankShadow(input(), opts({ timeoutMs: 5_000 }));

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'timeout' });
  });

  it('separates a truncated body from a malformed one', async () => {
    // These demand opposite responses — raise the token budget versus fix the contract — so they
    // must not collapse into one category, as they did on the first live truncation.
    const truncated = new Error('Gemini rerank output truncated at 2500 tokens (900 chars)');
    truncated.name = 'GeminiRerankTruncatedError';
    provider.rerank.mockRejectedValue(truncated);

    await runGamesRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'output_truncated' });
  });

  it('classifies an unparseable body as malformed json', async () => {
    const malformed = new Error('Gemini rerank response was not valid JSON');
    malformed.name = 'GeminiRerankJsonError';
    provider.rerank.mockRejectedValue(malformed);

    await runGamesRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'malformed_json' });
  });

  it('trims the shortlist to the configured size before doing anything with it', async () => {
    const wide = Array.from({ length: 20 }, (_, i) => entry(100 + i, `Game ${i}`, 90 - i));
    provider.rerank.mockImplementation(({ tokens }: { tokens: string[] }) => ({
      schemaVersion: 1,
      ranking: tokens.map((token, index) => ({
        candidateId: token,
        rank: index + 1,
        rationale: 'ok',
      })),
    }));

    await runGamesRerankShadow(input({ shortlist: wide }), opts({ shortlistSize: 5 }));

    expect(provider.rerank.mock.calls[0][0].tokens).toHaveLength(5);
    const run = lastRun();
    // Every recorded order must describe the same candidate set, or the blend is meaningless.
    expect(run.shortlistMediaIds).toHaveLength(5);
    expect(run.deterministicOrder).toHaveLength(5);
    expect(run.deterministicRawScores).toHaveLength(5);
    expect(run.aiOrder).toHaveLength(5);
    expect(run.blendedOrder).toHaveLength(5);
  });

  it('classifies any other provider error generically', async () => {
    provider.rerank.mockRejectedValue(new Error('socket hang up'));

    await runGamesRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'provider' });
  });

  it('records a rate-limited run without calling the provider', async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    await runGamesRerankShadow(input(), opts());

    expect(mockRateLimit).toHaveBeenCalledWith('aiRerank', 'user-1');
    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ failureCategory: 'rate_limited' });
  });

  it('a success clears an earlier cooldown', async () => {
    provider.rerank.mockRejectedValueOnce(new Error('transient'));
    await runGamesRerankShadow(input(), opts());

    // Different shortlist => different hash => different cooldown key, so this one proceeds.
    const other = input({ shortlist: [...SHORTLIST].reverse() });
    provider.rerank.mockResolvedValue(goodRanking());
    await runGamesRerankShadow(other, opts());

    expect(lastRun().status).toBe('success');
  });

  it('never throws, whatever the storage layer does', async () => {
    mockWriteShadowRun.mockRejectedValue(new Error('db gone'));

    await expect(runGamesRerankShadow(input(), opts())).resolves.toBeUndefined();
  });

  it('logs no provider response text', async () => {
    const warn = console.warn as jest.Mock;
    provider.rerank.mockResolvedValue({
      schemaVersion: 1,
      ranking: [{ candidateId: 'c01', rank: 1, rationale: 'SECRET-PROSE' }],
    });

    await runGamesRerankShadow(input(), opts());

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('SECRET-PROSE');
  });
});
