/**
 * The manga shadow run.
 *
 * Manga is the first category reranked off the shared *pipeline's* shadow context rather than a
 * bespoke engine's, so alongside the usual spend-gate checks these tests pin the two things that
 * differ: the shortlist entries are pipeline `ScoredItem`s, and the replay re-runs the pipeline's
 * cluster-diversity selection instead of a franchise loop.
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
  loadMangaCandidateDetails: (...args: unknown[]) => mockLoadDetails(...args),
}));

const mockReadTaste = jest.fn();
jest.mock('../taste-source', () => ({
  __esModule: true,
  readCachedMangaTasteProfileForRerank: (...args: unknown[]) => mockReadTaste(...args),
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
  resetMangaRerankRuntimeState,
  runMangaRerankShadow,
  type MangaRerankShadowInput,
} from '../service';
import { GeminiRerankProviderError } from '@/lib/ai/shared/rank/rerank-provider';
import type {
  PipelineContinuationContext,
  PipelineDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/pipeline/shadow-context';

function entry(
  id: number,
  title: string,
  rawScore: number,
  clusterMatch: string | null,
  deterministicRank: number,
): PipelineDiscoveryShortlistEntry {
  return {
    item: {
      mediaDbId: id,
      title,
      cover: '',
      slug: `manga-${id}`,
      genres: ['Psychological'],
      themes: [],
      platforms: [],
      source: 'discovery',
      rawScore,
      confidence: rawScore / 100,
      clusterMatch,
      toneMatch: null,
      franchiseKey: null,
      matchedSignals: [],
      reason: '',
    },
    deterministicRank,
  };
}

const SHORTLIST = [
  entry(11, 'Monster', 90, 'dark', 1),
  entry(22, 'Pluto', 85, 'dark', 2),
  entry(33, 'Vinland Saga', 80, 'historical', 3),
];

const CONTINUATION_CONTEXT: PipelineContinuationContext = {
  continuationSlotsUsed: 2,
  remainingDiscoverySlots: 2,
  discoveryPreselectLimit: 4,
  possibleNextLimit: 4,
};

const TASTE = {
  profile: {
    identity: { label: 'Slow-burn Realist', description: 'd' },
    pillars: [
      {
        name: 'P',
        kind: 'form',
        description: 'x',
        evidenceTitles: ['Vinland Saga'],
        strengthBand: 'Strong',
      },
    ],
    negativeSignals: [],
    summary: 's',
    openQuestions: [],
    dataQuality: { titleCount: 20, sufficiency: 'rich' },
    source: 'ai',
    model: 'gemini-3.6-flash',
    inputHash: 'manga-taste-hash',
  },
  inputHash: 'manga-taste-hash',
};

function goodRanking() {
  return {
    schemaVersion: 1,
    ranking: [
      { candidateId: 'c02', rank: 1, rationale: 'Closer to the accumulation pillar.' },
      { candidateId: 'c03', rank: 2, rationale: 'Long run, slower open.' },
      { candidateId: 'c01', rank: 3, rationale: 'Tighter arc than the pillar wants.' },
    ],
  };
}

function input(overrides: Partial<MangaRerankShadowInput> = {}): MangaRerankShadowInput {
  return {
    supabase: {} as never,
    userId: 'user-1',
    shortlist: SHORTLIST,
    continuationContext: CONTINUATION_CONTEXT,
    servedDiscoveryIds: [11, 33],
    ...overrides,
  };
}

function lastRun() {
  // writeShadowRunRow(supabase, scope, run) — the record is the third argument.
  return mockWriteShadowRun.mock.calls[mockWriteShadowRun.mock.calls.length - 1][2];
}

describe('runMangaRerankShadow', () => {
  let provider: { rerank: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    resetMangaRerankRuntimeState();
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
    await runMangaRerankShadow(input(), { provider, enabled: false });

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockWriteShadowRun).not.toHaveBeenCalled();
  });

  it('records the run under the manga category', async () => {
    await runMangaRerankShadow(input(), opts());

    expect(lastRun().category).toBe('manga');
    expect(lastRun().promptVersion).toBe('manga-ai-rerank-prompt-v1');
  });

  it('reads media ids and scores off the pipeline item, not off the entry', async () => {
    await runMangaRerankShadow(input(), opts());

    const run = lastRun();
    expect(run.deterministicOrder).toEqual([11, 22, 33]);
    expect(run.deterministicRawScores).toEqual([90, 85, 80]);
    expect(run.aiOrder).toEqual([22, 33, 11]);
  });

  it('replays the cluster-diversity selection, not a franchise loop', async () => {
    // Blended order puts the two `dark` candidates first; the pipeline's diversity pass must still
    // refuse to fill both slots from one cluster on the primary pass.
    mockReadCache.mockResolvedValue({ order: [22, 11, 33], rationales: {} });

    await runMangaRerankShadow(input(), opts());

    const run = lastRun();
    expect(run.blendedSlotMediaIds).toHaveLength(CONTINUATION_CONTEXT.remainingDiscoverySlots);
    expect(run.blendedSlotMediaIds).toContain(33);
    expect(run.blendVersion).toBe('manga-rerank-blend-v1');
  });

  it('sends only opaque tokens, never media ids, slugs or the deterministic reason', async () => {
    await runMangaRerankShadow(input(), opts());

    const sent = JSON.stringify(provider.rerank.mock.calls[0][0].payload);
    expect(sent).toContain('c01');
    expect(sent).not.toContain('manga-11');
    expect(sent).not.toContain('clusterMatch');
    expect(sent).not.toContain('rawScore');
  });

  it('skips a shortlist below the minimum, and says why', async () => {
    await runMangaRerankShadow(input({ shortlist: SHORTLIST.slice(0, 2) }), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'skipped', failureCategory: 'shortlist_too_small' });
  });

  it('skips when there is no cached taste profile, and never generates one', async () => {
    mockReadTaste.mockResolvedValue(null);

    await runMangaRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'skipped', failureCategory: 'no_taste_profile' });
  });

  it('skips a sparse taste profile', async () => {
    mockReadTaste.mockResolvedValue({
      ...TASTE,
      profile: { ...TASTE.profile, dataQuality: { sufficiency: 'sparse' } },
    });

    await runMangaRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ failureCategory: 'sparse_taste_profile' });
  });

  it('uses a cached ranking without calling the provider or the rate limiter', async () => {
    mockReadCache.mockResolvedValue({ order: [33, 11, 22], rationales: { 33: 'r' } });

    await runMangaRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ status: 'success', cacheHit: true });
  });

  it('writes the ranking under the manga cache key', async () => {
    await runMangaRerankShadow(input(), opts());

    expect(mockWriteCache.mock.calls[0][2].category).toBe('manga');
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

    await runMangaRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'duplicate_token' });
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('records a quota refusal as its own failure category', async () => {
    provider.rerank.mockRejectedValue(new GeminiRerankProviderError(429, 'quota', 30_000));

    await runMangaRerankShadow(input(), opts());

    expect(lastRun()).toMatchObject({ status: 'failed', failureCategory: 'quota' });
  });

  it('records a rate-limited run without calling the provider', async () => {
    mockRateLimit.mockResolvedValue({ success: false });

    await runMangaRerankShadow(input(), opts());

    expect(provider.rerank).not.toHaveBeenCalled();
    expect(lastRun()).toMatchObject({ failureCategory: 'rate_limited' });
  });

  it('asks only for the shortlisted ids when loading candidate details', async () => {
    await runMangaRerankShadow(input(), opts());

    expect(mockLoadDetails.mock.calls[0][1]).toEqual([11, 22, 33]);
  });

  it('swallows a failure in its own bookkeeping', async () => {
    mockWriteShadowRun.mockRejectedValue(new Error('db gone'));

    await expect(runMangaRerankShadow(input(), opts())).resolves.toBeUndefined();
  });
});
