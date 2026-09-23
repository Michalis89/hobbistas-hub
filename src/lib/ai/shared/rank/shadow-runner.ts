import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { rateLimit } from '@/lib/rate-limit';
import { AiProviderHttpError, isAbortError } from '@/lib/ai/shared/provider/errors';
import { clampQuotaCooldown, CooldownRegistry } from '@/lib/ai/shared/runtime/cooldown';
import { InFlightRegistry } from '@/lib/ai/shared/runtime/in-flight';
import {
  readRerankCacheRow,
  writeRerankCacheRow,
  writeShadowRunRow,
  type ShadowRunRecord,
} from '@/lib/ai/shared/cache/rerank-cache';
import { blendRankOrders } from './blend';
import { computeRerankInputHashFor, computeShuffleSeedFor, hashPrefix } from './rerank-hash';
import { buildRerankRequestEnvelope } from './rerank-payload';
import { classifyRerankProviderError, type RerankAiProvider } from './rerank-provider';
import { validateRerankResult, type RerankRanking } from './rerank-validation';
import { buildRerankTastePayload, type RerankTastePayload } from './taste-payload';
import { buildRerankTokenMap, type RerankTokenMap } from './tokens';
import type { RerankShadowAdapter } from './shadow-adapter';

/**
 * One shadow rerank, for any category that supplies an adapter.
 *
 * Runs after the user's response has been flushed. Its only outputs are a cache row and an
 * observation row: it returns nothing a caller could act on, and it never throws.
 *
 * The order of operations is load-bearing and should not be rearranged casually. The in-flight
 * guard is claimed before the cache read, because registering it afterwards leaves a window in
 * which two identical requests both get through — exactly what a StrictMode double mount or a
 * double-fetch produces. Sampling is applied only *past* the cache, because a hit costs nothing
 * and is always worth recording. The rate limiter is consulted last, so a run that was going to be
 * free is never charged against the user's budget.
 */

/** Nothing the app does makes a provider failure recover sooner. */
export const RERANK_PROVIDER_COOLDOWN_MS = 12 * 60_000;
export const RERANK_VALIDATION_COOLDOWN_MS = 2 * 60_000;
export const RERANK_MIN_QUOTA_COOLDOWN_MS = RERANK_PROVIDER_COOLDOWN_MS;
export const RERANK_MAX_QUOTA_COOLDOWN_MS = 60 * 60_000;

const inFlightReranks = new InFlightRegistry<void>();
const rerankCooldowns = new CooldownRegistry();

/**
 * Test seam; also stops the registries leaking between suites.
 *
 * One registry pair for every category rather than one each. Keys are prefixed with the category
 * and built from a hash that already folds in the category's prompt and payload versions, so two
 * categories cannot collide — and a single pair means a new category cannot forget to reset.
 */
export function resetRerankShadowRuntimeState(): void {
  inFlightReranks.clear();
  rerankCooldowns.clear();
}

export type RerankShadowRunInput<TShortlistEntry, TContinuationContext> = {
  supabase: SupabaseClient<Database>;
  userId: string;
  shortlist: readonly TShortlistEntry[];
  continuationContext: TContinuationContext;
  /** Discovery media ids the user was actually shown, in slot order. */
  servedDiscoveryIds: readonly number[];
};

export type RerankShadowRunOptions<TCandidate> = {
  provider?: RerankAiProvider<TCandidate> | null;
  enabled?: boolean;
  model?: string;
  timeoutMs?: number;
  sampleRate?: number;
  shortlistSize?: number;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
};

export async function runRerankShadow<TShortlistEntry, TContinuationContext, TCandidate>(
  adapter: RerankShadowAdapter<TShortlistEntry, TContinuationContext, TCandidate>,
  input: RerankShadowRunInput<TShortlistEntry, TContinuationContext>,
  options: RerankShadowRunOptions<TCandidate> = {},
): Promise<void> {
  try {
    await runShadow(adapter, input, options);
  } catch (error) {
    // Belt and braces. Anything escaping here would surface as an unhandled rejection inside
    // after(), which is noise at best and a failed invocation at worst.
    console.warn(
      `[${adapter.logScope}] shadow run aborted:`,
      (error as Error)?.message ?? 'unknown',
    );
  }
}

async function runShadow<TShortlistEntry, TContinuationContext, TCandidate>(
  adapter: RerankShadowAdapter<TShortlistEntry, TContinuationContext, TCandidate>,
  {
    supabase,
    userId,
    shortlist: fullShortlist,
    continuationContext,
    servedDiscoveryIds,
  }: RerankShadowRunInput<TShortlistEntry, TContinuationContext>,
  options: RerankShadowRunOptions<TCandidate>,
): Promise<void> {
  // Trimmed once, here, so the tokens, the payload, the hash and the recorded orders all describe
  // the same candidate set. Truncating later would leave deterministic_order longer than ai_order
  // and quietly corrupt the blend.
  const shortlist = fullShortlist.slice(0, options.shortlistSize ?? adapter.getShortlistSize());
  const configured = adapter.resolveProvider();
  const enabled = options.enabled ?? configured.enabled;
  const provider = options.provider ?? configured.provider;
  const model = options.model ?? configured.model;

  // The feature being switched off is not an observation; write nothing at all.
  if (!enabled || !provider) {
    return;
  }

  const mediaIds = shortlist.map(entry => adapter.getMediaId(entry));

  const baseRun = (): ShadowRunRecord => ({
    userId,
    category: adapter.category,
    rerankInputHash: '',
    tasteInputHash: null,
    shortlistMediaIds: [...mediaIds],
    deterministicOrder: [...mediaIds],
    deterministicRawScores: shortlist.map(entry => adapter.getScore(entry)),
    aiOrder: [],
    blendedOrder: [],
    servedSlotMediaIds: [...servedDiscoveryIds],
    blendedSlotMediaIds: [],
    blendVersion: null,
    aiWeight: null,
    rationales: null,
    model,
    promptVersion: adapter.versions.promptVersion,
    latencyMs: null,
    status: 'skipped',
    failureCategory: null,
    cacheHit: false,
    rankOneGuardTriggered: false,
  });

  if (shortlist.length < adapter.limits.minShortlist) {
    await writeShadowRunRow(supabase, adapter.logScope, {
      ...baseRun(),
      failureCategory: 'shortlist_too_small',
    });
    return;
  }

  const cachedTaste = await adapter.readTasteProfile(supabase, userId);
  if (!cachedTaste) {
    await writeShadowRunRow(supabase, adapter.logScope, {
      ...baseRun(),
      failureCategory: 'no_taste_profile',
    });
    return;
  }
  if (cachedTaste.profile.dataQuality?.sufficiency === 'sparse') {
    await writeShadowRunRow(supabase, adapter.logScope, {
      ...baseRun(),
      tasteInputHash: cachedTaste.inputHash,
      failureCategory: 'sparse_taste_profile',
    });
    return;
  }

  const taste = buildRerankTastePayload(cachedTaste.profile);
  const tokenMap = buildRerankTokenMap(mediaIds, adapter.limits.maxShortlist);
  const candidates = await adapter.buildCandidatePayloads(supabase, shortlist, tokenMap.tokens);

  const rerankInputHash = computeRerankInputHashFor({
    tasteInputHash: cachedTaste.inputHash,
    taste,
    candidates,
    shortlistMediaIds: mediaIds,
    model,
    versions: adapter.versions,
  });

  const record = (overrides: Partial<ShadowRunRecord>): ShadowRunRecord => ({
    ...baseRun(),
    rerankInputHash,
    tasteInputHash: cachedTaste.inputHash,
    ...overrides,
  });

  // Claimed here, before any further awaits — see the module comment.
  const cooldownKey = `${adapter.category}:${userId}:${rerankInputHash}`;
  await inFlightReranks.run(cooldownKey, () =>
    resolveAndPersist(adapter, {
      supabase,
      userId,
      provider,
      model,
      taste,
      candidates,
      tokenMap,
      rerankInputHash,
      shortlist,
      continuationContext,
      record,
      timeoutMs: options.timeoutMs ?? adapter.getTimeoutMs(),
      cooldownKey,
      sampleRate: options.sampleRate ?? adapter.getSampleRate(),
      random: options.random ?? Math.random,
    }),
  );
}

type ProviderCallArgs<TShortlistEntry, TContinuationContext, TCandidate> = {
  supabase: SupabaseClient<Database>;
  userId: string;
  provider: RerankAiProvider<TCandidate>;
  model: string;
  taste: RerankTastePayload;
  candidates: TCandidate[];
  tokenMap: RerankTokenMap;
  rerankInputHash: string;
  shortlist: readonly TShortlistEntry[];
  continuationContext: TContinuationContext;
  record: (overrides: Partial<ShadowRunRecord>) => ShadowRunRecord;
  timeoutMs: number;
  cooldownKey: string;
};

type ResolveArgs<TShortlistEntry, TContinuationContext, TCandidate> = ProviderCallArgs<
  TShortlistEntry,
  TContinuationContext,
  TCandidate
> & {
  sampleRate: number;
  random: () => number;
};

/** Cache check, spend gates, then the provider call. Runs under the in-flight guard. */
async function resolveAndPersist<TShortlistEntry, TContinuationContext, TCandidate>(
  adapter: RerankShadowAdapter<TShortlistEntry, TContinuationContext, TCandidate>,
  args: ResolveArgs<TShortlistEntry, TContinuationContext, TCandidate>,
): Promise<void> {
  const { supabase, userId, model, rerankInputHash, shortlist, continuationContext, record } = args;

  const cached = await readRerankCacheRow<RerankRanking>(
    supabase,
    adapter.logScope,
    { userId, category: adapter.category, rerankInputHash, model },
    adapter.cacheVersions,
  );
  if (cached) {
    await persistBlendedRun(adapter, {
      supabase,
      shortlist,
      continuationContext,
      ranking: cached,
      record,
      cacheHit: true,
      latencyMs: null,
    });
    return;
  }

  // Sampling applies only past the cache: a hit costs nothing and is always worth recording.
  if (args.sampleRate < 1 && args.random() >= args.sampleRate) {
    return;
  }

  if (rerankCooldowns.remainingMs(args.cooldownKey) !== null) {
    return;
  }

  const limit = await rateLimit('aiRerank', userId);
  if (!limit.success) {
    await writeShadowRunRow(supabase, adapter.logScope, record({ failureCategory: 'rate_limited' }));
    return;
  }

  await callProviderAndPersist(adapter, args);
}

async function callProviderAndPersist<TShortlistEntry, TContinuationContext, TCandidate>(
  adapter: RerankShadowAdapter<TShortlistEntry, TContinuationContext, TCandidate>,
  {
    supabase,
    provider,
    model,
    taste,
    candidates,
    tokenMap,
    rerankInputHash,
    shortlist,
    continuationContext,
    record,
    timeoutMs,
    cooldownKey,
    userId,
  }: ProviderCallArgs<TShortlistEntry, TContinuationContext, TCandidate>,
): Promise<void> {
  const payload = buildRerankRequestEnvelope(
    adapter.versions.payloadVersion,
    taste,
    candidates,
    computeShuffleSeedFor(adapter.versions.shuffleSeedVersion, rerankInputHash),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const raw = await provider.rerank({
      payload,
      tokens: tokenMap.tokens,
      model,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;

    const validation = validateRerankResult(raw, tokenMap, adapter.contract);
    if (!validation.success) {
      console.warn(
        `[${adapter.logScope}] rejected ranking (${validation.category}) for ${hashPrefix(
          rerankInputHash,
        )}: ${validation.reason}`,
      );
      rerankCooldowns.start(cooldownKey, RERANK_VALIDATION_COOLDOWN_MS);
      await writeShadowRunRow(
        supabase,
        adapter.logScope,
        record({ status: 'failed', failureCategory: validation.category, latencyMs }),
      );
      return;
    }

    if (validation.normalizedRationales > 0) {
      console.warn(
        `[${adapter.logScope}] normalised ${validation.normalizedRationales} rationale(s) for ${hashPrefix(rerankInputHash)}`,
      );
    }

    rerankCooldowns.clearKey(cooldownKey);

    const cacheWritten = await writeRerankCacheRow(
      supabase,
      adapter.logScope,
      { userId, category: adapter.category, rerankInputHash, model },
      adapter.cacheVersions,
      validation.ranking,
    );

    await persistBlendedRun(adapter, {
      supabase,
      shortlist,
      continuationContext,
      ranking: validation.ranking,
      record,
      cacheHit: false,
      latencyMs,
      failureCategory: cacheWritten ? null : 'cache_write',
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    if (isAbortError(error)) {
      console.warn(`[${adapter.logScope}] provider timed out after ${timeoutMs}ms`);
      rerankCooldowns.start(cooldownKey, RERANK_PROVIDER_COOLDOWN_MS);
      await writeShadowRunRow(
        supabase,
        adapter.logScope,
        record({ status: 'failed', failureCategory: 'timeout', latencyMs }),
      );
      return;
    }

    if (error instanceof AiProviderHttpError && error.isRateLimited) {
      const cooldownMs = clampQuotaCooldown(error.retryAfterMs, {
        min: RERANK_MIN_QUOTA_COOLDOWN_MS,
        max: RERANK_MAX_QUOTA_COOLDOWN_MS,
      });
      console.warn(
        `[${adapter.logScope}] provider quota exhausted; pausing ${Math.round(cooldownMs / 60_000)}min.`,
      );
      rerankCooldowns.start(cooldownKey, cooldownMs);
      await writeShadowRunRow(
        supabase,
        adapter.logScope,
        record({ status: 'failed', failureCategory: 'quota', latencyMs }),
      );
      return;
    }

    // Message only — never the provider's response body.
    console.warn(
      `[${adapter.logScope}] provider call failed:`,
      (error as Error)?.message ?? 'unknown',
    );
    rerankCooldowns.start(cooldownKey, RERANK_PROVIDER_COOLDOWN_MS);
    await writeShadowRunRow(
      supabase,
      adapter.logScope,
      record({
        status: 'failed',
        failureCategory: classifyRerankProviderError(error),
        latencyMs,
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Blends, replays the deterministic selection over the blended order, and records the run.
 *
 * The replay is what makes the observation comparable: the blend's output goes through the same
 * selection rules the served picks went through, so `blendedSlotMediaIds` is a like-for-like
 * counterpart to `servedSlotMediaIds` rather than just the blend's top few.
 */
async function persistBlendedRun<TShortlistEntry, TContinuationContext, TCandidate>(
  adapter: RerankShadowAdapter<TShortlistEntry, TContinuationContext, TCandidate>,
  {
    supabase,
    shortlist,
    continuationContext,
    ranking,
    record,
    cacheHit,
    latencyMs,
    failureCategory = null,
  }: {
    supabase: SupabaseClient<Database>;
    shortlist: readonly TShortlistEntry[];
    continuationContext: TContinuationContext;
    ranking: RerankRanking;
    record: (overrides: Partial<ShadowRunRecord>) => ShadowRunRecord;
    cacheHit: boolean;
    latencyMs: number | null;
    failureCategory?: string | null;
  },
): Promise<void> {
  const deterministicOrder = shortlist.map(entry => adapter.getMediaId(entry));
  const blend = blendRankOrders({
    deterministicOrder,
    aiOrder: ranking.order,
    aiWeight: adapter.getAiWeight(),
    blendVersion: adapter.versions.blendVersion,
    rankOneGuardMaxPosition: adapter.rankOneGuardMaxPosition,
  });

  const byMediaId = new Map(shortlist.map(entry => [adapter.getMediaId(entry), entry]));
  const blendedEntries = blend.order
    .map(mediaId => byMediaId.get(mediaId))
    .filter((entry): entry is TShortlistEntry => entry !== undefined);

  await writeShadowRunRow(
    supabase,
    adapter.logScope,
    record({
      status: 'success',
      failureCategory,
      cacheHit,
      latencyMs,
      aiOrder: [...ranking.order],
      blendedOrder: blend.order,
      blendedSlotMediaIds: adapter.replaySelection(blendedEntries, continuationContext),
      blendVersion: blend.blendVersion,
      aiWeight: blend.aiWeight,
      rationales: ranking.rationales,
      rankOneGuardTriggered: blend.rankOneGuardTriggered,
    }),
  );
}
