import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { readStoredTasteProfile } from '@/lib/ai/shared/cache/taste-profile-cache';
import type { EnrichedAiGamingTasteProfile } from '@/lib/ai/categories/games/taste/types';
import { GAMES_AI_CATEGORY, GAMES_RERANK_LOG_SCOPE } from '../constants';

export type CachedTasteProfile = {
  profile: EnrichedAiGamingTasteProfile;
  /** The Phase 1 evidence hash the profile was generated from, recorded on every shadow run. */
  inputHash: string;
};

/**
 * Reads whatever Phase 1 profile is already stored, without generating one.
 *
 * Read-only by design. Phase 2 must never be the thing that triggers a taste generation: the two
 * features would then share a spend path, a failure mode and a cooldown, and a rerank experiment
 * could quietly change how often the user's identity card regenerates.
 */
export async function readCachedTasteProfileForRerank(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CachedTasteProfile | null> {
  return readStoredTasteProfile<EnrichedAiGamingTasteProfile>(
    supabase,
    GAMES_RERANK_LOG_SCOPE,
    userId,
    GAMES_AI_CATEGORY,
  );
}
