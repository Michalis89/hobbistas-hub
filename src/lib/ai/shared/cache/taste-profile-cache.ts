import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { logCacheFailure } from './log';

/**
 * Read/write orchestration for `ai_taste_profiles`.
 *
 * The table is already category-keyed — primary key `(user_id, category)` — so nothing here needs
 * a schema change to serve a second category; the category is simply a parameter rather than a
 * literal. What the stored `profile` blob *contains* stays entirely the category's business: this
 * module never inspects it.
 *
 * A stored row is only usable when every version dimension still matches. A prompt revision, a
 * schema bump, a model change or new evidence all mean the cached answer was to a different
 * question, and serving it would silently pin users to a superseded profile.
 */

type AiTasteProfileRow = {
  user_id: string;
  category: string;
  input_hash: string;
  model: string;
  prompt_version: string;
  schema_version: number;
  profile: Json;
  created_at: string;
  updated_at: string;
};

export type TasteProfileCacheKey = {
  userId: string;
  category: string;
  inputHash: string;
  model: string;
  promptVersion: string;
  schemaVersion: number;
};

const MISSING_TABLE = {
  key: 'ai_taste_profiles',
  message: 'ai_taste_profiles table missing; continuing without cache.',
};

export async function readCachedTasteProfile<TProfile>(
  supabase: SupabaseClient<Database>,
  scope: string,
  key: TasteProfileCacheKey,
): Promise<TProfile | null> {
  const { data, error } = await supabase
    .from('ai_taste_profiles')
    .select(
      'user_id,category,input_hash,model,prompt_version,schema_version,profile,created_at,updated_at',
    )
    .eq('user_id', key.userId)
    .eq('category', key.category)
    .maybeSingle<AiTasteProfileRow>();

  if (error) {
    logCacheFailure({ scope, label: 'cache read', error, missingTable: MISSING_TABLE });
    return null;
  }

  if (
    !data ||
    data.input_hash !== key.inputHash ||
    data.model !== key.model ||
    data.prompt_version !== key.promptVersion ||
    data.schema_version !== key.schemaVersion
  ) {
    return null;
  }

  return data.profile as TProfile;
}

export async function writeCachedTasteProfile(
  supabase: SupabaseClient<Database>,
  scope: string,
  {
    userId,
    category,
    inputHash,
    model,
    promptVersion,
    schemaVersion,
    profile,
  }: Omit<TasteProfileCacheKey, never> & { profile: unknown },
): Promise<void> {
  const { error } = await supabase.from('ai_taste_profiles').upsert(
    {
      user_id: userId,
      category,
      input_hash: inputHash,
      model,
      prompt_version: promptVersion,
      schema_version: schemaVersion,
      profile: profile as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category' },
  );

  if (error) {
    logCacheFailure({ scope, label: 'cache write', error, missingTable: MISSING_TABLE });
  }
}

export type StoredTasteProfile<TProfile> = {
  profile: TProfile;
  /** The evidence hash the profile was generated from, recorded on every downstream run. */
  inputHash: string;
};

/**
 * Reads whatever profile is already stored, without generating one and without freshness checks.
 *
 * The read-only shape exists so a downstream feature (reranking) can consume a taste profile
 * without ever becoming the thing that triggers a generation: the two would then share a spend
 * path, a failure mode and a cooldown.
 *
 * Deliberately does not re-derive the evidence hash to check freshness — doing so would mean
 * reloading the whole library inside the caller. The stored `input_hash` is returned instead, so a
 * profile that was stale at the time of use is visible in the data rather than silently assumed
 * current.
 */
export async function readStoredTasteProfile<TProfile>(
  supabase: SupabaseClient<Database>,
  scope: string,
  userId: string,
  category: string,
): Promise<StoredTasteProfile<TProfile> | null> {
  const { data, error } = await supabase
    .from('ai_taste_profiles')
    .select('profile, input_hash')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();

  if (error) {
    logCacheFailure({ scope, label: 'taste profile read', error, missingTable: null });
    return null;
  }

  if (!data?.profile) {
    return null;
  }

  return {
    profile: data.profile as unknown as TProfile,
    inputHash: data.input_hash,
  };
}
