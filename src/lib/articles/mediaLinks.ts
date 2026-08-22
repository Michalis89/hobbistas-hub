import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export type ArticleMediaRole = 'subject' | 'mentioned';

export type ArticleMediaLink = {
  media_id: number;
  role: ArticleMediaRole;
  position: number;
};

type DocNode = {
  type?: string;
  attrs?: Record<string, unknown> | null;
  content?: DocNode[] | null;
};

const readMediaId = (node: DocNode): number | null => {
  const raw = node.attrs?.mediaId;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
};

/** Depth-first walk so embed order matches reading order. */
function collectMediaCardIds(node: DocNode, into: number[]): void {
  if (node.type === 'mediaCard') {
    const mediaId = readMediaId(node);
    if (mediaId !== null) {
      into.push(mediaId);
    }
  }

  for (const child of node.content ?? []) {
    collectMediaCardIds(child, into);
  }
}

/**
 * Derives the media links an article should have.
 *
 * `subject` is what the article is about, taken from `articles.media_id`.
 * `mentioned` is everything embedded in the body as a media card. The subject
 * wins if it also appears inline, because a row can only carry one role.
 */
export function collectArticleMediaLinks({
  contentRich,
  subjectMediaId,
}: {
  contentRich: unknown;
  subjectMediaId?: number | null;
}): ArticleMediaLink[] {
  const links: ArticleMediaLink[] = [];
  const seen = new Set<number>();

  if (
    typeof subjectMediaId === 'number' &&
    Number.isInteger(subjectMediaId) &&
    subjectMediaId > 0
  ) {
    links.push({ media_id: subjectMediaId, role: 'subject', position: 0 });
    seen.add(subjectMediaId);
  }

  let doc: DocNode | null = null;
  if (typeof contentRich === 'string') {
    try {
      doc = JSON.parse(contentRich) as DocNode;
    } catch {
      doc = null;
    }
  } else if (contentRich && typeof contentRich === 'object') {
    doc = contentRich as DocNode;
  }

  if (doc) {
    const mentioned: number[] = [];
    collectMediaCardIds(doc, mentioned);

    for (const mediaId of mentioned) {
      if (seen.has(mediaId)) {
        continue;
      }
      seen.add(mediaId);
      links.push({ media_id: mediaId, role: 'mentioned', position: links.length });
    }
  }

  return links;
}

/**
 * Replaces an article's media links with the given set.
 *
 * Links are derived data, so this deliberately does not fail the article save:
 * a failure here leaves stale links, which the next save corrects, and is much
 * less costly than losing the author's writing.
 */
export async function syncArticleMediaLinks(
  supabase: SupabaseClient<Database>,
  articleId: number,
  links: ArticleMediaLink[],
): Promise<void> {
  try {
    const { error: deleteError } = await supabase
      .from('article_media_links')
      .delete()
      .eq('article_id', articleId);

    if (deleteError) {
      console.error('Failed to clear article media links', deleteError);
      return;
    }

    if (links.length === 0) {
      return;
    }

    const { error: insertError } = await supabase
      .from('article_media_links')
      .insert(links.map(link => ({ ...link, article_id: articleId })));

    if (insertError) {
      console.error('Failed to write article media links', insertError);
    }
  } catch (error) {
    console.error('Article media link sync failed', error);
  }
}

export type LinkedArticleCard = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  topic: string | null;
  published_at: string | null;
  role: ArticleMediaRole;
};

/**
 * Published articles that point at a media item.
 *
 * Subjects come first: a review of the thing matters more on its page than an
 * article that merely name-checks it.
 */
export async function fetchArticlesForMedia(
  supabase: SupabaseClient<Database>,
  mediaId: number,
  limit = 6,
): Promise<LinkedArticleCard[]> {
  const { data, error } = await supabase
    .from('article_media_links')
    .select(
      'role, articles!inner(id, slug, title, description, cover_image, topic, published_at, status)',
    )
    .eq('media_id', mediaId)
    .eq('articles.status', 'published')
    .limit(limit);

  if (error) {
    console.error('Failed to load articles for media item', error);
    return [];
  }

  type Row = { role: string; articles: Omit<LinkedArticleCard, 'role'> | null };

  return ((data ?? []) as unknown as Row[])
    .filter((row): row is Row & { articles: Omit<LinkedArticleCard, 'role'> } =>
      Boolean(row.articles),
    )
    .map(
      (row): LinkedArticleCard => ({
        ...row.articles,
        role: row.role === 'subject' ? 'subject' : 'mentioned',
      }),
    )
    .sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'subject' ? -1 : 1;
      }
      return (b.published_at ?? '').localeCompare(a.published_at ?? '');
    });
}
