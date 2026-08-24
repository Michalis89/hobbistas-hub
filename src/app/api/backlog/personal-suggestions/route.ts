import { after, NextResponse } from 'next/server';
import { withApiRoute } from '@/lib/observability/withApiRoute';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { API_ERRORS } from '@/lib/api/errors';
import { fail } from '@/lib/api/response';
import type { DashboardCategoryKey } from '@/lib/dashboard/category-data';
import { DEFAULT_COVER } from '@/lib/constants/messages';
import type { RecommendationCategory } from '@/lib/recommendations/v3/types';
import {
  buildRecommendationServe,
  recordRecommendationImpressions,
} from '@/lib/recommendations/instrumentation/serve';

const ALLOWED_CATEGORIES: DashboardCategoryKey[] = [
  'games',
  'anime',
  'manga',
  'movies',
  'tv',
  'books',
];

function isDashboardCategory(value: string): value is DashboardCategoryKey {
  return ALLOWED_CATEGORIES.includes(value as DashboardCategoryKey);
}

async function GETHandler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCategory = (searchParams.get('category') || 'games').toLowerCase();
    const category: DashboardCategoryKey = isDashboardCategory(rawCategory) ? rawCategory : 'games';

    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);
    const userId = session.user.id;

    const { generateRecommendationsV3WithInternals } = await import(
      '@/lib/recommendations/v3/recommender'
    );
    const { response, gamesShadowContext } = await generateRecommendationsV3WithInternals(
      userId,
      category as RecommendationCategory,
    );

    const served = response.possibleNext.slice(0, 4);
    const serve = buildRecommendationServe({
      userId,
      category,
      surface: 'backlog_personal_suggestions',
      slots: served.map((item, index) => ({
        mediaId: item.mediaDbId,
        source: item.source,
        subtype: item.source,
        deterministicRank: index + 1,
      })),
    });

    // Map V3 response to the existing API shape consumed by the dashboard
    const items = served.map((item, index) => ({
      source: 'local' as const,
      id: item.id,
      mediaId: item.mediaDbId,
      title: item.title,
      subtitle: item.reason,
      status: 'planned' as const,
      score: (item.confidence * 10).toFixed(1),
      tags: item.matchedSignals ?? [],
      cover: item.cover || DEFAULT_COVER,
      description: item.reason,
      serveId: serve.serveId,
      slotIndex: index,
    }));

    await recordRecommendationImpressions(supabase, serve);

    // Everything above this line is deterministic and is what the user gets. The shadow rerank
    // runs after the response has been flushed, reads nothing back into it, and is scheduled
    // through `after` rather than a bare floating promise because a detached promise in a
    // serverless invocation can be frozen or killed the moment the response is sent.
    if (gamesShadowContext) {
      const shadowInput = {
        supabase,
        userId,
        shortlist: gamesShadowContext.discoveryShortlist,
        continuationContext: gamesShadowContext.continuationContext,
        servedDiscoveryIds: served
          .filter(item => item.source === 'discovery')
          .map(item => item.mediaDbId),
      };

      after(async () => {
        // Dispatched by category rather than calling the games reranker directly. The dispatcher
        // consults the capability registry first, so a category without a registered reranker
        // performs no AI work of any kind — including loading its provider module.
        const { dispatchRerankShadow } = await import('@/lib/ai/dispatch/rerank-shadow');
        await dispatchRerankShadow('games', shadowInput);
      });
    }

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.error('Backlog personal suggestions error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

/**
 * `after` work runs inside the route's max duration, so this has to cover the deterministic
 * response plus a shadow rerank whose provider call is capped at 12s.
 */
export const maxDuration = 30;

export const GET = withApiRoute(GETHandler);
