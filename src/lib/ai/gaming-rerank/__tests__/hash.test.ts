import { computeRerankInputHash, computeShuffleSeed, type RerankHashInput } from '../hash';
import { buildCandidatePayload, buildTokenMap } from '../payload';
import type { GamesDiscoveryShortlistEntry } from '@/lib/recommendations/v3/games/games-types';
import type { GameRerankTastePayload } from '../types';

function entry(id: number, title: string, overrides = {}): GamesDiscoveryShortlistEntry {
  return {
    candidate: {
      id,
      title,
      slug: `slug-${id}`,
      genres: ['Role-playing (RPG)'],
      themes: [],
      platforms: [],
      cover: '',
      popularityScore: 50,
      developer: 'Dev',
      studios: [],
      releaseDate: '2020-01-01',
      gameModes: [],
      playerPerspectives: [],
      summary: null,
      ...overrides,
    },
    score: 80,
    confidence: 0.8,
    matchedSignals: [],
    debug: {},
    familyKey: `f-${id}`,
    deterministicRank: 1,
  };
}

const TASTE: GameRerankTastePayload = {
  identity: { label: 'Authored Drama', description: 'd' },
  pillars: [{ name: 'P', kind: 'content', description: 'x', strengthBand: 'Strong' }],
  negativeSignals: [],
  summary: 's',
  sufficiency: 'rich',
};

function buildInput(overrides: Partial<RerankHashInput> = {}): RerankHashInput {
  const shortlist = [entry(11, 'A'), entry(22, 'B'), entry(33, 'C')];
  const tokens = buildTokenMap(shortlist).tokens;
  return {
    tasteInputHash: 'taste-hash-1',
    taste: TASTE,
    candidates: shortlist.map((item, i) => buildCandidatePayload(item, tokens[i], null)),
    shortlistMediaIds: shortlist.map(item => item.candidate.id),
    model: 'gemini-3.6-flash',
    ...overrides,
  };
}

describe('computeRerankInputHash', () => {
  const base = computeRerankInputHash(buildInput());

  it('is stable for identical input', () => {
    expect(computeRerankInputHash(buildInput())).toBe(base);
  });

  it('is a sha256 hex digest', () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the Phase 1 profile is regenerated', () => {
    expect(computeRerankInputHash(buildInput({ tasteInputHash: 'taste-hash-2' }))).not.toBe(base);
  });

  it('changes when the taste payload content changes', () => {
    const taste = { ...TASTE, summary: 'different' };
    expect(computeRerankInputHash(buildInput({ taste }))).not.toBe(base);
  });

  it('changes when shortlist membership changes', () => {
    const shortlist = [entry(11, 'A'), entry(22, 'B'), entry(44, 'D')];
    const tokens = buildTokenMap(shortlist).tokens;
    const changed = buildInput({
      candidates: shortlist.map((item, i) => buildCandidatePayload(item, tokens[i], null)),
      shortlistMediaIds: shortlist.map(item => item.candidate.id),
    });

    expect(computeRerankInputHash(changed)).not.toBe(base);
  });

  it('changes when the deterministic shortlist order changes', () => {
    const shortlist = [entry(22, 'B'), entry(11, 'A'), entry(33, 'C')];
    const tokens = buildTokenMap(shortlist).tokens;
    const reordered = buildInput({
      candidates: shortlist.map((item, i) => buildCandidatePayload(item, tokens[i], null)),
      shortlistMediaIds: shortlist.map(item => item.candidate.id),
    });

    expect(computeRerankInputHash(reordered)).not.toBe(base);
  });

  it('changes when candidate semantic metadata is backfilled', () => {
    const shortlist = [entry(11, 'A', { developer: 'Backfilled' }), entry(22, 'B'), entry(33, 'C')];
    const tokens = buildTokenMap(shortlist).tokens;
    const changed = buildInput({
      candidates: shortlist.map((item, i) => buildCandidatePayload(item, tokens[i], null)),
      shortlistMediaIds: shortlist.map(item => item.candidate.id),
    });

    expect(computeRerankInputHash(changed)).not.toBe(base);
  });

  it('changes when a summary is added', () => {
    const shortlist = [entry(11, 'A'), entry(22, 'B'), entry(33, 'C')];
    const tokens = buildTokenMap(shortlist).tokens;
    const changed = buildInput({
      candidates: shortlist.map((item, i) =>
        buildCandidatePayload(item, tokens[i], i === 0 ? 'now with a summary' : null),
      ),
    });

    expect(computeRerankInputHash(changed)).not.toBe(base);
  });

  it('changes when the model changes', () => {
    expect(computeRerankInputHash(buildInput({ model: 'gemini-other' }))).not.toBe(base);
  });

  it('does not depend on the AI blend weight', () => {
    // The blend is pure post-processing over a stored ranking: re-tuning the weight must be able
    // to recompute every past run offline, so it deliberately has no effect on the cache key.
    const before = process.env.GAMES_RERANK_AI_WEIGHT;
    process.env.GAMES_RERANK_AI_WEIGHT = '0.9';
    expect(computeRerankInputHash(buildInput())).toBe(base);
    process.env.GAMES_RERANK_AI_WEIGHT = before;
  });
});

describe('computeShuffleSeed', () => {
  it('is derived from the rerank hash and versioned', () => {
    expect(computeShuffleSeed('abc')).toBe('games-rerank-shuffle-v1:abc');
  });

  it('differs whenever the question differs', () => {
    expect(computeShuffleSeed('abc')).not.toBe(computeShuffleSeed('abd'));
  });
});
