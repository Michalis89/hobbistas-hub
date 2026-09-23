import { withApiRoute } from '@/lib/observability/withApiRoute';

import { NextResponse } from 'next/server';
import { uploadArticleImage } from '@/lib/api/uploads/articleImages';

async function POSTHandler(request: Request) {
  const result = await uploadArticleImage(request, { pathPrefix: 'cover' });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}

export const POST = withApiRoute(POSTHandler);
