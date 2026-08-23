import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { loadUserMediaHistory } from '@/lib/recommendations/v3/games/games-recommender';
import { buildGameAiEvidenceDocument, hashGameAiEvidence } from './evidence';
import {
  GAME_AI_TASTE_PROMPT_VERSION,
  GAME_AI_TASTE_SCHEMA_VERSION,
  type EnrichedAiGamingTasteProfile,
} from './types';
import { readCachedGameAiTasteProfile, writeCachedGameAiTasteProfile } from './cache';
import {
  getConfiguredGameTasteProvider,
  GeminiTasteProviderError,
  type GameTasteAiProvider,
} from './provider';
import {
  enrichAiGamingTasteProfile,
  validateAiGamingTasteProfile,
  type GameAiValidationFailure,
} from './validation';

export const DEFAULT_GEMINI_TASTE_TIMEOUT_MS = 20_000;

/**
 * Backoff after the provider itself fails — quota, 5xx, network, timeout.
 *
 * Nothing the app can do makes these recover sooner, so refusing to re-ask for a while is the
 * only way repeated dashboard loads stop spending requests we know will fail.
 */
export const GAME_AI_TASTE_PROVIDER_COOLDOWN_MS = 12 * 60_000;

/**
 * Backoff after output failed validation.
 *
 * Deliberately much shorter than the provider cooldown: a schema or evidence miss is often
 * non-deterministic, and a code fix should take effect on the next reload rather than being
 * masked for a quarter of an hour.
 */
export const GAME_AI_TASTE_VALIDATION_COOLDOWN_MS = 2 * 60_000;

/**
 * Floor for a quota backoff.
 *
 * Gemini's `retryDelay` on a *daily* free-tier quota reports tens of seconds, which is not a real
 * reset — honouring it literally would re-ask every minute for the rest of the day.
 */
export const GAME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS = GAME_AI_TASTE_PROVIDER_COOLDOWN_MS;
/** Ceiling, so an extreme server hint cannot disable the feature for hours. */
export const GAME_AI_TASTE_MAX_QUOTA_COOLDOWN_MS = 60 * 60_000;

/**
 * Generations already running, keyed by user + evidence hash.
 *
 * The dashboard mounts the AI section twice under React StrictMode, so two identical requests
 * arrive concurrently and each used to spend its own provider call. Sharing the in-flight promise
 * halves consumption without any client change, and is the difference between a 20-request budget
 * lasting five dashboard loads and lasting ten.
 */
const inFlightGenerations = new Map<string, Promise<EnrichedAiGamingTasteProfile | null>>();

/**
 * When a failed generation may next be retried, keyed by user + evidence hash.
 *
 * Without this, every dashboard load re-attempts a generation that just failed. Process-local and
 * therefore best-effort — it is a spend limiter, not a correctness guarantee.
 */
const generationCooldowns = new Map<string, number>();

/** Test seam; also keeps the two maps from leaking across suites. */
export function resetGameAiTasteRuntimeState(): void {
  inFlightGenerations.clear();
  generationCooldowns.clear();
}

export type GenerateGameAiTasteProfileOptions = {
  provider?: GameTasteAiProvider | null;
  enabled?: boolean;
  model?: string;
  timeoutMs?: number;
};

export async function generateGameAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateGameAiTasteProfileOptions = {},
): Promise<EnrichedAiGamingTasteProfile | null> {
  const configured = getConfiguredGameTasteProvider();
  const provider = options.provider ?? configured.provider;
  const enabled = options.enabled ?? configured.enabled;
  const model = options.model ?? configured.model;
  const timeoutMs = options.timeoutMs ?? getGameTasteTimeoutMs();

  const history = await loadUserMediaHistory(supabase, userId);
  const evidence = buildGameAiEvidenceDocument(history);
  const inputHash = hashGameAiEvidence(evidence, model);

  const cached = await readCachedGameAiTasteProfile(
    supabase,
    userId,
    inputHash,
    model,
    GAME_AI_TASTE_PROMPT_VERSION,
    GAME_AI_TASTE_SCHEMA_VERSION,
  );
  if (cached) {
    return cached;
  }

  if (!enabled || !provider || evidence.dataQuality.sufficiency === 'sparse') {
    return null;
  }

  const generationKey = `${userId}:${inputHash}`;

  const cooldownUntil = generationCooldowns.get(generationKey);
  if (cooldownUntil !== undefined) {
    if (cooldownUntil > Date.now()) {
      console.warn(
        `[gaming-ai-taste] skipping generation; retrying in ${Math.ceil(
          (cooldownUntil - Date.now()) / 1000,
        )}s`,
      );
      return null;
    }
    generationCooldowns.delete(generationKey);
  }

  const alreadyRunning = inFlightGenerations.get(generationKey);
  if (alreadyRunning) {
    return alreadyRunning;
  }

  const pending = runGeneration({
    supabase,
    userId,
    evidence,
    inputHash,
    model,
    provider,
    timeoutMs,
    generationKey,
  }).finally(() => {
    inFlightGenerations.delete(generationKey);
  });

  inFlightGenerations.set(generationKey, pending);
  return pending;
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
  evidence: ReturnType<typeof buildGameAiEvidenceDocument>;
  inputHash: string;
  model: string;
  provider: GameTasteAiProvider;
  timeoutMs: number;
  generationKey: string;
}): Promise<EnrichedAiGamingTasteProfile | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const raw = await provider.generateProfile({
      evidence,
      model,
      signal: controller.signal,
    });
    const validation = validateAiGamingTasteProfile(raw, evidence);
    if (!validation.success) {
      logValidationFailure(validation);
      startCooldown(generationKey, GAME_AI_TASTE_VALIDATION_COOLDOWN_MS);
      return null;
    }

    if (validation.droppedNegativeSignals.length > 0) {
      console.warn(
        `[gaming-ai-taste] dropped ${validation.droppedNegativeSignals.length} unsupported negative signal(s): ${validation.droppedNegativeSignals.join(', ')}`,
      );
    }

    // A success supersedes any earlier failure for this evidence.
    generationCooldowns.delete(generationKey);

    const enriched = enrichAiGamingTasteProfile(validation.profile, evidence, model, inputHash);
    await writeCachedGameAiTasteProfile(
      supabase,
      userId,
      enriched,
      GAME_AI_TASTE_PROMPT_VERSION,
      GAME_AI_TASTE_SCHEMA_VERSION,
    );
    return enriched;
  } catch (error) {
    if (isAbortError(error)) {
      console.warn(`[gaming-ai-taste] generation timed out after ${timeoutMs}ms`);
      startCooldown(generationKey, GAME_AI_TASTE_PROVIDER_COOLDOWN_MS);
      return null;
    }

    if (error instanceof GeminiTasteProviderError && error.isRateLimited) {
      const cooldownMs = clampQuotaCooldown(error.retryAfterMs);
      console.warn(
        `[gaming-ai-taste] provider quota exhausted; pausing generation for ${Math.round(
          cooldownMs / 60_000,
        )}min. Deterministic dashboard is unaffected.`,
      );
      startCooldown(generationKey, cooldownMs);
      return null;
    }

    console.warn('[gaming-ai-taste] generation failed:', error);
    startCooldown(generationKey, GAME_AI_TASTE_PROVIDER_COOLDOWN_MS);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function startCooldown(generationKey: string, cooldownMs: number): void {
  generationCooldowns.set(generationKey, Date.now() + cooldownMs);
}

function clampQuotaCooldown(retryAfterMs: number | null): number {
  if (retryAfterMs === null) {
    return GAME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS;
  }
  return Math.min(
    Math.max(retryAfterMs, GAME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS),
    GAME_AI_TASTE_MAX_QUOTA_COOLDOWN_MS,
  );
}

/**
 * Logs why a generation was rejected, at two levels of detail.
 *
 * Production gets the stage and the rule name only. Development additionally gets the per-issue
 * breakdown — field path, Zod code, violated constraint, and the received type/size. Neither
 * level emits generated text, evidence titles, prompt content, or credentials.
 */
function logValidationFailure(failure: GameAiValidationFailure): void {
  console.warn(
    `[gaming-ai-taste] rejected generation (${failure.category}): ${failure.reason}`,
  );

  if (process.env.NODE_ENV === 'production' || !failure.issues?.length) {
    return;
  }

  for (const issue of failure.issues) {
    console.warn(
      `[gaming-ai-taste]   ${issue.path}: ${issue.code}, expected ${issue.expected}, received ${issue.receivedType}${
        issue.receivedCount === undefined ? '' : ` (${issue.receivedCount})`
      }`,
    );
  }
}

export function getGameTasteTimeoutMs(): number {
  const configured = Number(process.env.GEMINI_TASTE_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_GEMINI_TASTE_TIMEOUT_MS;
  }
  return Math.max(5_000, Math.min(Math.floor(configured), 60_000));
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException ||
    (typeof error === 'object' && error !== null && 'name' in error)
  ) && (error as { name?: unknown }).name === 'AbortError';
}
