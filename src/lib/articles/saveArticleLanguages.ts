/**
 * One Save draft / Publish for an article and its Greek version.
 *
 * The article row (English, shared fields) and the translation are separate
 * writes; there is no cross-table transaction from the browser. Each write is
 * an idempotent upsert, so the safe answer to a partial failure is to keep the
 * unsaved changes in the editor, say exactly what was saved, and let the author
 * press Save again.
 *
 * Order:
 *   - the article row is written first when it does not exist yet, because the
 *     translation needs its id;
 *   - when publishing an article that already exists, the translation is saved
 *     first and a failure stops the publish, so an article never goes live
 *     while its latest Greek changes silently stay behind.
 */

export type TranslationPanel = {
  getTitle: () => string;
  isDirty: () => boolean;
  save: (articleId: number) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export type LanguageSaveResult = {
  /** Whether the article row was written. */
  articleSaved: boolean;
  /** What happened to the Greek version. */
  translation: 'saved' | 'unchanged' | 'failed' | 'needs-title';
  /** A message for the author when anything was not saved. */
  error: string | null;
};

const NEEDS_TITLE = 'Greek changes were not saved: the Greek version needs a title.';

export async function saveArticleLanguages({
  saveArticle,
  getArticleId,
  translation,
  publishing = false,
}: {
  /** Writes the article row (POST or PUT); resolves false on failure. */
  saveArticle: () => Promise<boolean>;
  getArticleId: () => number | null;
  translation: TranslationPanel | null;
  publishing?: boolean;
}): Promise<LanguageSaveResult> {
  const pending = translation?.isDirty() ?? false;
  const hasTitle = (translation?.getTitle() ?? '').trim() !== '';
  const existingId = getArticleId();

  if (publishing && existingId !== null && pending && hasTitle && translation) {
    const first = await translation.save(existingId);
    if (!first.ok) {
      return {
        articleSaved: false,
        translation: 'failed',
        error: `Not published: the Greek version could not be saved (${first.error}).`,
      };
    }
    const articleSaved = await saveArticle();
    return { articleSaved, translation: 'saved', error: null };
  }

  const articleSaved = await saveArticle();
  if (!articleSaved) {
    // The article's own error is already on screen; nothing else was written.
    return { articleSaved: false, translation: pending ? 'failed' : 'unchanged', error: null };
  }

  if (!pending || !translation) {
    return { articleSaved: true, translation: 'unchanged', error: null };
  }
  if (!hasTitle) {
    return { articleSaved: true, translation: 'needs-title', error: NEEDS_TITLE };
  }

  const id = getArticleId();
  if (id === null) {
    return {
      articleSaved: true,
      translation: 'failed',
      error: 'Greek changes were not saved: the article has no id yet. Save again.',
    };
  }
  const result = await translation.save(id);
  return result.ok
    ? { articleSaved: true, translation: 'saved', error: null }
    : {
        articleSaved: true,
        translation: 'failed',
        error: `The English version was saved, but the Greek version was not (${result.error}). Save again to retry.`,
      };
}
