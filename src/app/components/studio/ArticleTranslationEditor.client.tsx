'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { JSONContent } from '@tiptap/core';
import { Check, ChevronDown, Languages, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/ui/alert';
import { ARTICLE_LOCALE_LABELS, type ArticleLocale } from '@/lib/articles/locales';
import type { ArticleCategory } from '@/types/database';

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

type ArticleTranslationEditorProps = {
  readonly articleId: number | null;
  readonly locale: ArticleLocale;
  readonly mediaCategory: ArticleCategory | '';
};

/**
 * Writes the non-source version of an article.
 *
 * Collapsed by default and mounted only once opened: it carries a second
 * TipTap instance, and most editing sessions never touch a translation.
 */
export default function ArticleTranslationEditor({
  articleId,
  locale,
  mediaCategory,
}: ArticleTranslationEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<TranslationDraft>(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The editor is uncontrolled after mount, so its starting document is
  // captured once and swapped by remounting rather than by feeding it props.
  const [editorKey, setEditorKey] = useState(0);
  const [editorContent, setEditorContent] = useState('');

  const load = useCallback(async () => {
    if (articleId === null) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/translations`);
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

      if (row) {
        setDraft({
          title: row.title,
          description: row.description ?? '',
          contentHtml: row.content_html ?? '',
          contentRich: row.content_rich,
          metaTitle: row.meta_title ?? '',
          metaDescription: row.meta_description ?? '',
        });
        setEditorContent(row.content_html ?? '');
        setExists(true);
      } else {
        setDraft(EMPTY_DRAFT);
        setEditorContent('');
        setExists(false);
      }
      setEditorKey(current => current + 1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load translations.');
    } finally {
      setIsLoading(false);
    }
  }, [articleId, locale]);

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [isOpen, load]);

  const save = async () => {
    if (articleId === null) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/translations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          title: draft.title,
          description: draft.description,
          content_html: draft.contentHtml,
          content_rich: draft.contentRich,
          meta_title: draft.metaTitle,
          meta_description: draft.metaDescription,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Could not save the translation.');
      }
      setExists(true);
      setSavedAt(Date.now());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the translation.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (articleId === null) {
      return;
    }
    setIsSaving(true);
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
      setDraft(EMPTY_DRAFT);
      setEditorContent('');
      setEditorKey(current => current + 1);
      setExists(false);
      setSavedAt(null);
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : 'Could not remove the translation.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const update = (partial: Partial<TranslationDraft>) =>
    setDraft(current => ({ ...current, ...partial }));

  if (articleId === null) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Languages size={16} />
          {ARTICLE_LOCALE_LABELS[locale]} version
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Save the article first - a translation needs something to attach to.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        className="hover:bg-surface-hover flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-colors"
      >
        <Languages size={16} className="shrink-0 text-muted-foreground" />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {ARTICLE_LOCALE_LABELS[locale]} version
          </span>
          <span className="block text-xs text-muted-foreground">
            {exists
              ? 'Readers can switch to this version.'
              : 'Not written yet - readers only see the source language.'}
          </span>
        </span>
        {exists ? (
          <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-success">
            Live
          </span>
        ) : null}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen ? (
        <div className="space-y-4 border-t border-border p-5">
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

              <RichTextEditor
                key={editorKey}
                label="Body"
                value={editorContent}
                placeholder={`Write the ${ARTICLE_LOCALE_LABELS[locale]} version...`}
                mediaCategory={mediaCategory}
                onChange={html => update({ contentHtml: html })}
                onChangeJson={json => update({ contentRich: json })}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Meta title"
                  value={draft.metaTitle}
                  onChange={event => update({ metaTitle: event.target.value })}
                  placeholder="Falls back to the source language"
                  lang={locale}
                />
                <Input
                  label="Meta description"
                  value={draft.metaDescription}
                  onChange={event => update({ metaDescription: event.target.value })}
                  placeholder="Falls back to the source language"
                  lang={locale}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isSaving || draft.title.trim() === ''}
                  onClick={() => void save()}
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save {ARTICLE_LOCALE_LABELS[locale]}
                </Button>

                {savedAt ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check size={13} className="text-success" />
                    Saved
                  </span>
                ) : null}

                {exists ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void remove()}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                    Remove
                  </Button>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Empty fields fall back to the source language, so a translated title and body are
                enough. The switcher appears on the article once this has a title.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
