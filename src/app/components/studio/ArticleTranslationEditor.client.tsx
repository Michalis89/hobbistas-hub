'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { JSONContent } from '@tiptap/core';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/ui/alert';
import {
  ARTICLE_LOCALE_LABELS,
  resolveArticleSeo,
  type ArticleLocale,
  type ArticleSeoFields,
} from '@/lib/articles/locales';
import type { ArticleCategory } from '@/types/database';
import SeoPreview from './SeoPreview';

const RichTextEditor = dynamic(() => import('@/app/components/editor/RichTextEditor.client'), {
  ssr: false,
  loading: () => (
    <div className="h-96 w-full animate-pulse rounded-xl border border-border bg-card" />
  ),
});

type TranslationDraft = {
  title: string;
  description: string;
  contentHtml: string;
  contentRich: JSONContent | null;
  metaTitle: string;
  metaDescription: string;
};

const EMPTY_DRAFT: TranslationDraft = {
  title: '',
  description: '',
  contentHtml: '',
  contentRich: null,
  metaTitle: '',
  metaDescription: '',
};

export const UNSAVED_TRANSLATION_MESSAGE =
  'The Greek translation has unsaved changes. Leave without saving them?';

export type TranslationSaveResult = { ok: true } | { ok: false; error: string };

/** What the composer's single Save Draft / Publish needs from this panel. */
export type ArticleTranslationEditorHandle = {
  /** The title typed in this language (may be unsaved). */
  getTitle: () => string;
  /** Whether there is anything here the server does not have yet. */
  isDirty: () => boolean;
  /**
   * Saves this language for the given article. Resolves without throwing; a
   * failure leaves the changes in place, so the author can simply save again.
   */
  save: (articleId: number) => Promise<TranslationSaveResult>;
};

export type TranslationPanelState = { title: string; dirty: boolean; exists: boolean };

type ArticleTranslationEditorProps = {
  /** The article id, or null while the article has not been saved yet. */
  readonly articleId: number | null;
  readonly locale: ArticleLocale;
  readonly mediaCategory: ArticleCategory | '';
  /** The source-language fields the translation's metadata falls back to. */
  readonly source: ArticleSeoFields;
  readonly slug: string;
  readonly basePath: string;
  /** False while another language's tab is showing; the panel stays mounted. */
  readonly active?: boolean;
  readonly onStateChange?: (state: TranslationPanelState) => void;
};

/** Whether the text fields differ from what was last loaded or saved. */
const textFieldsDiffer = (a: TranslationDraft, b: TranslationDraft) =>
  a.title !== b.title ||
  a.description !== b.description ||
  a.metaTitle !== b.metaTitle ||
  a.metaDescription !== b.metaDescription;

/**
 * The Greek version of an article, shown as a language tab of the composer.
 *
 * Editable from the start, before the article has been saved: the composer's
 * single Save Draft saves it right after the article row exists. It stays
 * mounted while another tab is showing, so switching languages never loses
 * unsaved work. A version already on the server is loaded once, for an article
 * that existed when the composer opened; an article created during this
 * session has nothing to load, and reloading would wipe what is being typed.
 */
const ArticleTranslationEditor = forwardRef<
  ArticleTranslationEditorHandle,
  ArticleTranslationEditorProps
>(function ArticleTranslationEditor(
  { articleId, locale, mediaCategory, source, slug, basePath, active = true, onStateChange },
  ref,
) {
  const [draft, setDraft] = useState<TranslationDraft>(EMPTY_DRAFT);
  // What the server has: the baseline for "unsaved changes".
  const [saved, setSaved] = useState<TranslationDraft>(EMPTY_DRAFT);
  // The body as the editor renders the saved HTML. TipTap normalises HTML on
  // load and reports that as an update, which is not a change by the author.
  const [savedBodyHtml, setSavedBodyHtml] = useState('');
  const editorTouchedRef = useRef(false);
  // Only an article that already existed when the composer opened has a
  // stored version to load.
  const [loadArticleId] = useState(articleId);
  const [isLoading, setIsLoading] = useState(loadArticleId !== null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Saving and removing exclude each other: an upsert that lands after the
  // DELETE would bring back the version the author just removed. A ref, so
  // the check holds before React re-renders.
  const busyRef = useRef<'saving' | 'removing' | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The editor is uncontrolled after mount, so its starting document is
  // captured once and swapped by remounting rather than by feeding it props.
  const [editorKey, setEditorKey] = useState(0);
  const [editorContent, setEditorContent] = useState('');

  const isDirty = textFieldsDiffer(draft, saved) || draft.contentHtml !== savedBodyHtml;

  // The handle is called from event handlers after render, so these refs are
  // read only then.
  const draftRef = useRef(draft);
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    draftRef.current = draft;
    isDirtyRef.current = isDirty;
  }, [draft, isDirty]);

  useEffect(() => {
    onStateChange?.({ title: draft.title, dirty: isDirty, exists });
  }, [draft.title, isDirty, exists, onStateChange]);

  const load = useCallback(
    async (id: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/articles/${id}/translations`);
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || 'Could not load translations.');
        }
        const body = await response.json();
        const rows = (body?.data?.translations ?? []) as Array<{
          locale: string;
          title: string;
          description: string | null;
          content_html: string | null;
          content_rich: JSONContent | null;
          meta_title: string | null;
          meta_description: string | null;
        }>;
        const row = rows.find(item => item.locale === locale);

        const next: TranslationDraft = row
          ? {
              title: row.title,
              description: row.description ?? '',
              contentHtml: row.content_html ?? '',
              contentRich: row.content_rich,
              metaTitle: row.meta_title ?? '',
              metaDescription: row.meta_description ?? '',
            }
          : EMPTY_DRAFT;
        setDraft(next);
        setSaved(next);
        setSavedBodyHtml(next.contentHtml);
        editorTouchedRef.current = false;
        setEditorContent(next.contentHtml);
        setExists(Boolean(row));
        setEditorKey(current => current + 1);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load translations.');
      } finally {
        setIsLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    if (loadArticleId !== null) {
      void load(loadArticleId);
    }
  }, [loadArticleId, load]);

  // Warn before the page unloads, and before in-app links navigate away,
  // while there are unsaved translation changes.
  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }
    let leaving = false;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaving) {
        event.preventDefault();
      }
    };
    const onLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.target && anchor.target !== '_self') {
        return;
      }
      if (anchor.hasAttribute('download')) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      const samePage =
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search;
      if (samePage) {
        return;
      }
      if (window.confirm(UNSAVED_TRANSLATION_MESSAGE)) {
        // The author chose to leave: do not ask again on unload.
        leaving = true;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onLinkClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onLinkClick, true);
    };
  }, [isDirty]);

  useImperativeHandle(
    ref,
    () => ({
      getTitle: () => draftRef.current.title,
      isDirty: () => isDirtyRef.current,
      save: async (id: number): Promise<TranslationSaveResult> => {
        const submitted = draftRef.current;
        if (submitted.title.trim() === '') {
          const message = `The ${ARTICLE_LOCALE_LABELS[locale]} version needs a title before it can be saved.`;
          setError(message);
          return { ok: false, error: message };
        }
        if (busyRef.current === 'removing') {
          const message = `The ${ARTICLE_LOCALE_LABELS[locale]} version is being removed. Save again once that has finished.`;
          setError(message);
          return { ok: false, error: message };
        }
        busyRef.current = 'saving';
        setIsSaving(true);
        setError(null);
        try {
          const response = await fetch(`/api/articles/${id}/translations`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              locale,
              title: submitted.title,
              description: submitted.description,
              content_html: submitted.contentHtml,
              content_rich: submitted.contentRich,
              meta_title: submitted.metaTitle,
              meta_description: submitted.metaDescription,
            }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.error || 'Could not save the translation.');
          }
          // The baseline is what was sent, so edits made while saving stay dirty.
          setSaved(submitted);
          setSavedBodyHtml(submitted.contentHtml);
          // Callers may ask again before the next render (Publish right after
          // the draft step), so the answer is updated now, not by the effect.
          isDirtyRef.current =
            textFieldsDiffer(draftRef.current, submitted) ||
            draftRef.current.contentHtml !== submitted.contentHtml;
          setExists(true);
          setSavedAt(Date.now());
          return { ok: true };
        } catch (saveError) {
          const message =
            saveError instanceof Error ? saveError.message : 'Could not save the translation.';
          setError(message);
          return { ok: false, error: message };
        } finally {
          busyRef.current = null;
          setIsSaving(false);
        }
      },
    }),
    [locale],
  );

  const remove = async () => {
    if (articleId === null || busyRef.current !== null) {
      return;
    }
    busyRef.current = 'removing';
    setIsRemoving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/articles/${articleId}/translations?locale=${encodeURIComponent(locale)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Could not remove the translation.');
      }
      // Updated now as well, so a save that asks before the next render does
      // not send the removed version back.
      draftRef.current = EMPTY_DRAFT;
      isDirtyRef.current = false;
      setDraft(EMPTY_DRAFT);
      setSaved(EMPTY_DRAFT);
      setSavedBodyHtml('');
      editorTouchedRef.current = false;
      setEditorContent('');
      setEditorKey(current => current + 1);
      setExists(false);
      setSavedAt(null);
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : 'Could not remove the translation.',
      );
    } finally {
      busyRef.current = null;
      setIsRemoving(false);
    }
  };

  const update = (partial: Partial<TranslationDraft>) =>
    setDraft(current => ({ ...current, ...partial }));

  const updateBody = (partial: Partial<TranslationDraft>) => {
    update(partial);
    // Until the author interacts with the editor, its updates are TipTap
    // normalising the loaded document, not edits.
    if (!editorTouchedRef.current && partial.contentHtml !== undefined) {
      setSavedBodyHtml(partial.contentHtml);
    }
  };
  const markEditorTouched = () => {
    editorTouchedRef.current = true;
  };

  const seo = resolveArticleSeo(
    source,
    {
      title: draft.title,
      description: draft.description,
      meta_title: draft.metaTitle,
      meta_description: draft.metaDescription,
    },
    locale,
  );

  return (
    <section
      className="space-y-4"
      hidden={!active}
      lang={locale}
      aria-label={`${ARTICLE_LOCALE_LABELS[locale]} version`}
    >
      {error ? <ErrorAlert message={error} /> : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          <Input
            label="Title"
            value={draft.title}
            onChange={event => update({ title: event.target.value })}
            placeholder={`Title in ${ARTICLE_LOCALE_LABELS[locale]}`}
            lang={locale}
            spellCheck
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="translation-desc">
              Standfirst
            </label>
            <Textarea
              id="translation-desc"
              value={draft.description}
              onChange={event => update({ description: event.target.value })}
              placeholder="Shown in cards and search results"
              lang={locale}
              spellCheck
              rows={2}
            />
          </div>

          <div
            onKeyDownCapture={markEditorTouched}
            onPointerDownCapture={markEditorTouched}
            onPasteCapture={markEditorTouched}
            onDropCapture={markEditorTouched}
          >
            <RichTextEditor
              key={editorKey}
              label="Body"
              value={editorContent}
              placeholder={`Write the ${ARTICLE_LOCALE_LABELS[locale]} version...`}
              mediaCategory={mediaCategory}
              onChange={html => updateBody({ contentHtml: html })}
              onChangeJson={json => updateBody({ contentRich: json })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Meta title"
              value={draft.metaTitle}
              onChange={event => update({ metaTitle: event.target.value })}
              placeholder="Defaults to the title above"
              lang={locale}
            />
            <Input
              label="Meta description"
              value={draft.metaDescription}
              onChange={event => update({ metaDescription: event.target.value })}
              placeholder="Defaults to the standfirst above"
              lang={locale}
            />
          </div>

          <SeoPreview seo={seo} slug={slug} basePath={basePath} locale={locale} />
          {draft.title.trim() === '' ? (
            <p className="text-xs text-muted-foreground">
              Until it has a title, this version is not saved or published and its URL shows the
              source language.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {savedAt && !isDirty ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check size={13} className="text-success" />
                {ARTICLE_LOCALE_LABELS[locale]} saved
              </span>
            ) : null}

            {exists ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isRemoving || isSaving}
                onClick={() => void remove()}
                className="ml-auto text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
                Remove {ARTICLE_LOCALE_LABELS[locale]} version
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Not autosaved: this version is saved only by Save draft and Publish. Empty meta fields
            use this version&apos;s title and standfirst first, then the English ones.
          </p>
        </>
      )}
    </section>
  );
});

export default ArticleTranslationEditor;
