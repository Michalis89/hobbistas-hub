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
import { TV_AI_CATEGORY, TV_TASTE_LOG_SCOPE } from '../constants';
import { buildTvAiEvidenceDocument, hashTvAiEvidence } from './evidence';
import { loadTvHistory, type TvHistory } from './history';
import { getConfiguredTvTasteProvider } from './provider';
import {
  TV_AI_TASTE_PROMPT_VERSION,
  TV_AI_TASTE_SCHEMA_VERSION,
  type AiTvTasteProfile,
  type EnrichedAiTvTasteProfile,
  type TvAiEvidenceDocument,
} from './types';
import { enrichAiTvTasteProfile, validateAiTvTasteProfile } from './validation';

/** The same 35s ceiling the other categories settled on; the retry needs room to finish. */
export const DEFAULT_GEMINI_TV_TASTE_TIMEOUT_MS = 35_000;

export function getTvTasteTimeoutMs(): number {
  return readClampedIntEnv('GEMINI_TV_TASTE_TIMEOUT_MS', {
    fallback: DEFAULT_GEMINI_TV_TASTE_TIMEOUT_MS,
    min: 5_000,
    max: 60_000,
  });
}

/** Everything television contributes to a taste generation. */
export const tvTasteAdapter: TasteGenerationAdapter<
  TvHistory,
  TvAiEvidenceDocument,
  AiTvTasteProfile,
  EnrichedAiTvTasteProfile
> = {
  category: TV_AI_CATEGORY,
  logScope: TV_TASTE_LOG_SCOPE,
  promptVersion: TV_AI_TASTE_PROMPT_VERSION,
  schemaVersion: TV_AI_TASTE_SCHEMA_VERSION,

  getTimeoutMs: getTvTasteTimeoutMs,
  resolveProvider: getConfiguredTvTasteProvider,

  loadHistory: loadTvHistory,
  buildEvidence: buildTvAiEvidenceDocument,
  hashEvidence: hashTvAiEvidence,
  isSparse: evidence => evidence.dataQuality.sufficiency === 'sparse',
  validate: validateAiTvTasteProfile,
  enrich: enrichAiTvTasteProfile,
};

export type GenerateTvAiTasteProfileOptions = TasteGenerationOptions<TvAiEvidenceDocument>;

export async function generateTvAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateTvAiTasteProfileOptions = {},
): Promise<EnrichedAiTvTasteProfile | null> {
  return generateTasteProfile(tvTasteAdapter, supabase, userId, options);
}

/** Test seam; also keeps the shared registries from leaking across suites. */
export function resetTvAiTasteRuntimeState(): void {
  resetTasteGenerationRuntimeState();
}
