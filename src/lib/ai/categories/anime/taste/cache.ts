import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  readCachedTasteProfile,
  writeCachedTasteProfile,
} from '@/lib/ai/shared/cache/taste-profile-cache';
import { ANIME_AI_CATEGORY, ANIME_TASTE_LOG_SCOPE } from '../constants';
import type { EnrichedAiAnimeTasteProfile } from './types';

/**
 * Anime binding for the shared `ai_taste_profiles` orchestration.
 *
 * No migration was needed: the table is keyed `(user_id, category)`, so an anime row sits beside
 * a games row for the same user without either being able to overwrite the other. The version
 * columns are per-row too, which is what lets anime carry its own prompt and schema versions and
 * invalidate independently of games.
 */

export async function readCachedAnimeAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  inputHash: string,
  model: string,
  promptVersion: string,
  schemaVersion: number,
): Promise<EnrichedAiAnimeTasteProfile | null> {
  return readCachedTasteProfile<EnrichedAiAnimeTasteProfile>(supabase, ANIME_TASTE_LOG_SCOPE, {
    userId,
    category: ANIME_AI_CATEGORY,
    inputHash,
    model,
    promptVersion,
    schemaVersion,
  });
}

export async function writeCachedAnimeAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  profile: EnrichedAiAnimeTasteProfile,
  promptVersion: string,
  schemaVersion: number,
): Promise<void> {
  await writeCachedTasteProfile(supabase, ANIME_TASTE_LOG_SCOPE, {
    userId,
    category: ANIME_AI_CATEGORY,
    inputHash: profile.inputHash,
    model: profile.model,
    promptVersion,
    schemaVersion,
    profile,
  });
}
