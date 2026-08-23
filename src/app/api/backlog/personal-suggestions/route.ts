import { NextResponse } from 'next/server';
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

    const { generateRecommendationsV3 } = await import('@/lib/recommendations/v3/recommender');
    const response = await generateRecommendationsV3(userId, category as RecommendationCategory);

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

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    console.error('Backlog personal suggestions error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const GET = withApiRoute(GETHandler);
