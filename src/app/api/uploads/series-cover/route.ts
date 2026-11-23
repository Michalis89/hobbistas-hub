import { withApiRoute } from '@/lib/observability/withApiRoute';

import { NextResponse } from 'next/server';
import { uploadArticleImage } from '@/lib/api/uploads/articleImages';
import { SERIES_STUDIO_ROLES } from '@/lib/articles/seriesAccess';

/**
 * Cover art for an article series. Same pipeline, bucket and validation as
 * article covers; the only difference is who may upload: everyone who may
 * open Series Management, which includes moderators. Not tied to a series id,
 * so a cover can be uploaded before the series is created.
 */
async function POSTHandler(request: Request) {
  const result = await uploadArticleImage(request, {
    pathPrefix: 'series-cover',
    allowedRoles: SERIES_STUDIO_ROLES,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}

export const POST = withApiRoute(POSTHandler);
