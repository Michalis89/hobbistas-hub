import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  GamesContinuationContext,
  GamesDiscoveryShortlistEntry,
} from '@/lib/recommendations/v3/games/games-types';
import { selectDiscoveryPicks } from '@/lib/recommendations/v3/games/games-recommendation-engine';
import { loadCandidateSummaries } from '@/lib/recommendations/v3/games/games-recommender';
import { rateLimit } from '@/lib/rate-limit';
import {
  GAME_RERANK_MIN_SHORTLIST,
  GAME_RERANK_PROMPT_VERSION,
  type GameRerankRanking,
} from './types';
import {
  buildCandidatePayload,
  buildRerankRequestPayload,
  buildTastePayload,
  buildTokenMap,
} from './payload';
import { computeRerankInputHash, computeShuffleSeed, hashPrefix } from './hash';
import { validateGameRerankResult } from './validation';
import { blendOrders, getConfiguredAiWeight } from './blend';
import {
  getConfiguredGameRerankProvider,
  GeminiRerankProviderError,
  type GameRerankAiProvider,
} from './provider';
import {
  readRerankCache,
  writeRerankCache,
  writeShadowRun,
  type ShadowRunRecord,
} from './cache';
import { readCachedTasteProfileForRerank } from './taste-source';

export const DEFAULT_GEMINI_RERANK_TIMEOUT_MS = 12_000;

/** Same reasoning as Phase 1: nothing the app does makes a provider failure recover sooner. */
export const RERANK_PROVIDER_COOLDOWN_MS = 12 * 60_000;
export const RERANK_VALIDATION_COOLDOWN_MS = 2 * 60_000;
export const RERANK_MIN_QUOTA_COOLDOWN_MS = RERANK_PROVIDER_COOLDOWN_MS;
export const RERANK_MAX_QUOTA_COOLDOWN_MS = 60 * 60_000;

const inFlightReranks = new Map<string, Promise<void>>();
const rerankCooldowns = new Map<string, number>();

/** Test seam; also stops the maps leaking between suites. */
export function resetGameRerankRuntimeState(): void {
  inFlightReranks.clear();
  rerankCooldowns.clear();
}

export type GamesRerankShadowInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  shortlist: readonly GamesDiscoveryShortlistEntry[];
  continuationContext: GamesContinuationContext;
  /** Discovery media ids the user was actually shown, in slot order. */
  servedDiscoveryIds: readonly number[];
};

export type GamesRerankShadowOptions = {
  provider?: GameRerankAiProvider | null;
  enabled?: boolean;
  model?: string;
  timeoutMs?: number;
  sampleRate?: number;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
};

/**
 * Runs one shadow rerank.
 *
 * Never returns anything the caller could act on, and never throws. This is called after the
 * user's response has already been sent, so its only outputs are a cache row and an observation.
 */
export async function runGamesRerankShadow(
  input: GamesRerankShadowInput,
  options: GamesRerankShadowOptions = {},
): Promise<void> {
  try {
    await runShadow(input, options);
  } catch (error) {
    // Belt and braces. Anything escaping here would surface as an unhandled rejection inside
    // after(), which is noise at best and a failed invocation at worst.
    console.warn('[gaming-rerank] shadow run aborted:', (error as Error)?.message ?? 'unknown');
  }
}

async function runShadow(
  { supabase, userId, shortlist, continuationContext, servedDiscoveryIds }: GamesRerankShadowInput,
  options: GamesRerankShadowOptions,
): Promise<void> {
  const configured = getConfiguredGameRerankProvider();
  const enabled = options.enabled ?? configured.enabled;
  const provider = options.provider ?? configured.provider;
  const model = options.model ?? configured.model;

  // The feature being switched off is not an observation; write nothing at all.
  if (!enabled || !provider) {
    return;
  }

  const baseRun = (): ShadowRunRecord => ({
    userId,
    category: 'games',
    rerankInputHash: '',
    tasteInputHash: null,
    shortlistMediaIds: shortlist.map(entry => entry.candidate.id),
    deterministicOrder: shortlist.map(entry => entry.candidate.id),
    deterministicRawScores: shortlist.map(entry => entry.score),
    aiOrder: [],
    blendedOrder: [],
    servedSlotMediaIds: [...servedDiscoveryIds],
    blendedSlotMediaIds: [],
    blendVersion: null,
    aiWeight: null,
    rationales: null,
    model,
    promptVersion: GAME_RERANK_PROMPT_VERSION,
    latencyMs: null,
    status: 'skipped',
    failureCategory: null,
    cacheHit: false,
    rankOneGuardTriggered: false,
  });

  if (shortlist.length < GAME_RERANK_MIN_SHORTLIST) {
    await writeShadowRun(supabase, { ...baseRun(), failureCategory: 'shortlist_too_small' });
    return;
  }

  const cachedTaste = await readCachedTasteProfileForRerank(supabase, userId);
  if (!cachedTaste) {
    await writeShadowRun(supabase, { ...baseRun(), failureCategory: 'no_taste_profile' });
    return;
  }
  if (cachedTaste.profile.dataQuality?.sufficiency === 'sparse') {
    await writeShadowRun(supabase, {
      ...baseRun(),
      tasteInputHash: cachedTaste.inputHash,
      failureCategory: 'sparse_taste_profile',
    });
    return;
  }

  const taste = buildTastePayload(cachedTaste.profile);
  const tokenMap = buildTokenMap(shortlist);
  const summaries = await loadCandidateSummaries(
    supabase as never,
    shortlist.map(entry => entry.candidate.id),
  );
  const candidates = shortlist.map((entry, index) =>
    buildCandidatePayload(
      entry,
      tokenMap.tokens[index],
      summaries.get(entry.candidate.id) ?? entry.candidate.summary ?? null,
    ),
  );

  const rerankInputHash = computeRerankInputHash({
    tasteInputHash: cachedTaste.inputHash,
    taste,
    candidates,
    shortlistMediaIds: shortlist.map(entry => entry.candidate.id),
    model,
  });

  const record = (overrides: Partial<ShadowRunRecord>): ShadowRunRecord => ({
    ...baseRun(),
    rerankInputHash,
    tasteInputHash: cachedTaste.inputHash,
    ...overrides,
  });

  // The in-flight guard is claimed here, before any further awaits. Registering it after the
  // cache read or the rate-limit check would leave a window in which two identical requests both
  // get through — which is exactly what a StrictMode double mount or a double-fetch produces.
  const cooldownKey = `${userId}:${rerankInputHash}`;
  const alreadyRunning = inFlightReranks.get(cooldownKey);
  if (alreadyRunning) {
    await alreadyRunning;
    return;
  }

  const pending = resolveAndPersist({
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
    timeoutMs: options.timeoutMs ?? getRerankTimeoutMs(),
    cooldownKey,
    sampleRate: options.sampleRate ?? getConfiguredSampleRate(),
    random: options.random ?? Math.random,
  }).finally(() => {
    inFlightReranks.delete(cooldownKey);
  });

  inFlightReranks.set(cooldownKey, pending);
  await pending;
}

type ResolveArgs = Parameters<typeof callProviderAndPersist>[0] & {
  sampleRate: number;
  random: () => number;
};

/** Cache check, spend gates, then the provider call. Runs under the in-flight guard. */
async function resolveAndPersist(args: ResolveArgs): Promise<void> {
  const { supabase, userId, model, rerankInputHash, shortlist, continuationContext, record } = args;

  const cached = await readRerankCache(supabase, userId, 'games', rerankInputHash, model);
  if (cached) {
    await persistBlendedRun({
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

  const cooldownUntil = rerankCooldowns.get(args.cooldownKey);
  if (cooldownUntil !== undefined) {
    if (cooldownUntil > Date.now()) {
      return;
    }
    rerankCooldowns.delete(args.cooldownKey);
  }

  const limit = await rateLimit('aiRerank', userId);
  if (!limit.success) {
    await writeShadowRun(supabase, record({ failureCategory: 'rate_limited' }));
    return;
  }

  await callProviderAndPersist(args);
}

async function callProviderAndPersist({
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
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
  provider: GameRerankAiProvider;
  model: string;
  taste: ReturnType<typeof buildTastePayload>;
  candidates: ReturnType<typeof buildCandidatePayload>[];
  tokenMap: ReturnType<typeof buildTokenMap>;
  rerankInputHash: string;
  shortlist: readonly GamesDiscoveryShortlistEntry[];
  continuationContext: GamesContinuationContext;
  record: (overrides: Partial<ShadowRunRecord>) => ShadowRunRecord;
  timeoutMs: number;
  cooldownKey: string;
}): Promise<void> {
  const payload = buildRerankRequestPayload(
    taste,
    candidates,
    computeShuffleSeed(rerankInputHash),
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

    const validation = validateGameRerankResult(raw, tokenMap);
    if (!validation.success) {
      console.warn(
        `[gaming-rerank] rejected ranking (${validation.category}) for ${hashPrefix(
          rerankInputHash,
        )}: ${validation.reason}`,
      );
      startCooldown(cooldownKey, RERANK_VALIDATION_COOLDOWN_MS);
      await writeShadowRun(
        supabase,
        record({ status: 'failed', failureCategory: validation.category, latencyMs }),
      );
      return;
    }

    if (validation.normalizedRationales > 0) {
      console.warn(
        `[gaming-rerank] normalised ${validation.normalizedRationales} rationale(s) for ${hashPrefix(rerankInputHash)}`,
      );
    }

    rerankCooldowns.delete(cooldownKey);

    const cacheWritten = await writeRerankCache(
      supabase,
      userId,
      'games',
      rerankInputHash,
      model,
      validation.ranking,
    );

    await persistBlendedRun({
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
      console.warn(`[gaming-rerank] provider timed out after ${timeoutMs}ms`);
      startCooldown(cooldownKey, RERANK_PROVIDER_COOLDOWN_MS);
      await writeShadowRun(
        supabase,
        record({ status: 'failed', failureCategory: 'timeout', latencyMs }),
      );
      return;
    }

    if (error instanceof GeminiRerankProviderError && error.isRateLimited) {
      const cooldownMs = clampQuotaCooldown(error.retryAfterMs);
      console.warn(
        `[gaming-rerank] provider quota exhausted; pausing ${Math.round(cooldownMs / 60_000)}min.`,
      );
      startCooldown(cooldownKey, cooldownMs);
      await writeShadowRun(
        supabase,
        record({ status: 'failed', failureCategory: 'quota', latencyMs }),
      );
      return;
    }

    // Message only — never the provider's response body.
    console.warn('[gaming-rerank] provider call failed:', (error as Error)?.message ?? 'unknown');
    startCooldown(cooldownKey, RERANK_PROVIDER_COOLDOWN_MS);
    const category = error instanceof Error && error.name === 'GeminiRerankJsonError'
      ? 'malformed_json'
      : 'provider';
    await writeShadowRun(
      supabase,
      record({ status: 'failed', failureCategory: category, latencyMs }),
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Blends, replays the deterministic selection over the blended order, and records the run.
 *
 * The replay is the part that makes the observation comparable: it applies the *same* franchise
 * dedup and slot budget the served picks went through, so "what the blend would have shown" is a
 * like-for-like counterpart to `servedSlotMediaIds` rather than just the blend's top few.
 */
async function persistBlendedRun({
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
  shortlist: readonly GamesDiscoveryShortlistEntry[];
  continuationContext: GamesContinuationContext;
  ranking: GameRerankRanking;
  record: (overrides: Partial<ShadowRunRecord>) => ShadowRunRecord;
  cacheHit: boolean;
  latencyMs: number | null;
  failureCategory?: string | null;
}): Promise<void> {
  const deterministicOrder = shortlist.map(entry => entry.candidate.id);
  const aiWeight = getConfiguredAiWeight();
  const blend = blendOrders({ deterministicOrder, aiOrder: ranking.order, aiWeight });

  const byMediaId = new Map(shortlist.map(entry => [entry.candidate.id, entry]));
  const blendedEntries = blend.order
    .map(mediaId => byMediaId.get(mediaId))
    .filter((entry): entry is GamesDiscoveryShortlistEntry => entry !== undefined);

  const blendedPicks = selectDiscoveryPicks(
    blendedEntries,
    new Set(continuationContext.chosenFamilyKeys),
    continuationContext.remainingDiscoverySlots,
  );

  await writeShadowRun(
    supabase,
    record({
      status: 'success',
      failureCategory,
      cacheHit,
      latencyMs,
      aiOrder: [...ranking.order],
      blendedOrder: blend.order,
      blendedSlotMediaIds: blendedPicks.map(pick => pick.candidate.id),
      blendVersion: blend.blendVersion,
      aiWeight: blend.aiWeight,
      rationales: ranking.rationales,
      rankOneGuardTriggered: blend.rankOneGuardTriggered,
    }),
  );
}

function startCooldown(key: string, cooldownMs: number): void {
  rerankCooldowns.set(key, Date.now() + cooldownMs);
}

function clampQuotaCooldown(retryAfterMs: number | null): number {
  if (retryAfterMs === null) {
    return RERANK_MIN_QUOTA_COOLDOWN_MS;
  }
  return Math.min(
    Math.max(retryAfterMs, RERANK_MIN_QUOTA_COOLDOWN_MS),
    RERANK_MAX_QUOTA_COOLDOWN_MS,
  );
}

export function getRerankTimeoutMs(): number {
  const configured = Number(process.env.GEMINI_RERANK_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_GEMINI_RERANK_TIMEOUT_MS;
  }
  return Math.max(3_000, Math.min(Math.floor(configured), DEFAULT_GEMINI_RERANK_TIMEOUT_MS));
}

export function getConfiguredSampleRate(): number {
  const configured = Number(process.env.GAMES_RERANK_SHADOW_SAMPLE);
  if (!Number.isFinite(configured)) {
    return 1;
  }
  return Math.max(0, Math.min(configured, 1));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException ||
      (typeof error === 'object' && error !== null && 'name' in error)) &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
