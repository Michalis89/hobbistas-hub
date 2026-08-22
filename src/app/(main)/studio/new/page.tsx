import { requireStudioAccess } from '@/lib/articles/studioAccess';
import { PageContainer } from '@/app/components/layout';
import ArticleComposer from '@/app/components/studio/ArticleComposer.client';
import { emptyDraft } from '@/lib/articles/draft';

export const dynamic = 'force-dynamic';

export default async function NewArticlePage() {
  const { canWriteArticles, canWriteReviews } = await requireStudioAccess();

  return (
    <PageContainer size="xl">
      <ArticleComposer
        initialDraft={emptyDraft(canWriteArticles ? 'article' : 'review')}
        initialId={null}
        initialSlug={null}
        previewPath={null}
        canWriteArticles={canWriteArticles}
        canWriteReviews={canWriteReviews}
      />
    </PageContainer>
  );
}
