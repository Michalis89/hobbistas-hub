import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import {
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_PROMPT_VERSION,
  GAME_RERANK_SCHEMA_VERSION,
  type GameRerankRanking,
} from './types';

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

let missingCacheTableLogged = false;
let missingRunsTableLogged = false;

export async function readRerankCache(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
  rerankInputHash: string,
  model: string,
): Promise<GameRerankRanking | null> {
  const { data, error } = await supabase
    .from('ai_rerank_cache')
    .select('ranking, model, prompt_version, schema_version, payload_version')
    .eq('user_id', userId)
    .eq('category', category)
    .eq('rerank_input_hash', rerankInputHash)
    .maybeSingle();

  if (error) {
    logCacheError('read', error);
    return null;
  }

  if (
    !data ||
    data.model !== model ||
    data.prompt_version !== GAME_RERANK_PROMPT_VERSION ||
    data.schema_version !== GAME_RERANK_SCHEMA_VERSION ||
    data.payload_version !== GAME_RERANK_PAYLOAD_VERSION
  ) {
    return null;
  }

  return data.ranking as unknown as GameRerankRanking;
}

export async function writeRerankCache(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
  rerankInputHash: string,
  model: string,
  ranking: GameRerankRanking,
): Promise<boolean> {
  const { error } = await supabase.from('ai_rerank_cache').upsert(
    {
      user_id: userId,
      category,
      rerank_input_hash: rerankInputHash,
      ranking: ranking as unknown as Json,
      model,
      prompt_version: GAME_RERANK_PROMPT_VERSION,
      schema_version: GAME_RERANK_SCHEMA_VERSION,
      payload_version: GAME_RERANK_PAYLOAD_VERSION,
    },
    { onConflict: 'user_id,category,rerank_input_hash' },
  );

  if (error) {
    logCacheError('write', error);
    return false;
  }
  return true;
}

/** Append-only. Never throws: a lost observation must not disturb anything upstream. */
export async function writeShadowRun(
  supabase: SupabaseClient<Database>,
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
      logRunsError(error);
    }
  } catch (error) {
    logRunsError(error as { code?: string; message?: string });
  }
}

function logCacheError(operation: 'read' | 'write', error: { code?: string; message?: string }) {
  if (error.code === '42P01') {
    if (!missingCacheTableLogged) {
      missingCacheTableLogged = true;
      console.warn('[gaming-rerank] ai_rerank_cache missing; shadow runs continue uncached.');
    }
    return;
  }
  console.warn(`[gaming-rerank] cache ${operation} failed:`, error.message ?? error);
}

function logRunsError(error: { code?: string; message?: string }) {
  if (error.code === '42P01') {
    if (!missingRunsTableLogged) {
      missingRunsTableLogged = true;
      console.warn('[gaming-rerank] ai_rerank_shadow_runs missing; observations dropped.');
    }
    return;
  }
  console.warn('[gaming-rerank] shadow run write failed:', error.message ?? error);
}

/** Test seam. */
export function resetRerankCacheLogState(): void {
  missingCacheTableLogged = false;
  missingRunsTableLogged = false;
}
