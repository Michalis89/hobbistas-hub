import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { AiProviderHttpError, isAbortError } from '@/lib/ai/shared/provider/errors';
import { clampQuotaCooldown, CooldownRegistry } from '@/lib/ai/shared/runtime/cooldown';
import { InFlightRegistry } from '@/lib/ai/shared/runtime/in-flight';
import {
  readCachedTasteProfile,
  writeCachedTasteProfile,
} from '@/lib/ai/shared/cache/taste-profile-cache';
import type { TasteAiProvider } from './provider';
import type { TasteGenerationAdapter, TasteValidationFailure } from './adapter';

/**
 * One taste generation, for any category that supplies an adapter.
 *
 * The order of operations is load-bearing. The cache is read *before* the enable flag is checked,
 * so a profile already paid for still renders after the feature is switched off — turning the flag
 * off stops new spend, it does not blank the user's card. The sparse check comes next, because
 * asking a model to generalise from four titles spends a request to be told nothing. The in-flight
 * guard is claimed before the provider call, so a StrictMode double mount cannot pay twice.
 *
 * Every path returns null rather than throwing. The deterministic dashboard renders regardless;
 * an AI failure must never become a page failure.
 */

/**
 * Backoff after the provider itself fails — quota, 5xx, network, timeout.
 *
 * Nothing the app can do makes these recover sooner, so refusing to re-ask for a while is the only
 * way repeated dashboard loads stop spending requests we know will fail.
 */
export const TASTE_PROVIDER_COOLDOWN_MS = 12 * 60_000;

/**
 * Backoff after output failed validation.
 *
 * Deliberately much shorter than the provider cooldown: a schema or evidence miss is often
 * non-deterministic, and a code fix should take effect on the next reload.
 */
export const TASTE_VALIDATION_COOLDOWN_MS = 2 * 60_000;

export const TASTE_MIN_QUOTA_COOLDOWN_MS = TASTE_PROVIDER_COOLDOWN_MS;
/** Ceiling, so an extreme server hint cannot disable the feature for hours. */
export const TASTE_MAX_QUOTA_COOLDOWN_MS = 60 * 60_000;

const inFlightGenerations = new InFlightRegistry<unknown>();
const generationCooldowns = new CooldownRegistry();

/**
 * Test seam; also keeps the registries from leaking across suites.
 *
 * One registry pair for every category rather than one each. Keys are prefixed with the category
 * and built from an evidence hash that already folds in the model, so two categories cannot
 * collide — and a single pair means a new category cannot forget to reset.
 */
export function resetTasteGenerationRuntimeState(): void {
  inFlightGenerations.clear();
  generationCooldowns.clear();
}

export type TasteGenerationOptions<TEvidence> = {
  provider?: TasteAiProvider<TEvidence> | null;
  enabled?: boolean;
  model?: string;
  timeoutMs?: number;
};

export async function generateTasteProfile<THistory, TEvidence, TProfile, TEnriched>(
  adapter: TasteGenerationAdapter<THistory, TEvidence, TProfile, TEnriched>,
  supabase: SupabaseClient<Database>,
  userId: string,
  options: TasteGenerationOptions<TEvidence> = {},
): Promise<TEnriched | null> {
  const configured = adapter.resolveProvider();
  const provider = options.provider ?? configured.provider;
  const enabled = options.enabled ?? configured.enabled;
  const model = options.model ?? configured.model;
  const timeoutMs = options.timeoutMs ?? adapter.getTimeoutMs();

  const history = await adapter.loadHistory(supabase, userId);
  const evidence = adapter.buildEvidence(history);
  const inputHash = adapter.hashEvidence(evidence, model);

  const cached = await readCachedTasteProfile<TEnriched>(supabase, adapter.logScope, {
    userId,
    category: adapter.category,
    inputHash,
    model,
    promptVersion: adapter.promptVersion,
    schemaVersion: adapter.schemaVersion,
  });
  if (cached) {
    return cached;
  }

  if (!enabled || !provider || adapter.isSparse(evidence)) {
    return null;
  }

  const generationKey = `${adapter.category}:${userId}:${inputHash}`;

  const remainingCooldownMs = generationCooldowns.remainingMs(generationKey);
  if (remainingCooldownMs !== null) {
    console.warn(
      `[${adapter.logScope}] skipping generation; retrying in ${Math.ceil(
        remainingCooldownMs / 1000,
      )}s`,
    );
    return null;
  }

  return inFlightGenerations.run(generationKey, () =>
    runGeneration(adapter, {
      supabase,
      userId,
      evidence,
      inputHash,
      model,
      provider,
      timeoutMs,
      generationKey,
    }),
  ) as Promise<TEnriched | null>;
}

async function runGeneration<THistory, TEvidence, TProfile, TEnriched>(
  adapter: TasteGenerationAdapter<THistory, TEvidence, TProfile, TEnriched>,
  {
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
    evidence: TEvidence;
    inputHash: string;
    model: string;
    provider: TasteAiProvider<TEvidence>;
    timeoutMs: number;
    generationKey: string;
  },
): Promise<TEnriched | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Shared with the provider so it can decline a retry it has no time to finish, rather than being
  // cut off mid-flight and losing the first attempt's diagnosis with it.
  const deadlineAt = Date.now() + timeoutMs;

  try {
    const raw = await provider.generateProfile({
      evidence,
      model,
      signal: controller.signal,
      deadlineAt,
    });

    const validation = adapter.validate(raw, evidence);
    if (!validation.success) {
      logValidationFailure(adapter.logScope, validation);
      generationCooldowns.start(generationKey, TASTE_VALIDATION_COOLDOWN_MS);
      return null;
    }

    if (validation.droppedNegativeSignals.length > 0) {
      console.warn(
        `[${adapter.logScope}] dropped ${validation.droppedNegativeSignals.length} unsupported negative signal(s): ${validation.droppedNegativeSignals.join(', ')}`,
      );
    }

    // A success supersedes any earlier failure for this evidence.
    generationCooldowns.clearKey(generationKey);

    const enriched = adapter.enrich(validation.profile, evidence, model, inputHash);
    await writeCachedTasteProfile(supabase, adapter.logScope, {
      userId,
      category: adapter.category,
      inputHash,
      model,
      promptVersion: adapter.promptVersion,
      schemaVersion: adapter.schemaVersion,
      profile: enriched,
    });
    return enriched;
  } catch (error) {
    if (isAbortError(error)) {
      console.warn(`[${adapter.logScope}] generation timed out after ${timeoutMs}ms`);
      generationCooldowns.start(generationKey, TASTE_PROVIDER_COOLDOWN_MS);
      return null;
    }

    if (error instanceof AiProviderHttpError && error.isRateLimited) {
      const cooldownMs = clampQuotaCooldown(error.retryAfterMs, {
        min: TASTE_MIN_QUOTA_COOLDOWN_MS,
        max: TASTE_MAX_QUOTA_COOLDOWN_MS,
      });
      console.warn(
        `[${adapter.logScope}] provider quota exhausted; pausing generation for ${Math.round(
          cooldownMs / 60_000,
        )}min. Deterministic dashboard is unaffected.`,
      );
      generationCooldowns.start(generationKey, cooldownMs);
      return null;
    }

    console.warn(`[${adapter.logScope}] generation failed:`, (error as Error)?.message ?? error);
    generationCooldowns.start(generationKey, TASTE_PROVIDER_COOLDOWN_MS);
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
function logValidationFailure(logScope: string, failure: TasteValidationFailure): void {
  console.warn(`[${logScope}] rejected generation (${failure.category}): ${failure.reason}`);

  if (process.env.NODE_ENV === 'production' || !failure.issues?.length) {
    return;
  }

  for (const issue of failure.issues) {
    console.warn(
      `[${logScope}]   ${issue.path}: ${issue.code}, expected ${issue.expected}, received ${issue.receivedType}${
        issue.receivedCount === undefined ? '' : ` (${issue.receivedCount})`
      }`,
    );
  }
}
