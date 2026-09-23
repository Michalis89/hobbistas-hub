import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  GamesContinuationContext,
  GamesDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/games/games-types';
import {
  resetRerankShadowRuntimeState,
  runRerankShadow,
  type RerankShadowRunOptions,
} from '@/lib/ai/shared/rank/shadow-runner';
import { gamesRerankShadowAdapter } from './adapter';
import type { GameRerankCandidatePayload } from './types';

export {
  DEFAULT_GEMINI_RERANK_TIMEOUT_MS,
  getConfiguredSampleRate,
  getRerankShortlistSize,
  getRerankTimeoutMs,
} from './adapter';

export type GamesRerankShadowInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  shortlist: readonly GamesDiscoveryShortlistEntry[];
  continuationContext: GamesContinuationContext;
  /** Discovery media ids the user was actually shown, in slot order. */
  servedDiscoveryIds: readonly number[];
};

export type GamesRerankShadowOptions = RerankShadowRunOptions<GameRerankCandidatePayload>;

/**
 * Runs one games shadow rerank.
 *
 * Never returns anything the caller could act on, and never throws. This is called after the
 * user's response has already been sent, so its only outputs are a cache row and an observation.
 */
export async function runGamesRerankShadow(
  input: GamesRerankShadowInput,
  options: GamesRerankShadowOptions = {},
): Promise<void> {
  await runRerankShadow(gamesRerankShadowAdapter, input, options);
}

/** Test seam; also stops the shared registries leaking between suites. */
export function resetGameRerankRuntimeState(): void {
  resetRerankShadowRuntimeState();
}
