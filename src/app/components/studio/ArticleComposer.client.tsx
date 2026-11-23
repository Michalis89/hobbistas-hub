'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleAlert,
  Eye,
  Link as LinkIcon,
  Loader2,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/alert';
import { CONTENT_PUBLISHED_EVENT } from '@/app/constants/contentEvents';
import type { ContentPublishedEventDetail } from '@/app/constants/contentEvents';
import { slugify } from '@/utils/slugify';
import ComposerSidebar from './ComposerSidebar.client';
import RevisionHistory, { type RestoredRevision } from './RevisionHistory.client';
import ArticleTranslationEditor, {
  type ArticleTranslationEditorHandle,
  type TranslationPanelState,
} from './ArticleTranslationEditor.client';
import { isPublishable, isSaveable, useArticleDraft, type ComposerDraft } from './useArticleDraft';
import { saveArticleLanguages } from '@/lib/articles/saveArticleLanguages';

const RichTextEditor = dynamic(() => import('@/app/components/editor/RichTextEditor.client'), {
  ssr: false,
  loading: () => (
    <div className="h-96 w-full animate-pulse rounded-xl border border-border bg-card" />
  ),
});

type ArticleComposerProps = {
  readonly initialDraft: ComposerDraft;
  readonly initialId: number | null;
  readonly initialSlug: string | null;
  /** Private link that reveals this article before it is published. */
  readonly previewPath: string | null;
  readonly canWriteArticles: boolean;
  readonly canWriteReviews: boolean;
};

function SaveIndicator({ state, savedAt }: { state: string; savedAt: number | null }) {
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={13} className="animate-spin" />
        Saving...
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <CircleAlert size={13} />
        Not saved
      </span>
    );
  }
  if (state === 'saved' && savedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check size={13} className="text-success" />
        Saved
      </span>
    );
  }
  return null;
}

export default function ArticleComposer({
  initialDraft,
  initialId,
  initialSlug,
  previewPath,
  canWriteArticles,
  canWriteReviews,
}: ArticleComposerProps) {
  const [slug, setSlug] = useState(initialSlug);
  const [language, setLanguage] = useState<'en' | 'el'>('en');
  const translationRef = useRef<ArticleTranslationEditorHandle>(null);
  const [greek, setGreek] = useState<TranslationPanelState>({
    title: '',
    dirty: false,
    exists: false,
  });
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const handleCreated = useCallback((id: number, createdSlug: string | null) => {
    // The slug is fixed at creation; the previews and links use the stored one.
    if (createdSlug) {
      setSlug(createdSlug);
    }
    // Swap the URL so a reload or a shared link lands on the saved draft.
    // replaceState rather than a navigation: /studio/new and /studio/[id] are
    // different routes, and remounting would drop unsaved work in the other
    // language tab.
    window.history.replaceState(null, '', `/studio/${id}`);
  }, []);
  const getOtherLanguageTitle = useCallback(() => translationRef.current?.getTitle() ?? '', []);

  const {
    draft,
    update,
    save,
    articleId,
    saveState,
    savedAt,
    error,
    clearError,
    hasUnsavedChanges,
    getArticleId,
  } = useArticleDraft({
    initial: initialDraft,
    initialId,
    onCreated: handleCreated,
    getOtherLanguageTitle,
  });

  // The editor is uncontrolled after mount; feeding it the live value back
  // would fight the cursor position, so the initial HTML is captured once.
  const [editorContent, setEditorContent] = useState(initialDraft.contentHtml);
  const [editorKey, setEditorKey] = useState(0);
  const latestHtmlRef = useRef(initialDraft.contentHtml);
  const [isPublishing, setIsPublishing] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);

  const copyPreviewLink = useCallback(async () => {
    if (!previewPath) {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${previewPath}`);
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 2000);
    } catch {
      // Clipboard access can be denied; the Preview button still works.
    }
  }, [previewPath]);

  useEffect(() => {
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warnOnLeave);
    return () => window.removeEventListener('beforeunload', warnOnLeave);
  }, [hasUnsavedChanges]);

  const basePath = draft.type === 'review' ? '/review' : '/articles';
  // Before the first save, what the slug will be: from the English title, or
  // the Greek one for a draft started in Greek.
  const previewSlug = slug ?? slugify(draft.title.trim() || greek.title);
  const isPublished = draft.status === 'published';

  // A chosen date turns the primary action from "publish" into "schedule".
  // Deliberately not compared against the clock here: reading the time during
  // render is impure and would flip the button label on an unrelated re-render.
  // The API rejects a past date with a clear message instead.
  const scheduledAt = draft.scheduledFor ? new Date(draft.scheduledFor) : null;
  const wantsSchedule = !isPublished && scheduledAt !== null;

  /** Save draft: the article row and, when it has changes, the Greek version. */
  const handleSaveDraft = async () => {
    setIsSavingAll(true);
    setLanguageError(null);
    const result = await saveArticleLanguages({
      saveArticle: () => save(),
      getArticleId,
      translation: translationRef.current,
    });
    setLanguageError(result.error);
    setIsSavingAll(false);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setLanguageError(null);
    const translation = translationRef.current;
    // A brand-new article with Greek changes is first saved as a draft, so the
    // Greek version is stored before anything goes live.
    if (getArticleId() === null && translation?.isDirty()) {
      const draftResult = await saveArticleLanguages({
        saveArticle: () => save(),
        getArticleId,
        translation,
      });
      if (!draftResult.articleSaved || draftResult.error) {
        setLanguageError(draftResult.error);
        setIsPublishing(false);
        return;
      }
    }
    const result = await saveArticleLanguages({
      saveArticle: () => save({ status: wantsSchedule ? 'scheduled' : 'published' }),
      getArticleId,
      translation,
      publishing: true,
    });
    setLanguageError(result.error);
    setIsPublishing(false);
    const succeeded = result.articleSaved;

    if (!succeeded) {
      // `save` surfaced the reason in the error banner already.
      return;
    }

    setSlug(previewSlug);

    if (wantsSchedule) {
      toast.success(`Scheduled for ${scheduledAt?.toLocaleString() ?? 'later'}`);
      return;
    }

    window.dispatchEvent(
      new CustomEvent<ContentPublishedEventDetail>(CONTENT_PUBLISHED_EVENT, {
        detail: { type: draft.type },
      }),
    );

    // Staying in the composer is deliberate: the first thing anyone does after
    // publishing is fix a typo they just spotted. The toast carries the link
    // out, so nothing forces a round trip through the studio list.
    toast.success(isPublished ? 'Article updated' : 'Published', {
      action: {
        label: 'View',
        onClick: () => window.open(`${basePath}/${previewSlug}`, '_blank'),
      },
    });
  };

  // Unchanged rule: the English title, a category and a body.
  const canPublish = isPublishable(draft);
  // A draft needs a category and a title in at least one language.
  const canSaveDraft = isSaveable(draft, greek.title);

  const handleRestore = useCallback(
    (revision: RestoredRevision) => {
      const html = revision.content_html ?? '';
      latestHtmlRef.current = html;
      setEditorContent(html);
      // Remounting is what actually swaps the document; the editor ignores
      // value changes after mount so it does not fight the cursor.
      setEditorKey(current => current + 1);
      update({
        title: revision.title ?? '',
        description: revision.description ?? '',
        contentHtml: html,
        contentRich: (revision.content_rich ?? null) as ComposerDraft['contentRich'],
      });
    },
    [update],
  );

  return (
    <div className="pb-20">
      <header className="sticky top-0 z-30 -mx-4 mb-8 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/studio">
                <ArrowLeft size={16} />
                Studio
              </Link>
            </Button>
            <SaveIndicator state={saveState} savedAt={savedAt} />
            {draft.status === 'scheduled' && scheduledAt && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <CalendarClock size={13} />
                Scheduled for {scheduledAt.toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isPublished && slug ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${basePath}/${slug}`} target="_blank">
                  <Eye size={16} />
                  View
                </Link>
              </Button>
            ) : (
              previewPath && (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={previewPath} target="_blank">
                      <Eye size={16} />
                      Preview
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void copyPreviewLink()}>
                    {copiedPreview ? <Check size={16} /> : <LinkIcon size={16} />}
                    {copiedPreview ? 'Copied' : 'Copy link'}
                  </Button>
                </>
              )
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!canSaveDraft || saveState === 'saving' || isSavingAll}
              onClick={() => void handleSaveDraft()}
            >
              Save draft
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canPublish || isPublishing}
              onClick={() => void handlePublish()}
            >
              {wantsSchedule ? <CalendarClock size={16} /> : <Send size={16} />}
              {isPublished ? 'Update' : wantsSchedule ? 'Schedule' : 'Publish'}
            </Button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-6">
          <ErrorAlert message={error} onRetry={clearError} retryLabel="Dismiss" />
        </div>
      )}
      {languageError && (
        <div className="mb-6">
          <ErrorAlert
            message={languageError}
            onRetry={() => setLanguageError(null)}
            retryLabel="Dismiss"
          />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div
            role="tablist"
            aria-label="Article language"
            className="inline-flex rounded-xl border border-border bg-card p-1"
          >
            {(
              [
                { id: 'en', label: 'English', unsaved: false },
                { id: 'el', label: 'Ελληνικά', unsaved: greek.dirty },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`composer-tab-${tab.id}`}
                aria-selected={language === tab.id}
                aria-controls={`composer-panel-${tab.id}`}
                onClick={() => setLanguage(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  language === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {tab.unsaved ? (
                  <span className="size-1.5 rounded-full bg-warning" aria-label="unsaved changes" />
                ) : null}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id="composer-panel-en"
            aria-labelledby="composer-tab-en"
            hidden={language !== 'en'}
            lang="en"
            className="space-y-4"
          >
            {/*
            Deliberately not the shared Input/Textarea primitives: those are form
            controls and bring a border, a focus ring and a min-height. Here the
            title and standfirst should read as the article itself, so they are
            plain elements carrying the reading typography.
          */}
            <div className="focus-within:bg-surface-hover/30 hover:bg-surface-hover/25 -mx-3 rounded-xl px-3 py-2 transition-colors">
              <input
                value={draft.title}
                onChange={event => update({ title: event.target.value })}
                placeholder="Title"
                aria-label="Article title"
                className="w-full border-0 bg-transparent p-0 text-[clamp(1.9rem,1.2rem+2.2vw,3.25rem)] font-semibold leading-[1.12] tracking-[-0.024em] text-foreground/95 outline-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0"
              />

              <textarea
                value={draft.description}
                onChange={event => update({ description: event.target.value })}
                placeholder="Add a short standfirst - shown in cards and search results"
                aria-label="Article description"
                rows={2}
                className="mt-3 w-full resize-none border-0 bg-transparent p-0 text-[1.06rem] leading-8 text-foreground/70 outline-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0"
              />
            </div>

            <RichTextEditor
              key={editorKey}
              value={editorContent}
              placeholder="Tell the story, or press / to insert a block..."
              mediaCategory={draft.category}
              onChange={html => {
                latestHtmlRef.current = html;
              }}
              onChangeJson={json =>
                update({ contentHtml: latestHtmlRef.current, contentRich: json })
              }
            />
          </div>

          <div
            role="tabpanel"
            id="composer-panel-el"
            aria-labelledby="composer-tab-el"
            hidden={language !== 'el'}
          >
            {/* Mounted from the start and only hidden, so switching tabs keeps unsaved work. */}
            <ArticleTranslationEditor
              ref={translationRef}
              articleId={articleId}
              locale="el"
              mediaCategory={draft.category}
              source={{
                title: draft.title,
                description: draft.description,
                meta_title: draft.metaTitle,
                meta_description: draft.metaDescription,
              }}
              slug={previewSlug}
              basePath={basePath}
              active={language === 'el'}
              onStateChange={setGreek}
            />
          </div>
        </div>

        <div className="space-y-6">
          <ComposerSidebar
            draft={draft}
            onChange={update}
            canWriteArticles={canWriteArticles}
            canWriteReviews={canWriteReviews}
          />
          <RevisionHistory articleId={articleId} onRestore={handleRestore} />
        </div>
      </div>

      {articleId === null && (
        <p className="mt-6 text-xs text-muted-foreground">
          Start in English or Ελληνικά. Save draft stores every language that has a title; English
          changes are also saved automatically once there is an English title and a category.
          Publishing needs the English version.
        </p>
      )}
    </div>
  );
}
