import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import getSupabaseServer from '@/lib/supabase-server';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { insertActivity } from '@/lib/services/activityService';
import { getUserBasicInfo } from '@/lib/services/userService';
import {
  AUTH_ERROR,
  UNTITLED_FALLBACK,
  MISSING_PAYLOAD,
  FAILED_TO_RESOLVE_MEDIA_ID,
  INTERNAL_SERVER_ERROR,
} from '@/lib/constants/messages';
import type { MediaCategoryConfig } from '../config';
import type { AddMediaRequestBody, UserProfile } from '../types';
import { resolveTitle } from '../utils/title-resolver';
import {
  backfillMediaGaps,
  findExistingMedia,
  resolveExternalIdValue,
} from '../utils/media-lookup';
import '../handlers/enrichers'; // Import to initialize enricher functions in configs
import { isAllowedIgdbGameCandidate } from '@/lib/igdb/categories';
import { refreshGenreAffinity } from '@/lib/profile/genre-affinity';
import { recomputeCategoryProfiles } from '@/lib/profile/recompute-category-profiles';
import { revalidateCache } from '@/lib/cache/tags';
import { revalidateUserMediaMutation } from '../utils/revalidation';

/**
 * Generic handler for POST /api/{category}/add
 * Handles both local (existing media) and external (new media) sources
 *
 * @param req - Next.js Request object
 * @param config - Category configuration
 * @returns Response with created entry
 */
export async function handleMediaAdd(req: Request, config: MediaCategoryConfig): Promise<Response> {
  try {
    // 1. Auth check
    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);

    // 2. Parse request body
    const body = (await req.json()) as AddMediaRequestBody;
    const normalizedSelectedPlatform =
      typeof body.selected_platform === 'string'
        ? body.selected_platform.trim()
        : body.selected_platform;
    body.selected_platform = normalizedSelectedPlatform || null;

    if (config.key === 'games' && !body.selected_platform) {
      return NextResponse.json(
        { error: 'Platform selection is required for games' },
        { status: 400 },
      );
    }

    // 3. Handle local source (existing media in database)
    if (body.source === 'local' && body.mediaId) {
      return handleLocalSource(supabase, session.user.id, body, config);
    }

    // 4. Handle external source (new media from API)
    if (body.source !== 'external' || !body.payload) {
      return NextResponse.json({ error: MISSING_PAYLOAD }, { status: 400 });
    }

    return handleExternalSource(supabase, session.user.id, body, config);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: AUTH_ERROR }, { status: 401 });
    }
    console.error(`${config.logPrefix} add error:`, error);
    return NextResponse.json({ error: INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}

/**
 * Handles adding media from local database (media already exists)
 */
async function handleLocalSource(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  userId: string,
  body: AddMediaRequestBody,
  config: MediaCategoryConfig,
): Promise<Response> {
  // Fetch user profile for activity logging
  const profileData = await getUserBasicInfo(supabase, userId);

  // Fetch media details for title and category
  const { data: mediaRow, error: mediaError } = await supabase
    .from('media_items')
    .select(config.titlePriority.join(',') + ',category,igdb_category,igdb_slug')
    .eq('id', body.mediaId!)
    .maybeSingle();

  const mediaTitle =
    mediaRow && !mediaError
      ? resolveTitle(mediaRow as unknown as Record<string, unknown>, config.titlePriority)
      : UNTITLED_FALLBACK;
  const mediaCategory =
    (mediaRow && !mediaError
      ? ((mediaRow as unknown as Record<string, unknown>).category as string)
      : null) ?? config.defaultCategory;

  // Hard guard: prevent category mismatch and excluded IGDB game types from being added as entries
  if (mediaRow && !mediaError) {
    const row = mediaRow as unknown as Record<string, unknown>;
    const rowCategory = typeof row.category === 'string' ? row.category : null;
    if (!rowCategory || !config.subcategories.includes(rowCategory)) {
      return NextResponse.json(
        { error: 'Media does not belong to this category' },
        { status: 422 },
      );
    }

    if (config.key === 'games') {
      const candidateAllowed = isAllowedIgdbGameCandidate({
        category: typeof row.igdb_category === 'number' ? row.igdb_category : null,
        name:
          typeof row.title_english === 'string'
            ? row.title_english
            : typeof row.title === 'string'
              ? row.title
              : null,
        slug: typeof row.igdb_slug === 'string' ? row.igdb_slug : null,
      });
      if (!candidateAllowed) {
        return NextResponse.json(
          { ok: false, error: 'Unsupported IGDB category' },
          { status: 422 },
        );
      }
    }
  }

  // Upsert user media entry
  const updatedAt = new Date().toISOString();
  const { data: entry, error: entryError } = await supabase
    .from('user_media_entries')
    .upsert(
      {
        user_id: userId,
        media_id: body.mediaId!,
        status: body.status ?? 'planned',
        is_favorite: body.is_favorite ?? false,
        selected_platform: body.selected_platform ?? null,
        progress: body.progress ?? null,
        score: body.score ?? null,
        notes: body.notes ?? null,
        updated_at: updatedAt,
      } as never,
      { onConflict: 'user_id,media_id' },
    )
    .select('*')
    .single();

  if (entryError) {
    throw entryError;
  }

  // Recompute genre affinity in the background
  void refreshGenreAffinity(supabase, userId);
  // Recompute derived profile fields in the background (directors/actors/authors/studios)
  void recomputeCategoryProfiles(supabase, userId, [mediaCategory]).catch(error => {
    console.warn(`${config.logPrefix} derived profile recompute failed:`, error);
  });

  // Log activity
  await insertActivity(supabase, userId, 'media_added', {
    category: mediaCategory,
    title: mediaTitle,
    mediaId: body.mediaId!,
    status: body.status ?? 'planned',
    username: (profileData as UserProfile)?.username,
    display_name: (profileData as UserProfile)?.display_name,
    avatar_url: (profileData as UserProfile)?.avatar_url,
  });

  revalidateUserMediaMutation(userId, config.key);

  return NextResponse.json({ entry });
}

/**
 * Handles adding media from external source (new media from API)
 */
async function handleExternalSource(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  userId: string,
  body: AddMediaRequestBody,
  config: MediaCategoryConfig,
): Promise<Response> {
  const payload =
    body.payload && config.sanitizePayload ? config.sanitizePayload(body.payload) : body.payload;

  // Validate external ID exists (the primary field, or one of its alternates)
  const externalIdValue = resolveExternalIdValue(config, payload!);
  if (!externalIdValue || !payload!.category) {
    return NextResponse.json({ error: MISSING_PAYLOAD }, { status: 400 });
  }
  if (config.key === 'games') {
    // Strict guard for games: only IGDB-backed payloads are accepted for external add
    if (payload?.category !== 'games') {
      return NextResponse.json({ error: 'Invalid games category payload' }, { status: 422 });
    }
    if (payload?.source !== 'igdb') {
      return NextResponse.json({ error: 'Only IGDB source is allowed for games' }, { status: 422 });
    }
    if (typeof payload?.igdb_id !== 'number' || !Number.isFinite(payload.igdb_id)) {
      return NextResponse.json({ error: 'Missing or invalid igdb_id' }, { status: 422 });
    }
    if (
      !isAllowedIgdbGameCandidate({
        category: typeof payload?.igdb_category === 'number' ? payload.igdb_category : null,
        name:
          typeof payload?.title_english === 'string'
            ? payload.title_english
            : typeof payload?.title === 'string'
              ? payload.title
              : null,
        slug: typeof payload?.igdb_slug === 'string' ? payload.igdb_slug : null,
      })
    ) {
      return NextResponse.json({ ok: false, error: 'Unsupported IGDB category' }, { status: 422 });
    }
  }

  // Fetch user profile for activity logging
  const { data: profileData } = await supabase
    .from('users')
    .select('username, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  // Check if media already exists
  let mediaId = await findExistingMedia(supabase, config, payload!, payload!.category as string);
  let insertedNewMedia = false;

  // A second provider can know what the first did not: fill the existing row's gaps
  if (mediaId && config.backfillFields) {
    await backfillMediaGaps(
      getSupabaseServer(),
      mediaId,
      payload!,
      config.backfillFields,
      config.logPrefix,
    );
  }

  // Insert new media if doesn't exist
  if (!mediaId) {
    // Apply payload mapper if configured (e.g., for games)
    let insertPayload = payload!;
    if (config.payloadMapper) {
      insertPayload = config.payloadMapper(payload!) as typeof insertPayload;
    }

    // Enrich payload if configured (e.g., for movies)
    if (config.enricher) {
      const enrichedData = await config.enricher(
        payload!.category as string,
        externalIdValue,
        insertPayload,
      );
      insertPayload = { ...insertPayload, ...enrichedData };
    }
    // Enrichment can bring in a cover of its own; clean the final payload too
    if (config.sanitizePayload) {
      insertPayload = config.sanitizePayload(insertPayload);
    }

    // Use service role client for catalog writes (RLS blocks user writes)
    const supabaseAdmin = getSupabaseServer();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('media_items')
      .insert(insertPayload as never)
      .select('id')
      .single();

    if (insertError) {
      // Duplicate key (23505) = another request inserted this media concurrently.
      // Re-fetch the existing row instead of crashing.
      // The enriched payload is used: enrichment can add an id (e.g. nlg_id)
      // that is the one that collided.
      if (insertError.code === '23505') {
        mediaId = await findExistingMedia(
          supabase,
          config,
          insertPayload,
          payload!.category as string,
        );
      } else {
        throw insertError;
      }
    } else {
      mediaId = (inserted as { id?: number } | null)?.id ?? null;
      insertedNewMedia = true;
    }
  }

  if (!mediaId) {
    return NextResponse.json({ error: FAILED_TO_RESOLVE_MEDIA_ID }, { status: 500 });
  }

  // Upsert user media entry
  const updatedAt = new Date().toISOString();
  const { data: entry, error: entryError } = await supabase
    .from('user_media_entries')
    .upsert(
      {
        user_id: userId,
        media_id: mediaId,
        status: body.status ?? 'planned',
        is_favorite: body.is_favorite ?? false,
        selected_platform: body.selected_platform ?? null,
        progress: body.progress ?? null,
        score: body.score ?? null,
        notes: body.notes ?? null,
        updated_at: updatedAt,
      } as never,
      { onConflict: 'user_id,media_id' },
    )
    .select('*')
    .single();

  if (entryError) {
    throw entryError;
  }

  // Recompute genre affinity in the background
  void refreshGenreAffinity(supabase, userId);
  // Recompute derived profile fields in the background (directors/actors/authors/studios)
  void recomputeCategoryProfiles(supabase, userId, [payload!.category as string]).catch(error => {
    console.warn(`${config.logPrefix} derived profile recompute failed:`, error);
  });

  // Resolve title from payload
  const mediaTitle = resolveTitle(payload!, config.titlePriority);

  // Log activity
  await insertActivity(supabase, userId, 'media_added', {
    category: payload!.category,
    title: mediaTitle,
    mediaId,
    status: body.status ?? 'planned',
    username: (profileData as UserProfile)?.username,
    display_name: (profileData as UserProfile)?.display_name,
    avatar_url: (profileData as UserProfile)?.avatar_url,
  });

  if (insertedNewMedia) {
    revalidateCache.publicStats();
  }

  revalidateUserMediaMutation(userId, config.key);

  return NextResponse.json({ entry, mediaId });
}
