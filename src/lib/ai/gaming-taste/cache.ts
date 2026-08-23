import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { EnrichedAiGamingTasteProfile } from './types';

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

let missingTableLogged = false;

export async function readCachedGameAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  inputHash: string,
  model: string,
  promptVersion: string,
  schemaVersion: number,
): Promise<EnrichedAiGamingTasteProfile | null> {
  const { data, error } = await supabase
    .from('ai_taste_profiles')
    .select('user_id,category,input_hash,model,prompt_version,schema_version,profile,created_at,updated_at')
    .eq('user_id', userId)
    .eq('category', 'games')
    .maybeSingle<AiTasteProfileRow>();

  if (error) {
    logCacheError('read', error);
    return null;
  }

  if (
    !data ||
    data.input_hash !== inputHash ||
    data.model !== model ||
    data.prompt_version !== promptVersion ||
    data.schema_version !== schemaVersion
  ) {
    return null;
  }

  return data.profile as EnrichedAiGamingTasteProfile;
}

export async function writeCachedGameAiTasteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  profile: EnrichedAiGamingTasteProfile,
  promptVersion: string,
  schemaVersion: number,
): Promise<void> {
  const { error } = await supabase.from('ai_taste_profiles').upsert(
    {
      user_id: userId,
      category: 'games',
      input_hash: profile.inputHash,
      model: profile.model,
      prompt_version: promptVersion,
      schema_version: schemaVersion,
      profile: profile as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category' },
  );

  if (error) {
    logCacheError('write', error);
  }
}

function logCacheError(operation: 'read' | 'write', error: { code?: string; message?: string }) {
  if (error.code === '42P01') {
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn('[gaming-ai-taste] ai_taste_profiles table missing; continuing without cache.');
    }
    return;
  }
  console.warn(`[gaming-ai-taste] cache ${operation} failed:`, error.message ?? error);
}
