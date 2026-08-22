import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Minimum gap between two snapshots of the same article.
 *
 * The studio autosaves every couple of seconds. Snapshotting each save would
 * fill the twenty retained revisions with a single minute of typing, which is
 * the opposite of what history is for.
 */
export const REVISION_MIN_INTERVAL_MS = 10 * 60 * 1000;

export type SnapshotDecisionInput = {
  /** Status of the article as it is stored right now, before this update. */
  existingStatus: string | null;
  /** Timestamp of the newest existing revision, if any. */
  lastRevisionAt: string | null;
  /** True when this update touches title, description or body. */
  contentChanging: boolean;
  now: number;
};

/**
 * Decides whether the pre-edit state is worth keeping.
 *
 * Only published articles are protected: a draft that has never been seen by a
 * reader has nothing to fall back to, and its autosaves are the history.
 */
export function shouldSnapshot({
  existingStatus,
  lastRevisionAt,
  contentChanging,
  now,
}: SnapshotDecisionInput): boolean {
  if (!contentChanging || existingStatus !== 'published') {
    return false;
  }

  if (!lastRevisionAt) {
    return true;
  }

  const previous = new Date(lastRevisionAt).getTime();
  if (Number.isNaN(previous)) {
    return true;
  }

  return now - previous >= REVISION_MIN_INTERVAL_MS;
}

type SnapshotSource = {
  id: number;
  title?: string | null;
  description?: string | null;
  content_rich?: unknown;
  content_html?: string | null;
  status?: string | null;
};

/**
 * Stores the article's current content as a revision, if it is worth storing.
 *
 * Never throws: losing a history entry is a far smaller problem than failing
 * the author's save because of it.
 */
export async function snapshotArticleRevision(
  supabase: SupabaseClient<Database>,
  article: SnapshotSource,
  authorId: string,
  contentChanging: boolean,
): Promise<void> {
  try {
    const { data: latest } = await supabase
      .from('article_revisions')
      .select('created_at')
      .eq('article_id', article.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const decision = shouldSnapshot({
      existingStatus: article.status ?? null,
      lastRevisionAt: latest?.created_at ?? null,
      contentChanging,
      now: Date.now(),
    });

    if (!decision) {
      return;
    }

    const { error } = await supabase.from('article_revisions').insert({
      article_id: article.id,
      author_id: authorId,
      title: article.title ?? null,
      description: article.description ?? null,
      content_rich: (article.content_rich ?? null) as never,
      content_html: article.content_html ?? null,
    });

    if (error) {
      console.error('Failed to store article revision', error);
    }
  } catch (error) {
    console.error('Article revision snapshot failed', error);
  }
}
