import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  AnimeContinuationContext,
  AnimeDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/anime/anime-types';
import { selectAnimeDiscoveryPicks } from '@/lib/recommendations/v3/anime/anime-recommendation-engine';
import { readClampedFloatEnv, readClampedIntEnv } from '@/lib/ai/shared/env';
import type { RerankShadowAdapter } from '@/lib/ai/shared/rank/shadow-adapter';
import { ANIME_AI_CATEGORY, ANIME_RERANK_LOG_SCOPE } from '../constants';
import { ANIME_RANK_ONE_GUARD_MAX_POSITION, getConfiguredAnimeAiWeight } from './blend';
import { loadAnimeCandidateDetails } from './candidate-details';
import { ANIME_RERANK_HASH_VERSIONS } from './hash';
import { buildAnimeCandidatePayload } from './payload';
import { getConfiguredAnimeRerankProvider } from './provider';
import { readCachedAnimeTasteProfileForRerank } from './taste-source';
import {
  ANIME_RERANK_BLEND_VERSION,
  ANIME_RERANK_CONTRACT,
  ANIME_RERANK_MAX_SHORTLIST,
  ANIME_RERANK_MIN_SHORTLIST,
  ANIME_RERANK_PAYLOAD_VERSION,
  ANIME_RERANK_PROMPT_VERSION,
  ANIME_RERANK_SCHEMA_VERSION,
  DEFAULT_ANIME_RERANK_SHORTLIST_SIZE,
  type AnimeRerankCandidatePayload,
} from './types';

/**
 * Same 12s ceiling games settled on.
 *
 * It is not an arbitrary round number: it is what the `after()` budget leaves once the
 * deterministic response has been produced, and `maxDuration` on the serving route is sized around
 * it. Raising it here without raising that is how a shadow run gets killed mid-flight and recorded
 * as nothing at all.
 */
export const DEFAULT_GEMINI_ANIME_RERANK_TIMEOUT_MS = 12_000;

export function getAnimeRerankTimeoutMs(): number {
  return readClampedIntEnv('GEMINI_ANIME_RERANK_TIMEOUT_MS', {
    fallback: DEFAULT_GEMINI_ANIME_RERANK_TIMEOUT_MS,
    min: 3_000,
    max: DEFAULT_GEMINI_ANIME_RERANK_TIMEOUT_MS,
  });
}

export function getAnimeRerankShortlistSize(): number {
  return readClampedIntEnv('ANIME_RERANK_SHORTLIST_SIZE', {
    fallback: DEFAULT_ANIME_RERANK_SHORTLIST_SIZE,
    min: ANIME_RERANK_MIN_SHORTLIST,
    max: ANIME_RERANK_MAX_SHORTLIST,
  });
}

export function getConfiguredAnimeSampleRate(): number {
  return readClampedFloatEnv('ANIME_RERANK_SHADOW_SAMPLE', { fallback: 1, min: 0, max: 1 });
}

/**
 * Everything anime contributes to a shadow rerank.
 *
 * Read alongside `shared/rank/shadow-runner.ts`: the runner owns the spend gates, the cache, the
 * provider call and the observation row; this owns what an anime *is* and how its discovery slots
 * were filled.
 */
export const animeRerankShadowAdapter: RerankShadowAdapter<
  AnimeDiscoveryShortlistEntry,
  AnimeContinuationContext,
  AnimeRerankCandidatePayload
> = {
  category: ANIME_AI_CATEGORY,
  logScope: ANIME_RERANK_LOG_SCOPE,

  versions: { ...ANIME_RERANK_HASH_VERSIONS, blendVersion: ANIME_RERANK_BLEND_VERSION },
  cacheVersions: {
    promptVersion: ANIME_RERANK_PROMPT_VERSION,
    schemaVersion: ANIME_RERANK_SCHEMA_VERSION,
    payloadVersion: ANIME_RERANK_PAYLOAD_VERSION,
  },
  contract: ANIME_RERANK_CONTRACT,

  limits: {
    minShortlist: ANIME_RERANK_MIN_SHORTLIST,
    maxShortlist: ANIME_RERANK_MAX_SHORTLIST,
  },
  rankOneGuardMaxPosition: ANIME_RANK_ONE_GUARD_MAX_POSITION,

  getShortlistSize: getAnimeRerankShortlistSize,
  getTimeoutMs: getAnimeRerankTimeoutMs,
  getSampleRate: getConfiguredAnimeSampleRate,
  getAiWeight: getConfiguredAnimeAiWeight,

  resolveProvider: getConfiguredAnimeRerankProvider,
  readTasteProfile: readCachedAnimeTasteProfileForRerank,

  getMediaId: entry => entry.candidate.id,
  getScore: entry => entry.score,

  async buildCandidatePayloads(
    supabase: SupabaseClient<Database>,
    shortlist: readonly AnimeDiscoveryShortlistEntry[],
    tokens: readonly string[],
  ): Promise<AnimeRerankCandidatePayload[]> {
    const details = await loadAnimeCandidateDetails(
      supabase,
      shortlist.map(entry => entry.candidate.id),
    );
    return shortlist.map((entry, index) =>
      buildAnimeCandidatePayload(entry, tokens[index], details.get(entry.candidate.id)),
    );
  },

  replaySelection(blendedEntries, continuationContext) {
    return selectAnimeDiscoveryPicks(
      blendedEntries,
      new Set(continuationContext.chosenFamilyKeys),
      continuationContext.remainingDiscoverySlots,
    ).map(pick => pick.candidate.id);
  },
};
