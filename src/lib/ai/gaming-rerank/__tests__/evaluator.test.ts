import {
  buildBlindPairs,
  compareOrders,
  reblendRun,
  summarizeShadowRuns,
  sweepAiWeights,
  type ShadowRunRow,
} from '../evaluator';

function run(overrides: Partial<ShadowRunRow> = {}): ShadowRunRow {
  return {
    id: 1,
    status: 'success',
    failureCategory: null,
    cacheHit: false,
    latencyMs: 2_000,
    aiWeight: 0.35,
    deterministicOrder: [10, 20, 30, 40, 50],
    aiOrder: [10, 20, 30, 40, 50],
    servedSlotMediaIds: [10, 20],
    blendedSlotMediaIds: [10, 20],
    rankOneGuardTriggered: false,
    ...overrides,
  };
}

describe('compareOrders', () => {
  it('scores identical orders as perfect agreement', () => {
    const result = compareOrders([1, 2, 3, 4], [1, 2, 3, 4])!;

    expect(result.spearman).toBe(1);
    expect(result.meanAbsoluteRankDelta).toBe(0);
    expect(result.maxAbsoluteRankDelta).toBe(0);
  });

  it('scores a reversed order as perfect disagreement', () => {
    expect(compareOrders([1, 2, 3, 4], [4, 3, 2, 1])!.spearman).toBeCloseTo(-1, 10);
  });

  it('measures a single swap', () => {
    const result = compareOrders([1, 2, 3, 4], [2, 1, 3, 4])!;

    expect(result.spearman).toBeLessThan(1);
    expect(result.maxAbsoluteRankDelta).toBe(1);
    expect(result.meanAbsoluteRankDelta).toBe(0.5);
  });

  it('returns null when the orders are not comparable', () => {
    expect(compareOrders([1, 2, 3], [1, 2])).toBeNull();
    expect(compareOrders([1], [1])).toBeNull();
    expect(compareOrders([1, 2, 3], [1, 2, 99])).toBeNull();
  });
});

describe('reblendRun', () => {
  it('reproduces the served slots when the AI agrees', () => {
    const result = reblendRun(run(), 0.35)!;

    expect(result.blendedSlotMediaIds).toEqual([10, 20]);
    expect(result.topSlotsDifferFromServed).toBe(false);
  });

  it('diverges at a high AI weight when the AI disagrees', () => {
    const result = reblendRun(run({ aiOrder: [50, 40, 30, 20, 10] }), 1)!;

    expect(result.blendedSlotMediaIds).toEqual([50, 40]);
    expect(result.topSlotsDifferFromServed).toBe(true);
  });

  it('recomputes at an arbitrary weight without any provider call', () => {
    const row = run({ aiOrder: [50, 40, 30, 20, 10] });

    expect(reblendRun(row, 0)!.blendedSlotMediaIds).toEqual([10, 20]);
    expect(reblendRun(row, 1)!.blendedSlotMediaIds).toEqual([50, 40]);
  });

  it('ignores a run that never produced an AI order', () => {
    expect(reblendRun(run({ status: 'failed', aiOrder: [] }), 0.35)).toBeNull();
  });
});

describe('summarizeShadowRuns', () => {
  it('reports agreement, divergence and cache statistics', () => {
    const summary = summarizeShadowRuns(
      [run({ id: 1 }), run({ id: 2, aiOrder: [20, 10, 30, 40, 50] }), run({ id: 3, cacheHit: true })],
      0.35,
    );

    expect(summary.totalRuns).toBe(3);
    expect(summary.successfulRuns).toBe(3);
    expect(summary.comparableRuns).toBe(3);
    expect(summary.cacheHitRate).toBeCloseTo(1 / 3, 10);
    expect(summary.meanSpearman).toBeLessThanOrEqual(1);
    expect(summary.medianLatencyMs).toBe(2_000);
  });

  it('counts failures by category', () => {
    const summary = summarizeShadowRuns([
      run({ id: 1 }),
      run({ id: 2, status: 'failed', failureCategory: 'quota', aiOrder: [] }),
      run({ id: 3, status: 'failed', failureCategory: 'quota', aiOrder: [] }),
      run({ id: 4, status: 'skipped', failureCategory: 'no_taste_profile', aiOrder: [] }),
    ]);

    expect(summary.failureCounts).toEqual({ quota: 2, no_taste_profile: 1 });
    expect(summary.successfulRuns).toBe(1);
  });

  it('returns nulls rather than NaN with no comparable runs', () => {
    const summary = summarizeShadowRuns([]);

    expect(summary.meanSpearman).toBeNull();
    expect(summary.topSlotDivergenceRate).toBeNull();
    expect(summary.rankOneGuardRate).toBeNull();
    expect(summary.medianLatencyMs).toBeNull();
  });
});

describe('sweepAiWeights', () => {
  it('produces one summary per weight, all from stored rows', () => {
    const summaries = sweepAiWeights([run({ aiOrder: [50, 40, 30, 20, 10] })], [0, 0.5, 1]);

    expect(summaries.map(s => s.aiWeight)).toEqual([0, 0.5, 1]);
    expect(summaries[0].topSlotDivergenceRate).toBe(0);
    expect(summaries[2].topSlotDivergenceRate).toBe(1);
  });
});

describe('buildBlindPairs', () => {
  it('pairs the deterministic pick against the AI pick', () => {
    const pairs = buildBlindPairs([run({ aiOrder: [50, 40, 30, 20, 10] })], 1);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].answerKey).toEqual({ deterministicPreferred: 10, aiPreferred: 50 });
  });

  it('orders the visible options by media id, so position reveals no provenance', () => {
    const pairs = buildBlindPairs([run({ aiOrder: [50, 40, 30, 20, 10] })], 1);

    expect(pairs[0].optionA).toBeLessThan(pairs[0].optionB);
    expect([pairs[0].optionA, pairs[0].optionB].sort()).toEqual([10, 50]);
  });

  it('emits nothing when the orderings agree', () => {
    expect(buildBlindPairs([run()], 0.35)).toEqual([]);
  });

  it('skips runs that produced no AI order', () => {
    expect(buildBlindPairs([run({ status: 'failed', aiOrder: [] })], 1)).toEqual([]);
  });
});
