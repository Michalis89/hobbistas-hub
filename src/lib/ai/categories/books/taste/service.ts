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
import { BOOKS_AI_CATEGORY, BOOKS_TASTE_LOG_SCOPE } from '../constants';
import { buildBooksAiEvidenceDocument, hashBooksAiEvidence } from './evidence';
import { loadBooksHistory, type BooksHistoryEntry } from './history';
import { getConfiguredBooksTasteProvider } from './provider';
import {
  BOOKS_AI_TASTE_PROMPT_VERSION,
  BOOKS_AI_TASTE_SCHEMA_VERSION,
  type AiBooksTasteProfile,
  type BooksAiEvidenceDocument,
  type EnrichedAiBooksTasteProfile,
} from './types';
import { enrichAiBooksTasteProfile, validateAiBooksTasteProfile } from './validation';

/** The same 35s ceiling the other categories settled on; the retry needs room to finish. */
export const DEFAULT_GEMINI_BOOKS_TASTE_TIMEOUT_MS = 35_000;

export function getBooksTasteTimeoutMs(): number {
  return readClampedIntEnv('GEMINI_BOOKS_TASTE_TIMEOUT_MS', {
    fallback: DEFAULT_GEMINI_BOOKS_TASTE_TIMEOUT_MS,
    min: 5_000,
    max: 60_000,
  });
}

/** Everything reading contributes to a taste generation. */
export const booksTasteAdapter: TasteGenerationAdapter<
  BooksHistoryEntry[],
  BooksAiEvidenceDocument,
  AiBooksTasteProfile,
  EnrichedAiBooksTasteProfile
> = {
  category: BOOKS_AI_CATEGORY,
  logScope: BOOKS_TASTE_LOG_SCOPE,
  promptVersion: BOOKS_AI_TASTE_PROMPT_VERSION,
  schemaVersion: BOOKS_AI_TASTE_SCHEMA_VERSION,

  getTimeoutMs: getBooksTasteTimeoutMs,
  resolveProvider: getConfiguredBooksTasteProvider,

  loadHistory: loadBooksHistory,
  buildEvidence: buildBooksAiEvidenceDocument,
  hashEvidence: hashBooksAiEvidence,
  isSparse: evidence => evidence.dataQuality.sufficiency === 'sparse',
  validate: validateAiBooksTasteProfile,
  enrich: enrichAiBooksTasteProfile,
};

export type GenerateBooksAiTasteProfileOptions = TasteGenerationOptions<BooksAiEvidenceDocument>;

export async function generateBooksAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateBooksAiTasteProfileOptions = {},
): Promise<EnrichedAiBooksTasteProfile | null> {
  return generateTasteProfile(booksTasteAdapter, supabase, userId, options);
}

/** Test seam; also keeps the shared registries from leaking across suites. */
export function resetBooksAiTasteRuntimeState(): void {
  resetTasteGenerationRuntimeState();
}
