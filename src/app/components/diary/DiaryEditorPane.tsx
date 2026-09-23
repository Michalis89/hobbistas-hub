'use client';

import dynamic from 'next/dynamic';
import { memo, type ComponentType, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { MoodPills } from '@/app/components/diary/MoodPills';
import type { DiaryEntryDecrypted, DiaryEntryDraft } from '@/lib/diary/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

type DiaryEditorPaneProps = {
  entry: DiaryEntryDecrypted | null;
  saveStatus: SaveStatus;
  isSaving: boolean;
  hasOfflineDraft?: boolean;
  onSyncOfflineDrafts?: () => Promise<number>;
  showBackButton?: boolean;
  onBack?: () => void;
  onDelete: (entryId: string) => Promise<void>;
  onUpdateDraft: (
    partial: Partial<Pick<DiaryEntryDraft, 'title' | 'content' | 'mood' | 'entry_date'>>,
  ) => void;
};

const DiaryTiptapEditor = dynamic(() => import('./DiaryTiptapEditor.client'), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-[360px] w-full rounded-md" />,
}) as ComponentType<{
  value: string;
  onChange: (value: string) => void;
  language?: 'en' | 'el' | 'und';
  placeholder?: string;
  showOfflineDraftHint?: boolean;
  onReconnectSync?: () => Promise<number>;
}>;

type DiaryWritingLanguage = 'en' | 'el' | 'und';

function resolveWritingLanguage(title: string, content: string): DiaryWritingLanguage {
  const source = `${title} ${content.replace(/<[^>]*>/g, ' ')}`;
  const hasGreek = /[\u0370-\u03ff\u1f00-\u1fff]/i.test(source);
  const hasLatin = /[A-Za-z]/.test(source);

  // Prefer Greek whenever any Greek letters are present so accent checks stay active.
  if (hasGreek) {
    return 'el';
  }
  if (hasLatin) {
    return 'en';
  }
  return 'und';
}

function saveStatusLabel(saveStatus: SaveStatus) {
  if (saveStatus === 'saving') {
    return 'Saving...';
  }
  if (saveStatus === 'saved') {
    return 'Saved';
  }
  if (saveStatus === 'offline') {
    return 'Offline';
  }
  if (saveStatus === 'error') {
    return 'Save failed';
  }
  return 'Ready';
}

function saveStatusClass(saveStatus: SaveStatus) {
  if (saveStatus === 'error') {
    return 'text-[hsl(var(--error))]';
  }
  if (saveStatus === 'offline') {
    return 'text-[hsl(var(--warning))]';
  }
  return 'text-[hsl(var(--text-secondary))]';
}

export const DiaryEditorPane = memo(function DiaryEditorPane({
  entry,
  saveStatus,
  isSaving,
  hasOfflineDraft = false,
  onSyncOfflineDrafts,
  showBackButton = false,
  onBack,
  onDelete,
  onUpdateDraft,
}: DiaryEditorPaneProps) {
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const statusText = useMemo(() => saveStatusLabel(saveStatus), [saveStatus]);
  const writingLanguage = useMemo(
    () => resolveWritingLanguage(entry?.title ?? '', entry?.content ?? ''),
    [entry?.content, entry?.title],
  );

  if (!entry) {
    return (
      <section className="flex h-full min-h-0 flex-col rounded-[var(--radius-xl)] border border-[hsl(var(--border-default)/0.72)] bg-[hsl(var(--surface-warm)/0.9)] p-4 shadow-[var(--shadow-diary)] sm:p-5">
        <div className="mx-auto flex h-full w-full max-w-[72ch] items-center justify-center rounded-[var(--radius-lg)] border border-[hsl(var(--border-subtle)/0.74)] bg-[hsl(var(--surface-overlay)/0.58)] px-6 py-10 text-center">
          <div className="space-y-2">
            <p className="text-lg font-semibold leading-snug text-[hsl(var(--text-primary))]">
              Your sanctuary is ready.
            </p>
            <p className="text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
              Select an entry or create a new one to start writing.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-[var(--radius-xl)] border border-[hsl(var(--border-default)/0.78)] bg-[hsl(var(--surface-warm)/0.92)] p-6 shadow-[var(--shadow-diary)] sm:p-8">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-end gap-3">
          {showBackButton ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              iconOnly
              className="min-h-11 min-w-11 rounded-[var(--radius-md)] border border-[hsl(var(--border-subtle)/0.8)] bg-[hsl(var(--surface-overlay)/0.45)] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-hover)/0.74)] hover:text-[hsl(var(--text-primary))]"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Label
              htmlFor="entry-title"
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))]"
            >
              Title
            </Label>
            <Input
              id="entry-title"
              value={entry.title}
              onChange={event => onUpdateDraft({ title: event.target.value })}
              placeholder="Untitled reflection"
              spellCheck
              lang={writingLanguage}
              className="h-14 border-0 bg-transparent px-0 font-serif text-2xl font-semibold leading-tight tracking-[-0.02em] text-[hsl(var(--text-primary))] shadow-none placeholder:text-[hsl(var(--text-tertiary))] focus-visible:ring-0 md:h-14 md:text-[30px]"
              maxLength={180}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pb-1 text-xs">
          {saveStatus === 'saving' || isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--text-secondary))]" />
          ) : null}
          <span className={saveStatusClass(saveStatus)}>{statusText}</span>
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-[var(--radius-md)] border border-[hsl(var(--border-subtle)/0.7)] px-2 text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-hover)/0.72)] hover:text-[hsl(var(--error))]"
                disabled={isSaving}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this diary entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The encrypted entry will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isSaving}
                  onClick={() => {
                    void onDelete(entry.id);
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="mb-7 flex flex-col gap-6 rounded-[var(--radius-lg)] border border-[hsl(var(--border-subtle)/0.7)] bg-[hsl(var(--surface-overlay)/0.42)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))]">
            Mood
          </span>
          <MoodPills
            value={entry.mood}
            onChange={mood => onUpdateDraft({ mood })}
            disabled={isSaving}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-3 self-start lg:self-auto">
          <Label
            htmlFor="entry-date"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))]"
          >
            Date
          </Label>
          <Input
            id="entry-date"
            type="date"
            value={entry.entry_date}
            onChange={event => onUpdateDraft({ entry_date: event.target.value })}
            className="h-10 min-h-[var(--touch-min)] w-[180px] rounded-[var(--radius-md)] border-[hsl(var(--border-default)/0.72)] bg-[hsl(var(--surface-overlay)/0.45)] text-[hsl(var(--text-primary))]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <DiaryTiptapEditor
          value={entry.content}
          onChange={value => onUpdateDraft({ content: value })}
          language={writingLanguage}
          placeholder="Write freely. Your words stay encrypted before they ever leave this browser."
          showOfflineDraftHint={saveStatus === 'offline' && hasOfflineDraft}
          onReconnectSync={onSyncOfflineDrafts}
        />
      </div>
    </section>
  );
});
