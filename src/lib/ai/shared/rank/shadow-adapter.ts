import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { RerankCacheVersions } from '@/lib/ai/shared/cache/rerank-cache';
import type { RankingContractConfig } from './contract';
import type { RerankHashVersions } from './rerank-hash';
import type { RerankAiProvider } from './rerank-provider';
import type { RerankTasteProfileSource } from './taste-payload';

/**
 * What a category must supply to be reranked in shadow mode.
 *
 * Everything in the shadow run that is *not* here — cache lookup, in-flight dedupe, sampling, rate
 * limiting, cooldowns, the provider call, failure classification and the observation row — is the
 * same question asked about different nouns, and lives once in `shadow-runner.ts`.
 *
 * What remains genuinely per-category is small and concrete: where the shortlist comes from, what
 * a candidate looks like to a model, how the deterministic selection is replayed over an
 * alternative ordering, and which version stamps identify the contract.
 *
 * Three type parameters rather than one shared "media shortlist" shape. A category's shortlist
 * entry, its continuation bookkeeping and its candidate payload are all things it reasons about
 * differently; collapsing them would force every later category to pretend it reasons like games.
 */
export type RerankShadowAdapter<TShortlistEntry, TContinuationContext, TCandidate> = {
  /** Written into the cache key and the observation row. */
  category: string;
  logScope: string;

  versions: RerankHashVersions & { blendVersion: string };
  cacheVersions: RerankCacheVersions;
  contract: RankingContractConfig;

  limits: {
    /**
     * Smallest shortlist worth sending.
     *
     * Below three candidates there is almost nothing to rank: with two, the model's only choices
     * are "agree" or "swap", which produces a shadow signal dominated by noise while costing a
     * full request.
     */
    minShortlist: number;
    maxShortlist: number;
  };

  /** How far the deterministic top pick may fall before it counts as a guard trigger. */
  rankOneGuardMaxPosition: number;

  getShortlistSize(): number;
  getTimeoutMs(): number;
  getSampleRate(): number;
  getAiWeight(): number;

  /**
   * Resolves the configured provider.
   *
   * No silent model fallback: the model id is whatever is configured, is recorded on every shadow
   * run and is folded into the cache key. A shadow corpus whose rows cannot say which model
   * produced them is not evidence of anything.
   */
  resolveProvider(): {
    provider: RerankAiProvider<TCandidate> | null;
    model: string;
    enabled: boolean;
  };

  /**
   * Reads whatever taste profile is already stored, without generating one.
   *
   * Read-only by contract. Reranking must never be the thing that triggers a taste generation: the
   * two features would then share a spend path, a failure mode and a cooldown, and a rerank
   * experiment could quietly change how often the user's identity card regenerates.
   */
  readTasteProfile(
    supabase: SupabaseClient<Database>,
    userId: string,
  ): Promise<{ profile: RerankTasteProfileSource; inputHash: string } | null>;

  getMediaId(entry: TShortlistEntry): number;
  getScore(entry: TShortlistEntry): number;

  /**
   * Builds what the model actually sees, one entry per shortlist position.
   *
   * Receives the Supabase client because some categories enrich here (games loads summaries the
   * recommender never needed). Must return exactly one payload per shortlist entry, in order.
   */
  buildCandidatePayloads(
    supabase: SupabaseClient<Database>,
    shortlist: readonly TShortlistEntry[],
    tokens: readonly string[],
  ): Promise<TCandidate[]>;

  /**
   * Replays the deterministic selection over an alternative ordering.
   *
   * This is what makes the observation comparable: the blend's output goes through the *same*
   * franchise dedup and slot budget the served picks went through, so "what the blend would have
   * shown" is a like-for-like counterpart to what the user saw rather than just the blend's top
   * few. Must be pure and synchronous — nothing here may reach outside its arguments, which is
   * what keeps an alternative ordering from ever influencing the deterministic path.
   */
  replaySelection(
    blendedEntries: readonly TShortlistEntry[],
    continuationContext: TContinuationContext,
  ): number[];
};
