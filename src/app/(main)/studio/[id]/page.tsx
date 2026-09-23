import { notFound } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { requireStudioAccess } from '@/lib/articles/studioAccess';
import { PageContainer } from '@/app/components/layout';
import ArticleComposer from '@/app/components/studio/ArticleComposer.client';
import { draftFromRow } from '@/lib/articles/draft';
import { createPreviewToken } from '@/lib/articles/previewToken';

export const dynamic = 'force-dynamic';

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const articleId = Number.parseInt(id, 10);

  if (!Number.isFinite(articleId)) {
    notFound();
  }

  const { session, canWriteArticles, canWriteReviews, canManageAllContent } =
    await requireStudioAccess();
  const supabase = await createRouteHandlerClient();

  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('id', articleId)
    .single();

  if (!article) {
    notFound();
  }

  // Authors may only open their own drafts; moderators and admins open any.
  if (!canManageAllContent && article.author_id !== session.user.id) {
    notFound();
  }

  // Only unpublished work needs a private link; a published article has a
  // public URL already.
  const previewPath =
    article.status === 'published'
      ? null
      : `${article.topic === 'reviews' ? '/review' : '/articles'}/${article.slug}` +
        `?preview=${createPreviewToken(article.id)}`;

  return (
    <PageContainer size="xl">
      <ArticleComposer
        initialDraft={draftFromRow(article)}
        initialId={article.id}
        initialSlug={article.slug}
        previewPath={previewPath}
        canWriteArticles={canWriteArticles}
        canWriteReviews={canWriteReviews}
      />
    </PageContainer>
  );
}
