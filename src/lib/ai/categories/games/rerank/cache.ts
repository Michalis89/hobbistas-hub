import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  readRerankCacheRow,
  writeRerankCacheRow,
  writeShadowRunRow,
  type RerankCacheVersions,
  type ShadowRunRecord,
} from '@/lib/ai/shared/cache/rerank-cache';
import { resetCacheLogState } from '@/lib/ai/shared/cache/log';
import { GAMES_RERANK_LOG_SCOPE } from '../constants';
import {
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_PROMPT_VERSION,
  GAME_RERANK_SCHEMA_VERSION,
  type GameRerankRanking,
} from './types';

export type { ShadowRunRecord };

/**
 * Games binding for the shared rerank storage.
 *
 * The category still travels as a parameter rather than being baked in here: the shadow service
 * writes the same value into the cache key and the observation row, and threading it keeps those
 * two from drifting if a second category ever reuses this service shape.
 */
const GAME_RERANK_CACHE_VERSIONS: RerankCacheVersions = {
  promptVersion: GAME_RERANK_PROMPT_VERSION,
  schemaVersion: GAME_RERANK_SCHEMA_VERSION,
  payloadVersion: GAME_RERANK_PAYLOAD_VERSION,
};

export async function readRerankCache(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
  rerankInputHash: string,
  model: string,
): Promise<GameRerankRanking | null> {
  return readRerankCacheRow<GameRerankRanking>(
    supabase,
    GAMES_RERANK_LOG_SCOPE,
    { userId, category, rerankInputHash, model },
    GAME_RERANK_CACHE_VERSIONS,
  );
}

export async function writeRerankCache(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
  rerankInputHash: string,
  model: string,
  ranking: GameRerankRanking,
): Promise<boolean> {
  return writeRerankCacheRow(
    supabase,
    GAMES_RERANK_LOG_SCOPE,
    { userId, category, rerankInputHash, model },
    GAME_RERANK_CACHE_VERSIONS,
    ranking,
  );
}

/** Append-only. Never throws: a lost observation must not disturb anything upstream. */
export async function writeShadowRun(
  supabase: SupabaseClient<Database>,
  run: ShadowRunRecord,
): Promise<void> {
  await writeShadowRunRow(supabase, GAMES_RERANK_LOG_SCOPE, run);
}

/** Test seam. */
export function resetRerankCacheLogState(): void {
  resetCacheLogState();
}
