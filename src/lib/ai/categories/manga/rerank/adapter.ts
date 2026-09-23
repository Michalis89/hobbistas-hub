import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  selectPipelineDiscoveryPicks,
  type PipelineContinuationContext,
  type PipelineDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/pipeline/shadow-context';
import { readClampedFloatEnv, readClampedIntEnv } from '@/lib/ai/shared/env';
import type { RerankShadowAdapter } from '@/lib/ai/shared/rank/shadow-adapter';
import { MANGA_AI_CATEGORY, MANGA_RERANK_LOG_SCOPE } from '../constants';
import { getConfiguredMangaAiWeight, MANGA_RANK_ONE_GUARD_MAX_POSITION } from './blend';
import { loadMangaCandidateDetails } from './candidate-details';
import { MANGA_RERANK_HASH_VERSIONS } from './hash';
import { buildMangaCandidatePayload } from './payload';
import { getConfiguredMangaRerankProvider } from './provider';
import { readCachedMangaTasteProfileForRerank } from './taste-source';
import {
  DEFAULT_MANGA_RERANK_SHORTLIST_SIZE,
  MANGA_RERANK_BLEND_VERSION,
  MANGA_RERANK_CONTRACT,
  MANGA_RERANK_MAX_SHORTLIST,
  MANGA_RERANK_MIN_SHORTLIST,
  MANGA_RERANK_PAYLOAD_VERSION,
  MANGA_RERANK_PROMPT_VERSION,
  MANGA_RERANK_SCHEMA_VERSION,
  type MangaRerankCandidatePayload,
} from './types';

/** Same 12s ceiling the other categories use; the route's `maxDuration` is sized around it. */
export const DEFAULT_GEMINI_MANGA_RERANK_TIMEOUT_MS = 12_000;

export function getMangaRerankTimeoutMs(): number {
  return readClampedIntEnv('GEMINI_MANGA_RERANK_TIMEOUT_MS', {
    fallback: DEFAULT_GEMINI_MANGA_RERANK_TIMEOUT_MS,
    min: 3_000,
    max: DEFAULT_GEMINI_MANGA_RERANK_TIMEOUT_MS,
  });
}

export function getMangaRerankShortlistSize(): number {
  return readClampedIntEnv('MANGA_RERANK_SHORTLIST_SIZE', {
    fallback: DEFAULT_MANGA_RERANK_SHORTLIST_SIZE,
    min: MANGA_RERANK_MIN_SHORTLIST,
    max: MANGA_RERANK_MAX_SHORTLIST,
  });
}

export function getConfiguredMangaSampleRate(): number {
  return readClampedFloatEnv('MANGA_RERANK_SHADOW_SAMPLE', { fallback: 1, min: 0, max: 1 });
}

/**
 * Everything manga contributes to a shadow rerank.
 *
 * The first adapter built on the *shared pipeline's* shadow context rather than on a bespoke
 * engine's. That is the whole difference from games and anime: manga has no engine of its own, so
 * its shortlist entries are pipeline `ScoredItem`s and its replay re-runs the cluster-diversity
 * selection instead of a franchise loop. Movies, tv and books will reuse this exact shape.
 */
export const mangaRerankShadowAdapter: RerankShadowAdapter<
  PipelineDiscoveryShortlistEntry,
  PipelineContinuationContext,
  MangaRerankCandidatePayload
> = {
  category: MANGA_AI_CATEGORY,
  logScope: MANGA_RERANK_LOG_SCOPE,

  versions: { ...MANGA_RERANK_HASH_VERSIONS, blendVersion: MANGA_RERANK_BLEND_VERSION },
  cacheVersions: {
    promptVersion: MANGA_RERANK_PROMPT_VERSION,
    schemaVersion: MANGA_RERANK_SCHEMA_VERSION,
    payloadVersion: MANGA_RERANK_PAYLOAD_VERSION,
  },
  contract: MANGA_RERANK_CONTRACT,

  limits: {
    minShortlist: MANGA_RERANK_MIN_SHORTLIST,
    maxShortlist: MANGA_RERANK_MAX_SHORTLIST,
  },
  rankOneGuardMaxPosition: MANGA_RANK_ONE_GUARD_MAX_POSITION,

  getShortlistSize: getMangaRerankShortlistSize,
  getTimeoutMs: getMangaRerankTimeoutMs,
  getSampleRate: getConfiguredMangaSampleRate,
  getAiWeight: getConfiguredMangaAiWeight,

  resolveProvider: getConfiguredMangaRerankProvider,
  readTasteProfile: readCachedMangaTasteProfileForRerank,

  getMediaId: entry => entry.item.mediaDbId,
  getScore: entry => entry.item.rawScore,

  async buildCandidatePayloads(
    supabase: SupabaseClient<Database>,
    shortlist: readonly PipelineDiscoveryShortlistEntry[],
    tokens: readonly string[],
  ): Promise<MangaRerankCandidatePayload[]> {
    const details = await loadMangaCandidateDetails(
      supabase,
      shortlist.map(entry => entry.item.mediaDbId),
    );
    return shortlist.map((entry, index) =>
      buildMangaCandidatePayload(entry, tokens[index], details.get(entry.item.mediaDbId)),
    );
  },

  replaySelection(blendedEntries, continuationContext) {
    return selectPipelineDiscoveryPicks(
      blendedEntries.map(entry => entry.item),
      continuationContext,
    ).map(pick => pick.mediaDbId);
  },
};
