import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  GamesContinuationContext,
  GamesDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/games/games-types';
import { selectDiscoveryPicks } from '@/lib/recommendations/v3/games/games-recommendation-engine';
import { loadCandidateSummaries } from '@/lib/recommendations/v3/games/games-recommender';
import { readClampedFloatEnv, readClampedIntEnv } from '@/lib/ai/shared/env';
import type { RerankShadowAdapter } from '@/lib/ai/shared/rank/shadow-adapter';
import { GAMES_AI_CATEGORY, GAMES_RERANK_LOG_SCOPE } from '../constants';
import { getConfiguredAiWeight, RANK_ONE_GUARD_MAX_POSITION } from './blend';
import { buildCandidatePayload } from './payload';
import { GAME_RERANK_HASH_VERSIONS } from './hash';
import { getConfiguredGameRerankProvider } from './provider';
import { readCachedTasteProfileForRerank } from './taste-source';
import {
  DEFAULT_GAME_RERANK_SHORTLIST_SIZE,
  GAME_RERANK_BLEND_VERSION,
  GAME_RERANK_CONTRACT,
  GAME_RERANK_MAX_SHORTLIST,
  GAME_RERANK_MIN_SHORTLIST,
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_PROMPT_VERSION,
  GAME_RERANK_SCHEMA_VERSION,
  type GameRerankCandidatePayload,
} from './types';

export const DEFAULT_GEMINI_RERANK_TIMEOUT_MS = 12_000;

export function getRerankTimeoutMs(): number {
  return readClampedIntEnv('GEMINI_RERANK_TIMEOUT_MS', {
    fallback: DEFAULT_GEMINI_RERANK_TIMEOUT_MS,
    min: 3_000,
    max: DEFAULT_GEMINI_RERANK_TIMEOUT_MS,
  });
}

export function getRerankShortlistSize(): number {
  return readClampedIntEnv('GAMES_RERANK_SHORTLIST_SIZE', {
    fallback: DEFAULT_GAME_RERANK_SHORTLIST_SIZE,
    min: GAME_RERANK_MIN_SHORTLIST,
    max: GAME_RERANK_MAX_SHORTLIST,
  });
}

export function getConfiguredSampleRate(): number {
  return readClampedFloatEnv('GAMES_RERANK_SHADOW_SAMPLE', { fallback: 1, min: 0, max: 1 });
}

/**
 * Everything games contributes to a shadow rerank.
 *
 * Read alongside `shared/rank/shadow-runner.ts`: the runner owns the spend gates, the cache, the
 * provider call and the observation row; this owns what a game *is* and how its discovery slots
 * were filled.
 */
export const gamesRerankShadowAdapter: RerankShadowAdapter<
  GamesDiscoveryShortlistEntry,
  GamesContinuationContext,
  GameRerankCandidatePayload
> = {
  category: GAMES_AI_CATEGORY,
  logScope: GAMES_RERANK_LOG_SCOPE,

  versions: { ...GAME_RERANK_HASH_VERSIONS, blendVersion: GAME_RERANK_BLEND_VERSION },
  cacheVersions: {
    promptVersion: GAME_RERANK_PROMPT_VERSION,
    schemaVersion: GAME_RERANK_SCHEMA_VERSION,
    payloadVersion: GAME_RERANK_PAYLOAD_VERSION,
  },
  contract: GAME_RERANK_CONTRACT,

  limits: {
    minShortlist: GAME_RERANK_MIN_SHORTLIST,
    maxShortlist: GAME_RERANK_MAX_SHORTLIST,
  },
  rankOneGuardMaxPosition: RANK_ONE_GUARD_MAX_POSITION,

  getShortlistSize: getRerankShortlistSize,
  getTimeoutMs: getRerankTimeoutMs,
  getSampleRate: getConfiguredSampleRate,
  getAiWeight: getConfiguredAiWeight,

  resolveProvider: getConfiguredGameRerankProvider,
  readTasteProfile: readCachedTasteProfileForRerank,

  getMediaId: entry => entry.candidate.id,
  getScore: entry => entry.score,

  /**
   * Summaries are loaded here rather than carried on the shortlist.
   *
   * The deterministic engine never needs a summary, so making the recommender fetch one for every
   * candidate would charge a query to the served path for the benefit of a shadow observation.
   */
  async buildCandidatePayloads(
    supabase: SupabaseClient<Database>,
    shortlist: readonly GamesDiscoveryShortlistEntry[],
    tokens: readonly string[],
  ): Promise<GameRerankCandidatePayload[]> {
    const summaries = await loadCandidateSummaries(
      supabase as never,
      shortlist.map(entry => entry.candidate.id),
    );
    return shortlist.map((entry, index) =>
      buildCandidatePayload(
        entry,
        tokens[index],
        summaries.get(entry.candidate.id) ?? entry.candidate.summary ?? null,
      ),
    );
  },

  replaySelection(blendedEntries, continuationContext) {
    return selectDiscoveryPicks(
      blendedEntries,
      new Set(continuationContext.chosenFamilyKeys),
      continuationContext.remainingDiscoverySlots,
    ).map(pick => pick.candidate.id);
  },
};
