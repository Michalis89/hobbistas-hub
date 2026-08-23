import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { API_ERRORS } from '@/lib/api/errors';
import { fail } from '@/lib/api/response';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { withApiRoute } from '@/lib/observability/withApiRoute';
import { generateGameAiTasteProfile } from '@/lib/ai/gaming-taste/service';

async function GETHandler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = (searchParams.get('category') || 'games').toLowerCase();
    if (category !== 'games') {
      return fail(API_ERRORS.BAD_REQUEST, API_ERRORS.BAD_REQUEST.status);
    }

    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);
    const limit = await rateLimit('apiStrict', session.user.id);
    if (!limit.success) {
      return NextResponse.json(
        { profile: null },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const profile = await generateGameAiTasteProfile(supabase, session.user.id);
    return NextResponse.json(
      { profile },
      {
        headers: {
          ...rateLimitHeaders(limit),
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.error('[gaming-ai-taste] route failed:', error);
    return NextResponse.json({ profile: null }, { status: 200 });
  }
}

export const GET = withApiRoute(GETHandler);
