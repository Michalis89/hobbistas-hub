import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  PipelineContinuationContext,
  PipelineDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/pipeline/shadow-context';
import {
  resetRerankShadowRuntimeState,
  runRerankShadow,
  type RerankShadowRunOptions,
} from '@/lib/ai/shared/rank/shadow-runner';
import { mangaRerankShadowAdapter } from './adapter';
import type { MangaRerankCandidatePayload } from './types';

export {
  DEFAULT_GEMINI_MANGA_RERANK_TIMEOUT_MS,
  getConfiguredMangaSampleRate,
  getMangaRerankShortlistSize,
  getMangaRerankTimeoutMs,
} from './adapter';

export type MangaRerankShadowInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  shortlist: readonly PipelineDiscoveryShortlistEntry[];
  continuationContext: PipelineContinuationContext;
  /** Discovery media ids the user was actually shown, in slot order. */
  servedDiscoveryIds: readonly number[];
};

export type MangaRerankShadowOptions = RerankShadowRunOptions<MangaRerankCandidatePayload>;

/**
 * Runs one manga shadow rerank.
 *
 * Never returns anything the caller could act on, and never throws. This is called after the
 * user's response has already been sent, so its only outputs are a cache row and an observation.
 */
export async function runMangaRerankShadow(
  input: MangaRerankShadowInput,
  options: MangaRerankShadowOptions = {},
): Promise<void> {
  await runRerankShadow(mangaRerankShadowAdapter, input, options);
}

/** Test seam; also stops the shared registries leaking between suites. */
export function resetMangaRerankRuntimeState(): void {
  resetRerankShadowRuntimeState();
}
