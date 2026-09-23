import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Surfaces that show recommendations to the user they belong to.
 *
 * Public and shared dashboards (`/u/[username]`, `/share/[token]`) deliberately have no entry
 * here: those render one user's recommendations to a different viewer, so an impression recorded
 * there would attribute a stranger's page view to the owner.
 */
export type RecommendationSurface = 'dashboard_media_suggestions' | 'backlog_personal_suggestions';

export type RecommendationSlot = {
  mediaId: number;
  source: string;
  subtype: string;
  /** Rank the deterministic engine gave this item within its own candidate list, if known. */
  deterministicRank?: number | null;
};

export type RecommendationServe = {
  serveId: string;
  userId: string;
  category: string;
  surface: RecommendationSurface;
  slots: RecommendationSlot[];
};

/**
 * How coarsely serve identity is bucketed in time.
 *
 * A server-rendered surface can be produced several times for what the user experiences as one
 * visit — a soft navigation back, an SWR revalidation, a React StrictMode double render, a
 * prefetch. Bucketing the timestamp means all of those derive the same serve_id and collapse on
 * the table's unique index, so impressions count visits rather than renders. Five minutes is long
 * enough to absorb that and short enough that a genuine return visit is still a new serve.
 */
export const RECOMMENDATION_SERVE_BUCKET_MS = 5 * 60_000;

/**
 * Derives a stable UUID from a hash so identical serves are identical rows.
 *
 * Version 8 is RFC 9562's "custom" version, which is what a name-derived id like this one is.
 */
function hashToUuid(hash: string): string {
  const chars = hash.slice(0, 32).split('');
  chars[12] = '8';
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function buildRecommendationServe(input: {
  userId: string;
  category: string;
  surface: RecommendationSurface;
  slots: RecommendationSlot[];
  now?: number;
}): RecommendationServe {
  const bucket = Math.floor((input.now ?? Date.now()) / RECOMMENDATION_SERVE_BUCKET_MS);
  const fingerprint = [
    input.userId,
    input.surface,
    input.category,
    String(bucket),
    input.slots.map((slot, index) => `${index}:${slot.mediaId}`).join(','),
  ].join('|');

  return {
    serveId: hashToUuid(createHash('sha256').update(fingerprint).digest('hex')),
    userId: input.userId,
    category: input.category,
    surface: input.surface,
    slots: input.slots,
  };
}

export function buildImpressionRows(
  serve: RecommendationServe,
): Database['public']['Tables']['recommendation_events']['Insert'][] {
  return serve.slots.map((slot, index) => ({
    user_id: serve.userId,
    serve_id: serve.serveId,
    media_id: slot.mediaId,
    category: serve.category,
    surface: serve.surface,
    slot_index: index,
    source: slot.source,
    subtype: slot.subtype,
    deterministic_rank: slot.deterministicRank ?? null,
    event_type: 'impression',
  }));
}

let missingTableLogged = false;

/**
 * Writes one impression per slot.
 *
 * Never throws and never rejects: recommendations render whether or not we managed to record that
 * they did. Duplicate serves are ignored at the database level rather than checked for first, so
 * this stays a single round trip.
 */
export async function recordRecommendationImpressions(
  supabase: SupabaseClient<Database>,
  serve: RecommendationServe,
): Promise<void> {
  if (serve.slots.length === 0) {
    return;
  }

  try {
    const { error } = await supabase
      .from('recommendation_events')
      .upsert(buildImpressionRows(serve), {
        onConflict: 'serve_id,media_id,event_type',
        ignoreDuplicates: true,
      });

    if (error) {
      logInstrumentationError(error);
    }
  } catch (error) {
    logInstrumentationError(error as { code?: string; message?: string });
  }
}

function logInstrumentationError(error: { code?: string; message?: string }): void {
  if (error.code === '42P01') {
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn(
        '[recommendation-events] table missing; recommendations render without instrumentation.',
      );
    }
    return;
  }
  console.warn('[recommendation-events] impression write failed:', error.message ?? error);
}
