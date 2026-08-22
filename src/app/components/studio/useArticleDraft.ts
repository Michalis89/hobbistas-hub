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
  isSaveable,
  type ComposerDraft,
  type SaveState,
} from '@/lib/articles/draft';

type UseArticleDraftOptions = {
  initial: ComposerDraft;
  initialId: number | null;
  /** Called after the first autosave creates the article, to swap the URL. */
  onCreated?: (id: number) => void;
};

export function useArticleDraft({ initial, initialId, onCreated }: UseArticleDraftOptions) {
  const [draft, setDraft] = useState<ComposerDraft>(initial);
  const [articleId, setArticleId] = useState<number | null>(initialId);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirtyRef = useRef(false);
  const inFlightRef = useRef(false);
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

      if (!isSaveable(current) || inFlightRef.current) {
        return false;
      }

      inFlightRef.current = true;
      setSaveState('saving');
      setError(null);

      try {
        const payload = buildArticlePayload(current);
        const id = articleIdRef.current;

        const response = id
          ? await fetch(`/api/articles/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payload,
                ...(options.status ? { status: options.status } : {}),
              }),
            })
          : await fetch('/api/articles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payload,
                slug: slugify(current.title),
                status: options.status ?? 'draft',
              }),
            });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || body?.message || 'Save failed');
        }

        if (!id) {
          const body = await response.json().catch(() => null);
          const createdId = body?.data?.article?.id ?? body?.article?.id ?? null;
          if (typeof createdId === 'number') {
            setArticleId(createdId);
            articleIdRef.current = createdId;
            onCreated?.(createdId);
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
      }
    },
    [onCreated],
  );

  // Debounced autosave. Long-form writing is the reason the composer is a page
  // and not a modal; losing an hour of work to a stray click is not acceptable.
  useEffect(() => {
    if (!isDirtyRef.current || !isSaveable(draft)) {
      return undefined;
    }

    const timer = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [draft, save]);

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
  };
}
