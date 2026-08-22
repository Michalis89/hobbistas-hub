import { withApiRoute } from '@/lib/observability/withApiRoute';

import { NextResponse } from 'next/server';
import { uploadArticleImage } from '@/lib/api/uploads/articleImages';

/**
 * Images embedded in an article body. Separate from the cover endpoint so the
 * two kinds of asset stay distinguishable in the storage bucket.
 */
async function POSTHandler(request: Request) {
  const result = await uploadArticleImage(request, { pathPrefix: 'inline' });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}

export const POST = withApiRoute(POSTHandler);
