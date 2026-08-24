import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { logCacheFailure } from './log';

/**
 * Storage for reranking: one spend gate and one observation log.
 *
 * `ai_rerank_cache` holds one live row per (user, category, input hash) — if the provider has
 * already answered this exact question, do not ask again. `ai_rerank_shadow_runs` is append-only,
 * one row per execution including cache hits and failures, and is the evidence base for deciding
 * whether reranking is worth showing anyone.
 *
 * Both tables carry `category` already, so a second category needs no migration. The `ranking`
 * blob and the meaning of `failure_category` remain the caller's business.
 */

export type RerankCacheVersions = {
  promptVersion: string;
  schemaVersion: number;
  payloadVersion: string;
};

export type RerankCacheKey = {
  userId: string;
  category: string;
  rerankInputHash: string;
  model: string;
};

export type ShadowRunRecord = {
  userId: string;
  category: string;
  rerankInputHash: string;
  tasteInputHash: string | null;
  shortlistMediaIds: number[];
  deterministicOrder: number[];
  deterministicRawScores: number[];
  aiOrder: number[];
  blendedOrder: number[];
  servedSlotMediaIds: number[];
  blendedSlotMediaIds: number[];
  blendVersion: string | null;
  aiWeight: number | null;
  rationales: Record<number, string> | null;
  model: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  status: 'success' | 'skipped' | 'failed';
  failureCategory: string | null;
  cacheHit: boolean;
  rankOneGuardTriggered: boolean;
};

const MISSING_CACHE_TABLE = {
  key: 'ai_rerank_cache',
  message: 'ai_rerank_cache missing; shadow runs continue uncached.',
};

const MISSING_RUNS_TABLE = {
  key: 'ai_rerank_shadow_runs',
  message: 'ai_rerank_shadow_runs missing; observations dropped.',
};

export async function readRerankCacheRow<TRanking>(
  supabase: SupabaseClient<Database>,
  scope: string,
  key: RerankCacheKey,
  versions: RerankCacheVersions,
): Promise<TRanking | null> {
  const { data, error } = await supabase
    .from('ai_rerank_cache')
    .select('ranking, model, prompt_version, schema_version, payload_version')
    .eq('user_id', key.userId)
    .eq('category', key.category)
    .eq('rerank_input_hash', key.rerankInputHash)
    .maybeSingle();

  if (error) {
    logCacheFailure({ scope, label: 'cache read', error, missingTable: MISSING_CACHE_TABLE });
    return null;
  }

  if (
    !data ||
    data.model !== key.model ||
    data.prompt_version !== versions.promptVersion ||
    data.schema_version !== versions.schemaVersion ||
    data.payload_version !== versions.payloadVersion
  ) {
    return null;
  }

  return data.ranking as unknown as TRanking;
}

export async function writeRerankCacheRow(
  supabase: SupabaseClient<Database>,
  scope: string,
  key: RerankCacheKey,
  versions: RerankCacheVersions,
  ranking: unknown,
): Promise<boolean> {
  const { error } = await supabase.from('ai_rerank_cache').upsert(
    {
      user_id: key.userId,
      category: key.category,
      rerank_input_hash: key.rerankInputHash,
      ranking: ranking as Json,
      model: key.model,
      prompt_version: versions.promptVersion,
      schema_version: versions.schemaVersion,
      payload_version: versions.payloadVersion,
    },
    { onConflict: 'user_id,category,rerank_input_hash' },
  );

  if (error) {
    logCacheFailure({ scope, label: 'cache write', error, missingTable: MISSING_CACHE_TABLE });
    return false;
  }
  return true;
}

/** Append-only. Never throws: a lost observation must not disturb anything upstream. */
export async function writeShadowRunRow(
  supabase: SupabaseClient<Database>,
  scope: string,
  run: ShadowRunRecord,
): Promise<void> {
  try {
    const { error } = await supabase.from('ai_rerank_shadow_runs').insert({
      user_id: run.userId,
      category: run.category,
      rerank_input_hash: run.rerankInputHash,
      taste_input_hash: run.tasteInputHash,
      shortlist_media_ids: run.shortlistMediaIds,
      deterministic_order: run.deterministicOrder,
      deterministic_raw_scores: run.deterministicRawScores,
      ai_order: run.aiOrder,
      blended_order: run.blendedOrder,
      served_slot_media_ids: run.servedSlotMediaIds,
      blended_slot_media_ids: run.blendedSlotMediaIds,
      blend_version: run.blendVersion,
      ai_weight: run.aiWeight,
      rationales: (run.rationales ?? null) as unknown as Json,
      model: run.model,
      prompt_version: run.promptVersion,
      latency_ms: run.latencyMs,
      status: run.status,
      failure_category: run.failureCategory,
      cache_hit: run.cacheHit,
      rank_one_guard_triggered: run.rankOneGuardTriggered,
    });

    if (error) {
      logCacheFailure({
        scope,
        label: 'shadow run write',
        error,
        missingTable: MISSING_RUNS_TABLE,
      });
    }
  } catch (error) {
    logCacheFailure({
      scope,
      label: 'shadow run write',
      error: error as { code?: string; message?: string },
      missingTable: MISSING_RUNS_TABLE,
    });
  }
}
