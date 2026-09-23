import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { readClampedIntEnv } from '@/lib/ai/shared/env';
import type { TasteGenerationAdapter } from '@/lib/ai/shared/taste/adapter';
import {
  generateTasteProfile,
  resetTasteGenerationRuntimeState,
  type TasteGenerationOptions,
} from '@/lib/ai/shared/taste/generation-runner';
import { MOVIES_AI_CATEGORY, MOVIES_TASTE_LOG_SCOPE } from '../constants';
import { buildMoviesAiEvidenceDocument, hashMoviesAiEvidence } from './evidence';
import { loadMoviesHistory, type MoviesHistory } from './history';
import { getConfiguredMoviesTasteProvider } from './provider';
import {
  MOVIES_AI_TASTE_PROMPT_VERSION,
  MOVIES_AI_TASTE_SCHEMA_VERSION,
  type AiMoviesTasteProfile,
  type EnrichedAiMoviesTasteProfile,
  type MoviesAiEvidenceDocument,
} from './types';
import { enrichAiMoviesTasteProfile, validateAiMoviesTasteProfile } from './validation';

/**
 * Budget for a whole movies generation, including a structural retry.
 *
 * The same 35s the serialised categories settled on, and for the same reason: Gemini treats
 * string-length bounds in `responseSchema` as advisory, so an over-long description slips through
 * constrained decoding and is caught only by Zod, and the retry needs room to finish. A profile
 * that takes thirty seconds and is then cached beats one that fails in twenty and is not.
 */
export const DEFAULT_GEMINI_MOVIES_TASTE_TIMEOUT_MS = 35_000;

export function getMoviesTasteTimeoutMs(): number {
  return readClampedIntEnv('GEMINI_MOVIES_TASTE_TIMEOUT_MS', {
    fallback: DEFAULT_GEMINI_MOVIES_TASTE_TIMEOUT_MS,
    min: 5_000,
    max: 60_000,
  });
}

/**
 * Everything films contribute to a taste generation.
 *
 * Read alongside `shared/taste/generation-runner.ts`: the runner owns the cache, the spend gates,
 * the cooldowns and the abort budget; this owns what a film library means.
 */
export const moviesTasteAdapter: TasteGenerationAdapter<
  MoviesHistory,
  MoviesAiEvidenceDocument,
  AiMoviesTasteProfile,
  EnrichedAiMoviesTasteProfile
> = {
  category: MOVIES_AI_CATEGORY,
  logScope: MOVIES_TASTE_LOG_SCOPE,
  promptVersion: MOVIES_AI_TASTE_PROMPT_VERSION,
  schemaVersion: MOVIES_AI_TASTE_SCHEMA_VERSION,

  getTimeoutMs: getMoviesTasteTimeoutMs,
  resolveProvider: getConfiguredMoviesTasteProvider,

  loadHistory: loadMoviesHistory,
  buildEvidence: buildMoviesAiEvidenceDocument,
  hashEvidence: hashMoviesAiEvidence,
  isSparse: evidence => evidence.dataQuality.sufficiency === 'sparse',
  validate: validateAiMoviesTasteProfile,
  enrich: enrichAiMoviesTasteProfile,
};

export type GenerateMoviesAiTasteProfileOptions =
  TasteGenerationOptions<MoviesAiEvidenceDocument>;

export async function generateMoviesAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateMoviesAiTasteProfileOptions = {},
): Promise<EnrichedAiMoviesTasteProfile | null> {
  return generateTasteProfile(moviesTasteAdapter, supabase, userId, options);
}

/** Test seam; also keeps the shared registries from leaking across suites. */
export function resetMoviesAiTasteRuntimeState(): void {
  resetTasteGenerationRuntimeState();
}
