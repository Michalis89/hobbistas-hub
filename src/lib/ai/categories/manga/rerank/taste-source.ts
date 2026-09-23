import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { readStoredTasteProfile } from '@/lib/ai/shared/cache/taste-profile-cache';
import type { EnrichedAiMangaTasteProfile } from '@/lib/ai/categories/manga/taste/types';
import { MANGA_AI_CATEGORY, MANGA_RERANK_LOG_SCOPE } from '../constants';

export type CachedMangaTasteProfile = {
  profile: EnrichedAiMangaTasteProfile;
  inputHash: string;
};

/**
 * Reads whatever manga taste profile is already stored, without generating one.
 *
 * Read-only by design. Reranking must never be the thing that triggers a taste generation: the two
 * features would then share a spend path, a failure mode and a cooldown.
 */
export async function readCachedMangaTasteProfileForRerank(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CachedMangaTasteProfile | null> {
  return readStoredTasteProfile<EnrichedAiMangaTasteProfile>(
    supabase,
    MANGA_RERANK_LOG_SCOPE,
    userId,
    MANGA_AI_CATEGORY,
  );
}
