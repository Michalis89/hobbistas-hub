import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  readCachedTasteProfile,
  writeCachedTasteProfile,
} from '@/lib/ai/shared/cache/taste-profile-cache';
import { MANGA_AI_CATEGORY, MANGA_TASTE_LOG_SCOPE } from '../constants';
import type { EnrichedAiMangaTasteProfile } from './types';

/**
 * Manga binding for the shared `ai_taste_profiles` orchestration.
 *
 * No migration is needed: the table is keyed `(user_id, category)`, so a manga row sits beside the
 * games and anime rows for the same user without any of them being able to overwrite another. The
 * version columns are per-row too, which is what lets manga carry its own prompt and schema
 * versions and invalidate independently of both.
 */

export async function readCachedMangaAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  inputHash: string,
  model: string,
  promptVersion: string,
  schemaVersion: number,
): Promise<EnrichedAiMangaTasteProfile | null> {
  return readCachedTasteProfile<EnrichedAiMangaTasteProfile>(supabase, MANGA_TASTE_LOG_SCOPE, {
    userId,
    category: MANGA_AI_CATEGORY,
    inputHash,
    model,
    promptVersion,
    schemaVersion,
  });
}

export async function writeCachedMangaAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  profile: EnrichedAiMangaTasteProfile,
  promptVersion: string,
  schemaVersion: number,
): Promise<void> {
  await writeCachedTasteProfile(supabase, MANGA_TASTE_LOG_SCOPE, {
    userId,
    category: MANGA_AI_CATEGORY,
    inputHash: profile.inputHash,
    model: profile.model,
    promptVersion,
    schemaVersion,
    profile,
  });
}
