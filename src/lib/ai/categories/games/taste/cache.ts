import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  readCachedTasteProfile,
  writeCachedTasteProfile,
} from '@/lib/ai/shared/cache/taste-profile-cache';
import { GAMES_AI_CATEGORY, GAMES_TASTE_LOG_SCOPE } from '../constants';
import type { EnrichedAiGamingTasteProfile } from './types';

/**
 * Games binding for the shared `ai_taste_profiles` orchestration.
 *
 * Thin on purpose: the table, the version checks and the missing-table handling are shared, and
 * the only thing games contributes is which category row it owns and what shape the blob is.
 */

export async function readCachedGameAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  inputHash: string,
  model: string,
  promptVersion: string,
  schemaVersion: number,
): Promise<EnrichedAiGamingTasteProfile | null> {
  return readCachedTasteProfile<EnrichedAiGamingTasteProfile>(supabase, GAMES_TASTE_LOG_SCOPE, {
    userId,
    category: GAMES_AI_CATEGORY,
    inputHash,
    model,
    promptVersion,
    schemaVersion,
  });
}

export async function writeCachedGameAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  profile: EnrichedAiGamingTasteProfile,
  promptVersion: string,
  schemaVersion: number,
): Promise<void> {
  await writeCachedTasteProfile(supabase, GAMES_TASTE_LOG_SCOPE, {
    userId,
    category: GAMES_AI_CATEGORY,
    inputHash: profile.inputHash,
    model: profile.model,
    promptVersion,
    schemaVersion,
    profile,
  });
}
