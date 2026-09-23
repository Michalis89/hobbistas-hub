import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Reading the authorship lists the profile recompute already derived.
 *
 * `user_category_profiles.profiles[category]` holds ranked name lists built by
 * `recomputeCategoryProfiles`: directors and actors for movies and tv, authors for books, studios
 * for anime, developers for games. They are the only authorship signal these categories have —
 * `media_items` carries no credits for a film or a series — and they arrive with real work already
 * done on them: franchise deduplication, so three instalments of one series count once, and for
 * actors a two-family breadth gate, so a performer who appears in exactly one trilogy is excluded.
 *
 * That gate is the reason these lists are worth quoting to a model at all. Without it, "favourite
 * actor" would mean "was in the franchise you like", which is a fact about the franchise.
 *
 * Read-only and best-effort: a missing row, a missing category or a malformed value all yield empty
 * lists. Nothing here may fail a generation, and nothing here writes.
 */

export type DerivedAuthorshipKeys = readonly string[];

export async function readDerivedAuthorship(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
  keys: DerivedAuthorshipKeys,
  logScope: string,
): Promise<Record<string, string[]>> {
  const empty = Object.fromEntries(keys.map(key => [key, [] as string[]]));

  const { data, error } = await supabase
    .from('user_category_profiles')
    .select('profiles')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn(`[${logScope}] derived authorship load failed:`, error.message ?? error);
    return empty;
  }

  const profiles = data?.profiles as Record<string, unknown> | null | undefined;
  const categoryProfile = profiles?.[category] as Record<string, unknown> | undefined;
  if (!categoryProfile || typeof categoryProfile !== 'object') {
    return empty;
  }

  return Object.fromEntries(
    keys.map(key => [key, toNameList(categoryProfile[key])]),
  ) as Record<string, string[]>;
}

function toNameList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((name): name is string => typeof name === 'string')
    .map(name => name.trim())
    .filter(Boolean);
}
