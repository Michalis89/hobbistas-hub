import {
  blendOrders,
  DEFAULT_GAME_RERANK_AI_WEIGHT,
  getConfiguredAiWeight,
  rankFit,
  RANK_ONE_GUARD_MAX_POSITION,
} from '../blend';

describe('rankFit', () => {
  it('scores the best rank 1 and the worst 0', () => {
    expect(rankFit(1, 5)).toBe(1);
    expect(rankFit(5, 5)).toBe(0);
  });

  it('is linear between the ends', () => {
    expect(rankFit(3, 5)).toBeCloseTo(0.5, 10);
    expect(rankFit(2, 5)).toBeCloseTo(0.75, 10);
  });

  it('returns 1 for a single candidate rather than dividing by zero', () => {
    expect(rankFit(1, 1)).toBe(1);
    expect(rankFit(1, 0)).toBe(1);
  });

  it('clamps a rank outside the range', () => {
    expect(rankFit(0, 5)).toBe(1);
    expect(rankFit(99, 5)).toBe(0);
  });
});

describe('blendOrders', () => {
  const deterministicOrder = [10, 20, 30, 40, 50];

  it('keeps the deterministic order when the AI agrees', () => {
    const result = blendOrders({
      deterministicOrder,
      aiOrder: deterministicOrder,
      aiWeight: DEFAULT_GAME_RERANK_AI_WEIGHT,
    });

    expect(result.order).toEqual(deterministicOrder);
    expect(result.rankOneGuardTriggered).toBe(false);
  });

  it('keeps the deterministic order at weight 0 however hard the AI disagrees', () => {
    const result = blendOrders({
      deterministicOrder,
      aiOrder: [...deterministicOrder].reverse(),
      aiWeight: 0,
    });

    expect(result.order).toEqual(deterministicOrder);
  });

  it('takes the AI order at weight 1', () => {
    const aiOrder = [50, 40, 30, 20, 10];
    const result = blendOrders({ deterministicOrder, aiOrder, aiWeight: 1 });

    expect(result.order).toEqual(aiOrder);
  });

  it('produces the deterministic order on a full tie, because ties break deterministic', () => {
    // At weight 0.5 with exactly reversed orders every candidate scores 0.5.
    const result = blendOrders({
      deterministicOrder,
      aiOrder: [...deterministicOrder].reverse(),
      aiWeight: 0.5,
    });

    expect(result.order).toEqual(deterministicOrder);
    expect(new Set(result.scores.values()).size).toBe(1);
  });

  it('handles a single candidate', () => {
    const result = blendOrders({ deterministicOrder: [7], aiOrder: [7], aiWeight: 0.35 });

    expect(result.order).toEqual([7]);
    expect(result.scores.get(7)).toBe(1);
    expect(result.rankOneGuardTriggered).toBe(false);
  });

  it('handles an empty shortlist', () => {
    const result = blendOrders({ deterministicOrder: [], aiOrder: [], aiWeight: 0.35 });

    expect(result.order).toEqual([]);
    expect(result.rankOneGuardTriggered).toBe(false);
  });

  it('bounds how far a candidate can climb at the default weight', () => {
    // Deterministic last, AI first: the most extreme single-candidate disagreement possible.
    const result = blendOrders({
      deterministicOrder: [10, 20, 30, 40, 50],
      aiOrder: [50, 10, 20, 30, 40],
      aiWeight: DEFAULT_GAME_RERANK_AI_WEIGHT,
    });

    expect(result.order.indexOf(50)).toBeGreaterThan(0);
  });

  it('flags, without clamping, a deterministic #1 pushed past the guard position', () => {
    const result = blendOrders({
      deterministicOrder: [10, 20, 30, 40, 50],
      aiOrder: [20, 30, 40, 50, 10],
      aiWeight: 1,
    });

    expect(result.order[0]).not.toBe(10);
    expect(result.order.indexOf(10) + 1).toBeGreaterThan(RANK_ONE_GUARD_MAX_POSITION);
    // Flagged, not corrected: shadow mode is meant to measure how often this happens.
    expect(result.rankOneGuardTriggered).toBe(true);
  });

  it('does not flag a deterministic #1 that merely slips a place', () => {
    const result = blendOrders({
      deterministicOrder: [10, 20, 30, 40, 50],
      aiOrder: [20, 10, 30, 40, 50],
      aiWeight: 1,
    });

    expect(result.rankOneGuardTriggered).toBe(false);
  });

  it('records the weight and blend version it used', () => {
    const result = blendOrders({ deterministicOrder, aiOrder: deterministicOrder, aiWeight: 0.42 });

    expect(result.aiWeight).toBe(0.42);
    expect(result.blendVersion).toBe('games-rerank-blend-v1');
  });

  it('treats a candidate missing from the AI order as ranked last', () => {
    const result = blendOrders({
      deterministicOrder: [10, 20, 30],
      aiOrder: [30, 20],
      aiWeight: 1,
    });

    expect(result.order[result.order.length - 1]).toBe(10);
  });
});

describe('getConfiguredAiWeight', () => {
  const original = process.env.GAMES_RERANK_AI_WEIGHT;

  afterEach(() => {
    process.env.GAMES_RERANK_AI_WEIGHT = original;
  });

  it('defaults to 0.35', () => {
    delete process.env.GAMES_RERANK_AI_WEIGHT;
    expect(getConfiguredAiWeight()).toBe(DEFAULT_GAME_RERANK_AI_WEIGHT);
  });

  it('honours a configured weight', () => {
    process.env.GAMES_RERANK_AI_WEIGHT = '0.5';
    expect(getConfiguredAiWeight()).toBe(0.5);
  });

  it('clamps to [0, 1]', () => {
    process.env.GAMES_RERANK_AI_WEIGHT = '5';
    expect(getConfiguredAiWeight()).toBe(1);
    process.env.GAMES_RERANK_AI_WEIGHT = '-2';
    expect(getConfiguredAiWeight()).toBe(0);
  });

  it('falls back to the default on nonsense', () => {
    process.env.GAMES_RERANK_AI_WEIGHT = 'banana';
    expect(getConfiguredAiWeight()).toBe(DEFAULT_GAME_RERANK_AI_WEIGHT);
  });
});
