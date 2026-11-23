'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArticleStatus } from '@/types/database';
import { slugify } from '@/utils/slugify';
import {
  AUTOSAVE_DELAY_MS,
  buildArticlePayload,
  isSaveable,
  type ComposerDraft,
  type SaveState,
} from '@/lib/articles/draft';

export {
  AUTOSAVE_DELAY_MS,
  buildArticlePayload,
  emptyDraft,
  isPublishable,
  isSaveable,
  type ComposerDraft,
  type SaveState,
} from '@/lib/articles/draft';

/**
 * Sends a save request and, if the server answers 401, copies the browser's
 * current Supabase session into the auth cookies and tries exactly once more.
 *
 * The browser and the httpOnly cookies hold separate copies of the session
 * tokens, and they can drift apart (a token refresh the cookies did not pick
 * up). Re-syncing is the same POST /api/auth/refresh the app already uses; the
 * server still validates the tokens, so nothing is bypassed. A 401 from the
 * article routes is raised by requireAuth before any write, so retrying cannot
 * create a duplicate. Loaded lazily so the hook does not pull in the browser
 * Supabase client until it is needed.
 */
export async function fetchWithSessionResync(send: () => Promise<Response>): Promise<Response> {
  const first = await send();
  if (first.status !== 401) {
    return first;
  }
  const [{ supabase }, { syncCookies }] = await Promise.all([
    import('@/lib/supabase-client'),
    import('@/lib/auth/syncCookies'),
  ]);
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return first;
  }
  const synced = await syncCookies(data.session);
  if (!synced) {
    return first;
  }
  return send();
}

/** What the server settled when the first save created the article. */
export type CreatedArticle = { slug: string | null; previewPath: string | null };

type UseArticleDraftOptions = {
  initial: ComposerDraft;
  initialId: number | null;
  /** Called after the first autosave creates the article, to swap the URL. */
  onCreated?: (id: number, created: CreatedArticle) => void;
  /**
   * Title of the version written in the other language (Greek). A draft with
   * no English title can still be saved when this is set; the slug is then
   * derived from it.
   */
  getOtherLanguageTitle?: () => string;
};

export function useArticleDraft({
  initial,
  initialId,
  onCreated,
  getOtherLanguageTitle,
}: UseArticleDraftOptions) {
  const [draft, setDraft] = useState<ComposerDraft>(initial);
  const [articleId, setArticleId] = useState<number | null>(initialId);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  // Settles when the save in flight (if any) has finished, either way.
  const idleRef = useRef<Promise<void>>(Promise.resolve());
  const draftRef = useRef(draft);
  const articleIdRef = useRef(articleId);

  draftRef.current = draft;
  articleIdRef.current = articleId;

  const update = useCallback((patch: Partial<ComposerDraft>) => {
    isDirtyRef.current = true;
    setDraft(current => ({ ...current, ...patch }));
  }, []);

  /**
   * Persists the draft.
   *
   * The first save creates the article as a draft, every later save updates it
   * in place. `status` is only ever changed by an explicit publish, never by
   * autosave.
   */
  const save = useCallback(
    async (options: { status?: ArticleStatus } = {}): Promise<boolean> => {
      const current = draftRef.current;

      const otherTitle = getOtherLanguageTitle?.() ?? '';
      if (!isSaveable(current, otherTitle) || inFlightRef.current) {
        return false;
      }

      inFlightRef.current = true;
      let markIdle: () => void = () => {};
      idleRef.current = new Promise<void>(resolve => {
        markIdle = resolve;
      });
      setSaveState('saving');
      setError(null);

      try {
        const payload = buildArticlePayload(current);
        const id = articleIdRef.current;

        const response = await fetchWithSessionResync(() =>
          id
            ? fetch(`/api/articles/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...payload,
                  ...(options.status ? { status: options.status } : {}),
                }),
              })
            : fetch('/api/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...payload,
                  // The English title when there is one, otherwise the other
                  // language's: the slug is fixed at creation either way.
                  slug: slugify(current.title.trim() || otherTitle),
                  status: options.status ?? 'draft',
                }),
              }),
        );

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || body?.message || 'Save failed');
        }

        if (!id) {
          const body = await response.json().catch(() => null);
          const created = body?.data?.article ?? body?.article ?? null;
          const createdId = created?.id ?? null;
          if (typeof createdId === 'number') {
            setArticleId(createdId);
            articleIdRef.current = createdId;
            // The server picks the final slug (it may add a suffix) and signs
            // the private preview link.
            const previewPath = body?.data?.preview_path ?? body?.preview_path;
            onCreated?.(createdId, {
              slug: typeof created?.slug === 'string' ? created.slug : null,
              previewPath: typeof previewPath === 'string' ? previewPath : null,
            });
          }
        }

        if (options.status) {
          setDraft(currentDraft => ({ ...currentDraft, status: options.status as ArticleStatus }));
        }

        isDirtyRef.current = false;
        setSaveState('saved');
        setSavedAt(Date.now());
        return true;
      } catch (saveError) {
        setSaveState('error');
        setError(saveError instanceof Error ? saveError.message : 'Save failed');
        return false;
      } finally {
        inFlightRef.current = false;
        markIdle();
      }
    },
    [onCreated, getOtherLanguageTitle],
  );

  // Debounced autosave. Long-form writing is the reason the composer is a page
  // and not a modal; losing an hour of work to a stray click is not acceptable.
  useEffect(() => {
    if (!isDirtyRef.current || !isSaveable(draft, getOtherLanguageTitle?.() ?? '')) {
      return undefined;
    }

    const timer = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [draft, save, getOtherLanguageTitle]);

  return {
    draft,
    update,
    save,
    articleId,
    saveState,
    savedAt,
    error,
    clearError: useCallback(() => setError(null), []),
    hasUnsavedChanges: () => isDirtyRef.current,
    /** The saved article's id, current even right after a save created it. */
    getArticleId: useCallback(() => articleIdRef.current, []),
    /**
     * Resolves once no save is in flight. `save` skips while one is running
     * (right for autosave); an explicit Save draft or Publish waits here first,
     * so it is never silently dropped and never creates the article twice.
     */
    whenIdle: useCallback(() => idleRef.current, []),
  };
}
