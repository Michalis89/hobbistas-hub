/**
 * Offline evaluator for AI rerank shadow runs.
 *
 * Reads `ai_rerank_shadow_runs` and reports agreement, divergence and failure rates, plus blind
 * head-to-head pairs for manual judgement. Makes zero provider calls — every number here comes
 * from rankings that were already paid for, which is what makes re-tuning the blend free.
 *
 * Usage (jiti is already a dependency):
 *   npx jiti src/lib/ai/categories/games/rerank/evaluator-cli.ts
 *   npx jiti src/lib/ai/categories/games/rerank/evaluator-cli.ts --sweep
 *   npx jiti src/lib/ai/categories/games/rerank/evaluator-cli.ts --pairs
 *   npx jiti src/lib/ai/categories/games/rerank/evaluator-cli.ts --json --limit 500
 *   npx jiti src/lib/ai/categories/games/rerank/evaluator-cli.ts --weight 0.5
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * Lives under src/ rather than scripts/ because /scripts is gitignored in this repo, and an
 * evaluator that disappears on clone is not much of an evaluation tool. Nothing imports it, so it
 * is never bundled.
 */

/* eslint-disable no-console -- this is a CLI reporting tool */

import { createClient } from '@supabase/supabase-js';
import {
  buildBlindPairs,
  compareOrders,
  summarizeShadowRuns,
  sweepAiWeights,
  type ShadowRunRow,
} from './evaluator';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null, d = 2) => (v === null ? 'n/a' : v.toFixed(d));

async function main() {
  const supabase = createClient(url!, key!);
  const limit = Number(value('limit', '1000'));

  const { data, error } = await supabase
    .from('ai_rerank_shadow_runs')
    .select(
      'id, status, failure_category, cache_hit, latency_ms, ai_weight, deterministic_order, ai_order, served_slot_media_ids, blended_slot_media_ids, rank_one_guard_triggered',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to read shadow runs:', error.message);
    process.exit(1);
  }

  const runs: ShadowRunRow[] = (data ?? []).map(row => ({
    id: row.id as number,
    status: row.status as string,
    failureCategory: (row.failure_category as string | null) ?? null,
    cacheHit: Boolean(row.cache_hit),
    latencyMs: (row.latency_ms as number | null) ?? null,
    aiWeight: (row.ai_weight as number | null) ?? null,
    deterministicOrder: (row.deterministic_order as number[]) ?? [],
    aiOrder: (row.ai_order as number[]) ?? [],
    servedSlotMediaIds: (row.served_slot_media_ids as number[]) ?? [],
    blendedSlotMediaIds: (row.blended_slot_media_ids as number[]) ?? [],
    rankOneGuardTriggered: Boolean(row.rank_one_guard_triggered),
  }));

  const weight = Number(value('weight', process.env.GAMES_RERANK_AI_WEIGHT ?? '0.35'));
  const summary = summarizeShadowRuns(runs, weight);

  if (flag('json')) {
    console.log(
      JSON.stringify(
        {
          runsLoaded: runs.length,
          summary,
          ...(flag('sweep') ? { sweep: sweepAiWeights(runs) } : {}),
          ...(flag('pairs') ? { blindPairs: buildBlindPairs(runs, weight) } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nShadow runs loaded: ${runs.length}`);
  console.log(`AI weight:          ${summary.aiWeight}`);
  console.log(`Successful runs:    ${summary.successfulRuns} (comparable: ${summary.comparableRuns})`);
  console.log(`Cache hit rate:     ${pct(summary.cacheHitRate)}`);
  console.log(`Median latency:     ${summary.medianLatencyMs ?? 'n/a'} ms`);

  console.log(`\nAgreement`);
  console.log(`  Spearman rho:        ${num(summary.meanSpearman, 3)}`);
  console.log(`  Mean |rank delta|:   ${num(summary.meanAbsoluteRankDelta)}`);

  console.log(`\nImpact`);
  console.log(`  Top-slot divergence: ${pct(summary.topSlotDivergenceRate)}`);
  console.log(`  Rank-1 guard rate:   ${pct(summary.rankOneGuardRate)}`);

  const failures = Object.entries(summary.failureCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nFailures`);
  if (failures.length === 0) {
    console.log('  none');
  } else {
    for (const [category, count] of failures) {
      console.log(`  ${category.padEnd(24)} ${count}`);
    }
  }

  if (flag('sweep')) {
    console.log(`\nWeight sweep`);
    console.log(`  weight  spearman  meanDelta  topSlotDiv  guardRate`);
    for (const row of sweepAiWeights(runs)) {
      console.log(
        `  ${String(row.aiWeight).padEnd(7)} ${num(row.meanSpearman, 3).padEnd(9)} ` +
          `${num(row.meanAbsoluteRankDelta).padEnd(10)} ${pct(row.topSlotDivergenceRate).padEnd(11)} ` +
          `${pct(row.rankOneGuardRate)}`,
      );
    }
  }

  if (flag('pairs')) {
    const pairs = buildBlindPairs(runs, weight);
    console.log(`\nBlind pairs (${pairs.length}) — choose before reading any answer key`);
    for (const pair of pairs) {
      console.log(`  run ${pair.runId}: media ${pair.optionA}  vs  media ${pair.optionB}`);
    }
    console.log('\nAnswer keys appear in --json output only.');
  }

  const comparable = runs
    .filter(run => run.status === 'success')
    .map(run => compareOrders(run.deterministicOrder, run.aiOrder))
    .filter(Boolean).length;
  console.log(`\n(${comparable} runs contributed to agreement statistics)\n`);
}

void main();
