import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { EnrichedAiGamingTasteProfile } from '@/lib/ai/gaming-taste/types';

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
 *
 * Deliberately does not re-derive the evidence hash to check freshness — doing so would mean
 * loading the whole games history again inside the shadow callback. The stored `input_hash` is
 * returned instead and recorded on the run, so a profile that was stale at rerank time is visible
 * in the data rather than silently assumed current.
 */
export async function readCachedTasteProfileForRerank(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CachedTasteProfile | null> {
  const { data, error } = await supabase
    .from('ai_taste_profiles')
    .select('profile, input_hash')
    .eq('user_id', userId)
    .eq('category', 'games')
    .maybeSingle();

  if (error) {
    if (error.code !== '42P01') {
      console.warn('[gaming-rerank] taste profile read failed:', error.message ?? error);
    }
    return null;
  }

  if (!data?.profile) {
    return null;
  }

  return {
    profile: data.profile as unknown as EnrichedAiGamingTasteProfile,
    inputHash: data.input_hash,
  };
}
