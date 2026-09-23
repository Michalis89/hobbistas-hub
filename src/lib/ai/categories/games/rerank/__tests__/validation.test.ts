import { normalizeRationale, validateGameRerankResult } from '../validation';
import { buildTokenMap } from '../payload';
import { GAME_RERANK_TEXT_LIMITS } from '../types';
import type { GamesDiscoveryShortlistEntry } from '@/lib/recommendations/v3/games/games-types';

function entry(id: number): GamesDiscoveryShortlistEntry {
  return {
    candidate: {
      id,
      title: `Title ${id}`,
      slug: `slug-${id}`,
      genres: [],
      themes: [],
      platforms: [],
      cover: '',
      popularityScore: 0,
    },
    score: 70,
    confidence: 0.7,
    matchedSignals: [],
    debug: {},
    familyKey: `f-${id}`,
    deterministicRank: 1,
  };
}

const tokenMap = buildTokenMap([entry(11), entry(22), entry(33)]);

function ranking(entries: Array<{ candidateId: string; rank: number; rationale?: string }>) {
  return {
    schemaVersion: 1,
    ranking: entries.map(e => ({ rationale: 'Fits the authored drama pillar.', ...e })),
  };
}

describe('validateGameRerankResult', () => {
  it('resolves tokens back to media ids in rank order', () => {
    const result = validateGameRerankResult(
      ranking([
        { candidateId: 'c03', rank: 1 },
        { candidateId: 'c01', rank: 2 },
        { candidateId: 'c02', rank: 3 },
      ]),
      tokenMap,
    );

    expect(result.success).toBe(true);
    if (!result.success) {return;}
    expect(result.ranking.order).toEqual([33, 11, 22]);
    expect(result.ranking.rationales[33]).toBe('Fits the authored drama pillar.');
  });

  it('accepts entries supplied out of rank order', () => {
    const result = validateGameRerankResult(
      ranking([
        { candidateId: 'c02', rank: 3 },
        { candidateId: 'c03', rank: 1 },
        { candidateId: 'c01', rank: 2 },
      ]),
      tokenMap,
    );

    expect(result.success).toBe(true);
    if (!result.success) {return;}
    expect(result.ranking.order).toEqual([33, 11, 22]);
  });

  it('rejects a hallucinated token', () => {
    const result = validateGameRerankResult(
      ranking([
        { candidateId: 'c01', rank: 1 },
        { candidateId: 'c02', rank: 2 },
        { candidateId: 'c99', rank: 3 },
      ]),
      tokenMap,
    );

    expect(result).toMatchObject({ success: false, category: 'unknown_token' });
  });

  it('rejects a duplicated token', () => {
    const result = validateGameRerankResult(
      ranking([
        { candidateId: 'c01', rank: 1 },
        { candidateId: 'c01', rank: 2 },
        { candidateId: 'c02', rank: 3 },
      ]),
      tokenMap,
    );

    expect(result).toMatchObject({ success: false, category: 'duplicate_token' });
  });

  it('rejects a short ranking rather than filling the gap', () => {
    const result = validateGameRerankResult(
      ranking([
        { candidateId: 'c01', rank: 1 },
        { candidateId: 'c02', rank: 2 },
      ]),
      tokenMap,
    );

    // Specifically not repaired from deterministic order: a patched rerank would manufacture
    // agreement with the very ordering it is meant to be compared against.
    expect(result).toMatchObject({ success: false });
    expect(result.success).toBe(false);
  });

  it('rejects ranks that are not a permutation of 1..N', () => {
    const result = validateGameRerankResult(
      ranking([
        { candidateId: 'c01', rank: 1 },
        { candidateId: 'c02', rank: 1 },
        { candidateId: 'c03', rank: 2 },
      ]),
      tokenMap,
    );

    expect(result).toMatchObject({ success: false, category: 'rank_not_permutation' });
  });

  it('rejects a structurally invalid object', () => {
    expect(validateGameRerankResult({ nope: true }, tokenMap)).toMatchObject({
      success: false,
      category: 'schema_validation',
    });
  });

  it('rejects a wrong schemaVersion', () => {
    const result = validateGameRerankResult(
      {
        schemaVersion: 2,
        ranking: [
          { candidateId: 'c01', rank: 1, rationale: 'x' },
          { candidateId: 'c02', rank: 2, rationale: 'x' },
          { candidateId: 'c03', rank: 3, rationale: 'x' },
        ],
      },
      tokenMap,
    );

    expect(result).toMatchObject({ success: false, category: 'schema_validation' });
  });

  it('never reports generated text in the failure reason', () => {
    const result = validateGameRerankResult(
      {
        schemaVersion: 1,
        ranking: [{ candidateId: 'c01', rank: 1, rationale: 'SECRET-MODEL-PROSE' }],
      },
      tokenMap,
    );

    expect(result.success).toBe(false);
    if (result.success) {return;}
    expect(result.reason).not.toContain('SECRET-MODEL-PROSE');
  });

  it('normalises a rationale rather than discarding the ranking', () => {
    const result = validateGameRerankResult(
      ranking([
        { candidateId: 'c01', rank: 1, rationale: 'Strong  fit — 92% match' },
        { candidateId: 'c02', rank: 2 },
        { candidateId: 'c03', rank: 3 },
      ]),
      tokenMap,
    );

    expect(result.success).toBe(true);
    if (!result.success) {return;}
    expect(result.ranking.rationales[11]).not.toContain('%');
    expect(result.normalizedRationales).toBe(1);
  });
});

describe('normalizeRationale', () => {
  it('strips percentage confidence', () => {
    expect(normalizeRationale('Great fit 87%').text).toBe('Great fit');
  });

  it('strips an explicit confidence figure', () => {
    expect(normalizeRationale('confidence: 0.9 strong pillar match').text).toContain(
      'strong pillar match',
    );
  });

  it('collapses whitespace', () => {
    expect(normalizeRationale('a   b\n c').text).toBe('a b c');
  });

  it('truncates past the shared bound', () => {
    const long = 'x'.repeat(GAME_RERANK_TEXT_LIMITS.rationale + 50);
    const result = normalizeRationale(long);

    expect(result.text.length).toBeLessThanOrEqual(GAME_RERANK_TEXT_LIMITS.rationale);
    expect(result.changed).toBe(true);
  });

  it('reports an untouched rationale as unchanged', () => {
    expect(normalizeRationale('Clean and short.').changed).toBe(false);
  });
});
