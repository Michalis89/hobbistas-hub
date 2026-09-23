import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { readClampedIntEnv } from '@/lib/ai/shared/env';
import { isAbortError } from '@/lib/ai/shared/provider/errors';
import { clampQuotaCooldown, CooldownRegistry } from '@/lib/ai/shared/runtime/cooldown';
import { InFlightRegistry } from '@/lib/ai/shared/runtime/in-flight';
import { ANIME_TASTE_LOG_SCOPE } from '../constants';
import { readCachedAnimeAiTasteProfile, writeCachedAnimeAiTasteProfile } from './cache';
import { buildAnimeAiEvidenceDocument, hashAnimeAiEvidence } from './evidence';
import { loadAnimeHistory } from './history';
import {
  getConfiguredAnimeTasteProvider,
  GeminiAnimeTasteProviderError,
  type AnimeTasteAiProvider,
} from './provider';
import {
  ANIME_AI_TASTE_PROMPT_VERSION,
  ANIME_AI_TASTE_SCHEMA_VERSION,
  type AnimeAiEvidenceDocument,
  type EnrichedAiAnimeTasteProfile,
} from './types';
import {
  enrichAiAnimeTasteProfile,
  validateAiAnimeTasteProfile,
  type AnimeAiValidationFailure,
} from './validation';

/**
 * Budget for a whole anime generation, including a structural retry.
 *
 * Higher than the games equivalent because the anime path can legitimately need two provider
 * calls: Gemini treats string-length bounds in `responseSchema` as advisory, so an over-long
 * description slips through constrained decoding and is caught only by Zod. The first live run
 * spent its whole 20s budget that way and timed out mid-retry, producing no profile and a
 * twelve-minute cooldown.
 *
 * The cost is paid once. A profile that takes thirty seconds to arrive and is then cached beats
 * one that fails in twenty and is not.
 */
export const DEFAULT_GEMINI_ANIME_TASTE_TIMEOUT_MS = 35_000;

/**
 * Backoff after the provider itself fails — quota, 5xx, network, timeout.
 *
 * Nothing the app can do makes these recover sooner, so refusing to re-ask for a while is the
 * only way repeated dashboard loads stop spending requests we know will fail.
 */
export const ANIME_AI_TASTE_PROVIDER_COOLDOWN_MS = 12 * 60_000;

/**
 * Backoff after output failed validation.
 *
 * Deliberately much shorter than the provider cooldown: a schema or evidence miss is often
 * non-deterministic, and a code fix should take effect on the next reload.
 */
export const ANIME_AI_TASTE_VALIDATION_COOLDOWN_MS = 2 * 60_000;

export const ANIME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS = ANIME_AI_TASTE_PROVIDER_COOLDOWN_MS;
/** Ceiling, so an extreme server hint cannot disable the feature for hours. */
export const ANIME_AI_TASTE_MAX_QUOTA_COOLDOWN_MS = 60 * 60_000;

/**
 * Runtime registries, separate instances from the games ones.
 *
 * Separate on purpose rather than shared by key prefix: an anime quota failure must not put the
 * games card into cooldown, and the two features are independently switchable.
 */
const inFlightGenerations = new InFlightRegistry<EnrichedAiAnimeTasteProfile | null>();
const generationCooldowns = new CooldownRegistry();

/** Test seam; also keeps the registries from leaking across suites. */
export function resetAnimeAiTasteRuntimeState(): void {
  inFlightGenerations.clear();
  generationCooldowns.clear();
}

export type GenerateAnimeAiTasteProfileOptions = {
  provider?: AnimeTasteAiProvider | null;
  enabled?: boolean;
  model?: string;
  timeoutMs?: number;
};

export async function generateAnimeAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateAnimeAiTasteProfileOptions = {},
): Promise<EnrichedAiAnimeTasteProfile | null> {
  const configured = getConfiguredAnimeTasteProvider();
  const provider = options.provider ?? configured.provider;
  const enabled = options.enabled ?? configured.enabled;
  const model = options.model ?? configured.model;
  const timeoutMs = options.timeoutMs ?? getAnimeTasteTimeoutMs();

  const history = await loadAnimeHistory(supabase, userId);
  const evidence = buildAnimeAiEvidenceDocument(history);
  const inputHash = hashAnimeAiEvidence(evidence, model);

  const cached = await readCachedAnimeAiTasteProfile(
    supabase,
    userId,
    inputHash,
    model,
    ANIME_AI_TASTE_PROMPT_VERSION,
    ANIME_AI_TASTE_SCHEMA_VERSION,
  );
  if (cached) {
    return cached;
  }

  if (!enabled || !provider || evidence.dataQuality.sufficiency === 'sparse') {
    return null;
  }

  const generationKey = `${userId}:${inputHash}`;

  const remainingCooldownMs = generationCooldowns.remainingMs(generationKey);
  if (remainingCooldownMs !== null) {
    console.warn(
      `[${ANIME_TASTE_LOG_SCOPE}] skipping generation; retrying in ${Math.ceil(
        remainingCooldownMs / 1000,
      )}s`,
    );
    return null;
  }

  return inFlightGenerations.run(generationKey, () =>
    runGeneration({
      supabase,
      userId,
      evidence,
      inputHash,
      model,
      provider,
      timeoutMs,
      generationKey,
    }),
  );
}

async function runGeneration({
  supabase,
  userId,
  evidence,
  inputHash,
  model,
  provider,
  timeoutMs,
  generationKey,
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
  evidence: AnimeAiEvidenceDocument;
  inputHash: string;
  model: string;
  provider: AnimeTasteAiProvider;
  timeoutMs: number;
  generationKey: string;
}): Promise<EnrichedAiAnimeTasteProfile | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Shared with the provider so it can decline a retry it has no time to finish, rather than
  // being cut off mid-flight and losing the first attempt's diagnosis with it.
  const deadlineAt = Date.now() + timeoutMs;

  try {
    const raw = await provider.generateProfile({
      evidence,
      model,
      signal: controller.signal,
      deadlineAt,
    });
    const validation = validateAiAnimeTasteProfile(raw, evidence);
    if (!validation.success) {
      logValidationFailure(validation);
      generationCooldowns.start(generationKey, ANIME_AI_TASTE_VALIDATION_COOLDOWN_MS);
      return null;
    }

    if (validation.droppedNegativeSignals.length > 0) {
      console.warn(
        `[${ANIME_TASTE_LOG_SCOPE}] dropped ${validation.droppedNegativeSignals.length} unsupported negative signal(s): ${validation.droppedNegativeSignals.join(', ')}`,
      );
    }

    // A success supersedes any earlier failure for this evidence.
    generationCooldowns.clearKey(generationKey);

    const enriched = enrichAiAnimeTasteProfile(validation.profile, evidence, model, inputHash);
    await writeCachedAnimeAiTasteProfile(
      supabase,
      userId,
      enriched,
      ANIME_AI_TASTE_PROMPT_VERSION,
      ANIME_AI_TASTE_SCHEMA_VERSION,
    );
    return enriched;
  } catch (error) {
    if (isAbortError(error)) {
      console.warn(`[${ANIME_TASTE_LOG_SCOPE}] generation timed out after ${timeoutMs}ms`);
      generationCooldowns.start(generationKey, ANIME_AI_TASTE_PROVIDER_COOLDOWN_MS);
      return null;
    }

    if (error instanceof GeminiAnimeTasteProviderError && error.isRateLimited) {
      const cooldownMs = clampQuotaCooldown(error.retryAfterMs, {
        min: ANIME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS,
        max: ANIME_AI_TASTE_MAX_QUOTA_COOLDOWN_MS,
      });
      console.warn(
        `[${ANIME_TASTE_LOG_SCOPE}] provider quota exhausted; pausing generation for ${Math.round(
          cooldownMs / 60_000,
        )}min. Deterministic dashboard is unaffected.`,
      );
      generationCooldowns.start(generationKey, cooldownMs);
      return null;
    }

    console.warn(`[${ANIME_TASTE_LOG_SCOPE}] generation failed:`, error);
    generationCooldowns.start(generationKey, ANIME_AI_TASTE_PROVIDER_COOLDOWN_MS);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Logs why a generation was rejected, at two levels of detail.
 *
 * Production gets the stage and the rule name only. Development additionally gets the per-issue
 * breakdown. Neither level emits generated text, evidence titles, prompt content or credentials.
 */
function logValidationFailure(failure: AnimeAiValidationFailure): void {
  console.warn(
    `[${ANIME_TASTE_LOG_SCOPE}] rejected generation (${failure.category}): ${failure.reason}`,
  );

  if (process.env.NODE_ENV === 'production' || !failure.issues?.length) {
    return;
  }

  for (const issue of failure.issues) {
    console.warn(
      `[${ANIME_TASTE_LOG_SCOPE}]   ${issue.path}: ${issue.code}, expected ${issue.expected}, received ${issue.receivedType}${
        issue.receivedCount === undefined ? '' : ` (${issue.receivedCount})`
      }`,
    );
  }
}

export function getAnimeTasteTimeoutMs(): number {
  return readClampedIntEnv('GEMINI_ANIME_TASTE_TIMEOUT_MS', {
    fallback: DEFAULT_GEMINI_ANIME_TASTE_TIMEOUT_MS,
    min: 5_000,
    max: 60_000,
  });
}
