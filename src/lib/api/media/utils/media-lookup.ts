import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaCategoryConfig } from '../config';
import type { ExternalIdValue } from '../types';

/**
 * The identifier columns for a category, primary first. Most categories have
 * one; books have several because they come from more than one provider.
 */
export function externalIdFields(config: MediaCategoryConfig): string[] {
  return [config.externalId.field, ...(config.externalId.alternateFields ?? [])];
}

const isPresent = (value: unknown): value is ExternalIdValue =>
  (typeof value === 'string' && value.length > 0) ||
  (typeof value === 'number' && Number.isFinite(value));

/**
 * First identifier the payload carries, checking the primary field first.
 * A payload with none of them cannot be matched or inserted safely.
 */
export function resolveExternalIdValue(
  config: MediaCategoryConfig,
  payload: Record<string, unknown>,
): ExternalIdValue | null {
  for (const field of externalIdFields(config)) {
    if (isPresent(payload[field])) {
      return payload[field] as ExternalIdValue;
    }
  }
  return null;
}

/**
 * Finds an existing media item for a payload by any of its category's
 * identifier columns, in priority order.
 *
 * @param supabase - Supabase client instance
 * @param config - Category configuration with external ID field info
 * @param payload - Media payload carrying the external id(s)
 * @param category - Media category (anime, books, games, movies, etc.)
 * @returns Media ID if found, null otherwise
 *
 * @example
 * const mediaId = await findExistingMedia(supabase, config, { mal_id: 12345 }, 'anime');
 * // Returns: 789 (internal media_items.id) or null
 */
export async function findExistingMedia(
  supabase: SupabaseClient,
  config: MediaCategoryConfig,
  payload: Record<string, unknown>,
  category: string,
): Promise<number | null> {
  for (const field of externalIdFields(config)) {
    const value = payload[field];
    if (!isPresent(value)) {
      continue;
    }

    // limit(1), not maybeSingle(): alternate keys such as isbn_13 are not
    // unique, and maybeSingle() errors when more than one row matches.
    const { data } = await supabase
      .from('media_items')
      .select('id')
      .eq(field, value)
      .eq('category', category)
      .order('id', { ascending: true })
      .limit(1);

    const id = (data as { id?: number }[] | null)?.[0]?.id;
    if (id) {
      return id;
    }
  }

  return null;
}

/**
 * Writes the payload's values into the columns of an existing row that are
 * still empty. Never overwrites a value already there. Used so that adding a
 * book found through a second provider enriches the row we already have
 * (e.g. an Open Library id and cover on a Google Books row).
 *
 * Best effort: a failure is logged, not thrown — the user's add still succeeds.
 */
export async function backfillMediaGaps(
  supabaseAdmin: SupabaseClient,
  mediaId: number,
  payload: Record<string, unknown>,
  fields: string[],
  logPrefix: string,
): Promise<void> {
  const candidates = fields.filter(field => {
    const value = payload[field];
    return Array.isArray(value) ? value.length > 0 : isPresent(value);
  });
  if (candidates.length === 0) {
    return;
  }

  try {
    const { data: row, error: readError } = await supabaseAdmin
      .from('media_items')
      .select(candidates.join(','))
      .eq('id', mediaId)
      .maybeSingle();
    if (readError || !row) {
      return;
    }

    const current = row as unknown as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const field of candidates) {
      const existing = current[field];
      const isEmpty =
        existing === null ||
        existing === undefined ||
        existing === '' ||
        (Array.isArray(existing) && existing.length === 0);
      if (isEmpty) {
        updates[field] = payload[field];
      }
    }
    if (Object.keys(updates).length === 0) {
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('media_items')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', mediaId);
    if (updateError) {
      console.warn(`${logPrefix} media backfill skipped:`, updateError.message);
    }
  } catch (error) {
    console.warn(`${logPrefix} media backfill failed:`, error);
  }
}
