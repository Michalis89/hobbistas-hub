import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { readStoredTasteProfile } from '@/lib/ai/shared/cache/taste-profile-cache';
import type { EnrichedAiAnimeTasteProfile } from '@/lib/ai/categories/anime/taste/types';
import { ANIME_AI_CATEGORY, ANIME_RERANK_LOG_SCOPE } from '../constants';

export type CachedAnimeTasteProfile = {
  profile: EnrichedAiAnimeTasteProfile;
  /** The evidence hash the profile was generated from, recorded on every shadow run. */
  inputHash: string;
};

/**
 * Reads whatever anime taste profile is already stored, without generating one.
 *
 * Read-only by design. Reranking must never be the thing that triggers a taste generation: the two
 * features would then share a spend path, a failure mode and a cooldown, and a rerank experiment
 * could quietly change how often the viewer's identity card regenerates.
 */
export async function readCachedAnimeTasteProfileForRerank(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CachedAnimeTasteProfile | null> {
  return readStoredTasteProfile<EnrichedAiAnimeTasteProfile>(
    supabase,
    ANIME_RERANK_LOG_SCOPE,
    userId,
    ANIME_AI_CATEGORY,
  );
}
