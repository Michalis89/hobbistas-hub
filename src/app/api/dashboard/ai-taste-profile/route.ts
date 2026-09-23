import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { API_ERRORS } from '@/lib/api/errors';
import { fail } from '@/lib/api/response';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { withApiRoute } from '@/lib/observability/withApiRoute';
import { isAiTasteSupportedCategory } from '@/lib/ai/capabilities';
import { generateAiTasteProfileForCategory } from '@/lib/ai/dispatch/taste-profile';

async function GETHandler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = (searchParams.get('category') || 'games').toLowerCase();
    // Rejected before authentication work, a rate-limit slot or any import of a category module:
    // an unsupported category must cost nothing at all. Support comes from the registry, so
    // enabling a new category here is a registry edit rather than a change to this route.
    if (!isAiTasteSupportedCategory(category)) {
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

    const profile = await generateAiTasteProfileForCategory(supabase, session.user.id, category);
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
    console.error('[ai-taste-profile] route failed:', error);
    return NextResponse.json({ profile: null }, { status: 200 });
  }
}

/**
 * A cache miss reaches Gemini, and the anime path may spend two calls before it has an answer.
 * The route has to be allowed to outlive that, or the platform kills the request mid-generation
 * and the work is lost without a cache row to show for it.
 */
export const maxDuration = 60;

export const GET = withApiRoute(GETHandler);
