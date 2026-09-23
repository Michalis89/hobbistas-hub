import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiRoute } from '@/lib/observability/withApiRoute';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { API_ERRORS } from '@/lib/api/errors';
import { fail } from '@/lib/api/response';
import { rateLimit } from '@/lib/rate-limit';

const ClickEventSchema = z.object({
  serveId: z.string().uuid(),
  mediaId: z.number().int().positive(),
  eventType: z.literal('click'),
});

/**
 * Records an interaction with a recommendation the server already knows it served.
 *
 * The client sends only the serve id, the media id and the event kind. Everything analytical —
 * slot index, source, subtype, deterministic rank, category — is copied from the matching
 * impression row, so the shape of the data cannot be influenced from the browser, and a click
 * against a serve that was never recorded (or belongs to somebody else) is simply dropped.
 *
 * Always answers 204. This is telemetry attached to a navigation: there is nothing the caller
 * could usefully do with an error, and `sendBeacon` cannot read the response anyway.
 */
async function POSTHandler(req: Request) {
  const noContent = new NextResponse(null, { status: 204 });

  try {
    // sendBeacon sends a Blob, so the content type is not necessarily JSON.
    const raw = await req.text();
    const parsed = ClickEventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return noContent;
    }

    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);
    const userId = session.user.id;

    const limit = await rateLimit('apiGeneral', userId);
    if (!limit.success) {
      return noContent;
    }

    const { data: impression } = await supabase
      .from('recommendation_events')
      .select('category, surface, slot_index, source, subtype, deterministic_rank')
      .eq('user_id', userId)
      .eq('serve_id', parsed.data.serveId)
      .eq('media_id', parsed.data.mediaId)
      .eq('event_type', 'impression')
      .maybeSingle();

    if (!impression) {
      return noContent;
    }

    await supabase.from('recommendation_events').upsert(
      {
        user_id: userId,
        serve_id: parsed.data.serveId,
        media_id: parsed.data.mediaId,
        category: impression.category,
        surface: impression.surface,
        slot_index: impression.slot_index,
        source: impression.source,
        subtype: impression.subtype,
        deterministic_rank: impression.deterministic_rank,
        event_type: parsed.data.eventType,
      },
      { onConflict: 'serve_id,media_id,event_type', ignoreDuplicates: true },
    );

    return noContent;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.warn('[recommendation-events] click write failed:', error);
    return noContent;
  }
}

export const POST = withApiRoute(POSTHandler);
