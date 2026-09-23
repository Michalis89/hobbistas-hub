import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  AnimeContinuationContext,
  AnimeDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/anime/anime-types';
import {
  resetRerankShadowRuntimeState,
  runRerankShadow,
  type RerankShadowRunOptions,
} from '@/lib/ai/shared/rank/shadow-runner';
import { animeRerankShadowAdapter } from './adapter';
import type { AnimeRerankCandidatePayload } from './types';

export {
  DEFAULT_GEMINI_ANIME_RERANK_TIMEOUT_MS,
  getAnimeRerankShortlistSize,
  getAnimeRerankTimeoutMs,
  getConfiguredAnimeSampleRate,
} from './adapter';

export type AnimeRerankShadowInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  shortlist: readonly AnimeDiscoveryShortlistEntry[];
  continuationContext: AnimeContinuationContext;
  /** Discovery media ids the user was actually shown, in slot order. */
  servedDiscoveryIds: readonly number[];
};

export type AnimeRerankShadowOptions = RerankShadowRunOptions<AnimeRerankCandidatePayload>;

/**
 * Runs one anime shadow rerank.
 *
 * Never returns anything the caller could act on, and never throws. This is called after the
 * user's response has already been sent, so its only outputs are a cache row and an observation.
 */
export async function runAnimeRerankShadow(
  input: AnimeRerankShadowInput,
  options: AnimeRerankShadowOptions = {},
): Promise<void> {
  await runRerankShadow(animeRerankShadowAdapter, input, options);
}

/** Test seam; also stops the shared registries leaking between suites. */
export function resetAnimeRerankRuntimeState(): void {
  resetRerankShadowRuntimeState();
}
