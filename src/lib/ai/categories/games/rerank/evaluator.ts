import { blendOrders, getConfiguredAiWeight, RANK_ONE_GUARD_MAX_POSITION } from './blend';

/**
 * A stored shadow run, reduced to what offline analysis needs.
 *
 * Everything here comes out of `ai_rerank_shadow_runs`. No provider call is possible from this
 * module, which is the point: re-tuning the blend must be answerable from evidence already
 * collected, not by asking the model again at a different weight.
 */
export type ShadowRunRow = {
  id: number;
  status: string;
  failureCategory: string | null;
  cacheHit: boolean;
  latencyMs: number | null;
  aiWeight: number | null;
  deterministicOrder: number[];
  aiOrder: number[];
  servedSlotMediaIds: number[];
  blendedSlotMediaIds: number[];
  rankOneGuardTriggered: boolean;
};

export type RankAgreement = {
  /** Spearman's rho between the two orderings. 1 = identical, -1 = exactly reversed. */
  spearman: number;
  meanAbsoluteRankDelta: number;
  maxAbsoluteRankDelta: number;
  candidateCount: number;
};

export function compareOrders(
  deterministicOrder: readonly number[],
  aiOrder: readonly number[],
): RankAgreement | null {
  const n = deterministicOrder.length;
  if (n < 2 || aiOrder.length !== n) {
    return null;
  }

  const aiRank = new Map<number, number>();
  aiOrder.forEach((mediaId, index) => aiRank.set(mediaId, index + 1));

  let sumSquaredDelta = 0;
  let sumAbsoluteDelta = 0;
  let maxAbsoluteDelta = 0;

  for (let i = 0; i < n; i += 1) {
    const ai = aiRank.get(deterministicOrder[i]);
    if (ai === undefined) {
      return null;
    }
    const delta = i + 1 - ai;
    sumSquaredDelta += delta * delta;
    sumAbsoluteDelta += Math.abs(delta);
    maxAbsoluteDelta = Math.max(maxAbsoluteDelta, Math.abs(delta));
  }

  // Both orderings are permutations with no ties, so the simple form applies.
  const spearman = 1 - (6 * sumSquaredDelta) / (n * (n * n - 1));

  return {
    spearman,
    meanAbsoluteRankDelta: sumAbsoluteDelta / n,
    maxAbsoluteRankDelta: maxAbsoluteDelta,
    candidateCount: n,
  };
}

export type ReblendedRun = {
  id: number;
  aiWeight: number;
  blendedSlotMediaIds: number[];
  topSlotsDifferFromServed: boolean;
  rankOneGuardWouldTrigger: boolean;
};

/**
 * Recomputes the blend for one stored run at an arbitrary AI weight.
 *
 * `slotCount` is taken from what was actually served, so the comparison stays like-for-like: the
 * blend is judged on the same number of slots the deterministic engine had available that day.
 */
export function reblendRun(run: ShadowRunRow, aiWeight: number): ReblendedRun | null {
  if (run.status !== 'success' || run.aiOrder.length === 0) {
    return null;
  }

  const blend = blendOrders({
    deterministicOrder: run.deterministicOrder,
    aiOrder: run.aiOrder,
    aiWeight,
  });

  const slotCount = run.servedSlotMediaIds.length;
  const blendedSlots = blend.order.slice(0, slotCount);

  return {
    id: run.id,
    aiWeight,
    blendedSlotMediaIds: blendedSlots,
    topSlotsDifferFromServed:
      slotCount > 0 && blendedSlots.join(',') !== run.servedSlotMediaIds.join(','),
    rankOneGuardWouldTrigger: blend.rankOneGuardTriggered,
  };
}

export type EvaluationSummary = {
  aiWeight: number;
  totalRuns: number;
  successfulRuns: number;
  cacheHitRate: number;
  failureCounts: Record<string, number>;
  medianLatencyMs: number | null;
  meanSpearman: number | null;
  meanAbsoluteRankDelta: number | null;
  /** Share of successful runs whose blended top slots differ from what was served. */
  topSlotDivergenceRate: number | null;
  rankOneGuardRate: number | null;
  comparableRuns: number;
};

export function summarizeShadowRuns(
  runs: readonly ShadowRunRow[],
  aiWeight: number = getConfiguredAiWeight(),
): EvaluationSummary {
  const successful = runs.filter(run => run.status === 'success' && run.aiOrder.length > 0);
  const failureCounts: Record<string, number> = {};
  for (const run of runs) {
    if (run.status === 'success' && !run.failureCategory) {
      continue;
    }
    const key = run.failureCategory ?? run.status;
    failureCounts[key] = (failureCounts[key] ?? 0) + 1;
  }

  const agreements = successful
    .map(run => compareOrders(run.deterministicOrder, run.aiOrder))
    .filter((value): value is RankAgreement => value !== null);

  const reblended = successful
    .map(run => reblendRun(run, aiWeight))
    .filter((value): value is ReblendedRun => value !== null);

  const latencies = runs
    .map(run => run.latencyMs)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b);

  return {
    aiWeight,
    totalRuns: runs.length,
    successfulRuns: successful.length,
    cacheHitRate: runs.length > 0 ? runs.filter(run => run.cacheHit).length / runs.length : 0,
    failureCounts,
    medianLatencyMs: latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null,
    meanSpearman: mean(agreements.map(value => value.spearman)),
    meanAbsoluteRankDelta: mean(agreements.map(value => value.meanAbsoluteRankDelta)),
    topSlotDivergenceRate: rate(reblended.map(value => value.topSlotsDifferFromServed)),
    rankOneGuardRate: rate(reblended.map(value => value.rankOneGuardWouldTrigger)),
    comparableRuns: agreements.length,
  };
}

/**
 * A head-to-head question with the provenance stripped.
 *
 * Reading rationales and finding them persuasive is not evidence. At the data volumes a single
 * library produces, a blind forced choice is the only judgement that carries information, so the
 * pair deliberately does not record which side came from which ordering in its visible fields —
 * `answerKey` is meant to stay unread until after the choice is made.
 */
export type BlindPair = {
  runId: number;
  /** Presented in a stable but provenance-free order. */
  optionA: number;
  optionB: number;
  answerKey: { deterministicPreferred: number; aiPreferred: number };
};

export function buildBlindPairs(
  runs: readonly ShadowRunRow[],
  aiWeight: number = getConfiguredAiWeight(),
): BlindPair[] {
  const pairs: BlindPair[] = [];

  for (const run of runs) {
    const blended = reblendRun(run, aiWeight);
    if (!blended || !blended.topSlotsDifferFromServed) {
      continue;
    }

    const deterministicPreferred = run.servedSlotMediaIds.find(
      mediaId => !blended.blendedSlotMediaIds.includes(mediaId),
    );
    const aiPreferred = blended.blendedSlotMediaIds.find(
      mediaId => !run.servedSlotMediaIds.includes(mediaId),
    );

    if (deterministicPreferred === undefined || aiPreferred === undefined) {
      continue;
    }

    // Ordered by media id rather than by provenance, so the position of an option says nothing
    // about where it came from.
    const [optionA, optionB] = [deterministicPreferred, aiPreferred].sort((a, b) => a - b);

    pairs.push({
      runId: run.id,
      optionA,
      optionB,
      answerKey: { deterministicPreferred, aiPreferred },
    });
  }

  return pairs;
}

/** Sweeps a range of weights so the choice of 0.35 can be argued from data rather than taste. */
export function sweepAiWeights(
  runs: readonly ShadowRunRow[],
  weights: readonly number[] = [0, 0.15, 0.25, 0.35, 0.5, 0.65, 1],
): EvaluationSummary[] {
  return weights.map(weight => summarizeShadowRuns(runs, weight));
}

export { RANK_ONE_GUARD_MAX_POSITION };

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(values: readonly boolean[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.filter(Boolean).length / values.length;
}
