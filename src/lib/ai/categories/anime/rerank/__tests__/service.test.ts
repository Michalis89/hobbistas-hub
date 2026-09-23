/**
 * The anime shadow run, end to end over the shared runner.
 *
 * Anime is the first category to reuse `shared/rank/shadow-runner.ts`, so these tests are doing two
 * jobs: checking the anime adapter supplies what it should, and checking the shared orchestration
 * behaves for a second category the way it does for the first — the spend gates in particular, since
 * a runner that charged the rate limiter on a cache hit would only show up here.
 */

jest.mock('server-only', () => ({}), { virtual: true });

const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  __esModule: true,
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockLoadDetails = jest.fn();
jest.mock('../candidate-details', () => ({
  __esModule: true,
  loadAnimeCandidateDetails: (...args: unknown[]) => mockLoadDetails(...args),
}));

const mockReadTaste = jest.fn();
jest.mock('../taste-source', () => ({
  __esModule: true,
  readCachedAnimeTasteProfileForRerank: (...args: unknown[]) => mockReadTaste(...args),
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
  resetAnimeRerankRuntimeState,
  runAnimeRerankShadow,
  type AnimeRerankShadowInput,
} from '../service';
import { GeminiRerankProviderError } from '@/lib/ai/shared/rank/rerank-provider';
import type {
  AnimeContinuationContext,
  AnimeDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/anime/anime-types';

function entry(id: number, title: string, score: number): AnimeDiscoveryShortlistEntry {
  return {
    candidate: {
      id,
      title,
      cover: '',
      slug: `anime-${id}`,
      category: 'anime',
      genres: ['Drama'],
      themes: [],
      platforms: [],
      popularityScore: 0,
    },
    score,
    matchedSignals: [],
    familyKey: `family-${id}`,
    deterministicRank: 1,
  };
}

const SHORTLIST = [entry(11, 'Monster', 90), entry(22, 'Mushishi', 85), entry(33, 'Pluto', 80)];

const CONTINUATION_CONTEXT: AnimeContinuationContext = {
  chosenFamilyKeys: ['attack-on-titan'],
  continuationSlotsUsed: 1,
  remainingDiscoverySlots: 3,
  possibleNextLimit: 4,
};

const TASTE = {
  profile: {
    identity: { label: 'Quiet Study', description: 'd' },
    pillars: [
      {
        name: 'P',
        kind: 'form',
        description: 'x',
        evidenceTitles: ['Mushishi'],
        strengthBand: 'Strong',
      },
    ],
    negativeSignals: [],
    summary: 's',
    openQuestions: [],
    dataQuality: { titleCount: 30, sufficiency: 'rich' },
    source: 'ai',
    model: 'gemini-3.6-flash',
    inputHash: 'anime-taste-hash',
  },
  inputHash: 'anime-taste-hash',
};

function goodRanking() {
  return {
    schemaVersion: 1,
    ranking: [
      { candidateId: 'c02', rank: 1, rationale: 'Closest to the introspective pillar.' },
      { candidateId: 'c03', rank: 2, rationale: 'Similar register, broader cast.' },
      { candidateId: 'c01', rank: 3, rationale: 'Plot-forward against the pillar.' },
    ],
  };
}

function input(overrides: Partial<AnimeRerankShadowInput> = {}): AnimeRerankShadowInput {
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

describe('runAnimeRerankShadow', () => {
  let provider: { rerank: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    resetAnimeRerankRuntimeState();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    provider = { rerank: jest.fn().mockResolvedValue(goodRanking()) };
    mockRateLimit.mockResolvedValue({ success: true });
    mockReadTaste.mockResolvedValue(TASTE);
    mockReadCache.mockResolvedValue(null);
    mockWriteCache.mockResolvedValue(true);
    mockWriteShadowRun.mockResolvedValue(undefined);
    mockLoadDetails.mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const opts = (o = {}) => ({ provider, enabled: true, model: 'gemini-test', ...o });

  it('writes nothing at all when the flag is off', async () => {
    await runAnimeRerankShadow(input(), { provider, enabled: false });

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockWriteShadowRun).not.toHaveBeenCalled();
  });

  it('records the run under the anime category, not games', async () => {
    await runAnimeRerankShadow(input(), opts());

    expect(lastRun().category).toBe('anime');
  });

  it('calls the provider and records a successful run', async () => {
    await runAnimeRerankShadow(input(), opts());

    expect(provider.rerank).toHaveBeenCalledTimes(1);
    const run = lastRun();
    expect(run.status).toBe('success');
    expect(run.aiOrder).toEqual([22, 33, 11]);
    expect(run.deterministicOrder).toEqual([11, 22, 33]);
    expect(run.deterministicRawScores).toEqual([90, 85, 80]);
    expect(run.cacheHit).toBe(false);
    expect(run.model).toBe('gemini-test');
    expect(run.promptVersion).toBe('anime-ai-rerank-prompt-v1');
  });

  it('sends only opaque tokens, never media ids or slugs', async () => {
    await runAnimeRerankShadow(input(), opts());

    const sent = JSON.stringify(provider.rerank.mock.calls[0][0].payload);
    expect(sent).toContain('c01');
    expect(sent).not.toContain('anime-11');
    expect(sent).not.toContain('popularityScore');
    expect(provider.rerank.mock.calls[0][0].tokens).toEqual(['c01', 'c02', 'c03']);
  });

  it('records what the blend would have shown beside what was served', async () => {
    await runAnimeRerankShadow(input(), opts());

    const run = lastRun();
    expect(run.servedSlotMediaIds).toEqual([11, 22]);
    expect(run.blendedSlotMediaIds.length).toBeLessThanOrEqual(
      CONTINUATION_CONTEXT.remainingDiscoverySlots,
    );
    expect(run.blendVersion).toBe('anime-rerank-blend-v1');
  });

  it('skips a shortlist below the minimum, and says why', async () => {
    await runAnimeRerankShadow(input({ shortlist: SHORTLIST.slice(0, 2) }), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'skipped', failureCategory: 'shortlist_too_small' });
  });

  it('skips when there is no cached taste profile, and never generates one', async () => {
    mockReadTaste.mockResolvedValue(null);

    await runAnimeRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'skipped', failureCategory: 'no_taste_profile' });
  });

  it('skips a sparse taste profile', async () => {
    mockReadTaste.mockResolvedValue({
      ...TASTE,
      profile: { ...TASTE.profile, dataQuality: { sufficiency: 'sparse' } },
    });

    await runAnimeRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ failureCategory: 'sparse_taste_profile' });
  });

  it('uses a cached ranking without calling the provider or the rate limiter', async () => {
    mockReadCache.mockResolvedValue({ order: [33, 11, 22], rationales: { 33: 'r' } });

    await runAnimeRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'success', cacheHit: true, aiOrder: [33, 11, 22] });
  });

  it('writes the ranking to the cache after a successful call', async () => {
    await runAnimeRerankShadow(input(), opts());

    expect(mockWriteCache).toHaveBeenCalledTimes(1);
    // writeRerankCacheRow(supabase, scope, key, versions, ranking)
    expect(mockWriteCache.mock.calls[0][2].category).toBe('anime');
    expect(mockWriteCache.mock.calls[0][4].order).toEqual([22, 33, 11]);
  });

  it('records a rejected ranking under its validation category', async () => {
    provider.rerank.mockResolvedValue({
      schemaVersion: 1,
      ranking: [
        { candidateId: 'c01', rank: 1, rationale: 'a' },
        { candidateId: 'c01', rank: 2, rationale: 'b' },
        { candidateId: 'c03', rank: 3, rationale: 'c' },
      ],
    });

    await runAnimeRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'duplicate_token' });
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('never fills a missing candidate from the deterministic order', async () => {
    // A rerank patched with the ordering it was meant to be compared against would manufacture
    // agreement, which is worse than no data at all. Four candidates go out and three come back, so
    // the shortfall is caught by the permutation check rather than by the contract's own minimum.
    const shortlist = [...SHORTLIST, entry(44, 'Kaiba', 75)];
    provider.rerank.mockResolvedValue({
      schemaVersion: 1,
      ranking: [
        { candidateId: 'c01', rank: 1, rationale: 'a' },
        { candidateId: 'c02', rank: 2, rationale: 'b' },
        { candidateId: 'c03', rank: 3, rationale: 'c' },
      ],
    });

    await runAnimeRerankShadow(input({ shortlist }), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'count_mismatch' });
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('rejects a ranking shorter than the contract allows, rather than padding it', async () => {
    provider.rerank.mockResolvedValue({
      schemaVersion: 1,
      ranking: [{ candidateId: 'c01', rank: 1, rationale: 'a' }],
    });

    await runAnimeRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'schema_validation' });
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('records a provider timeout as its own failure category', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    provider.rerank.mockRejectedValue(abort);

    await runAnimeRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'timeout' });
  });

  it('records a quota refusal as its own failure category', async () => {
    provider.rerank.mockRejectedValue(new GeminiRerankProviderError(429, 'quota', 30_000));

    await runAnimeRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'quota' });
  });

  it('records a rate-limited run without calling the provider', async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    await runAnimeRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ failureCategory: 'rate_limited' });
  });

  it('writes nothing when sampling declines the run', async () => {
    await runAnimeRerankShadow(input(), opts({ sampleRate: 0.5, random: () => 0.9 }));

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockWriteShadowRun).not.toHaveBeenCalled();
  });

  it('swallows a failure in its own bookkeeping', async () => {
    mockWriteShadowRun.mockRejectedValue(new Error('db gone'));

    await expect(runAnimeRerankShadow(input(), opts())).resolves.toBeUndefined();
  });

  it('asks only for the shortlisted ids when loading candidate details', async () => {
    await runAnimeRerankShadow(input(), opts());

    expect(mockLoadDetails).toHaveBeenCalledTimes(1);
    expect(mockLoadDetails.mock.calls[0][1]).toEqual([11, 22, 33]);
  });
});
