'use client';

import { useCallback, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export type RestoredRevision = {
  title: string | null;
  description: string | null;
  content_rich: unknown;
  content_html: string | null;
};

type RevisionSummary = {
  id: number;
  created_at: string;
  title: string | null;
};

type RevisionHistoryProps = {
  readonly articleId: number | null;
  readonly onRestore: (revision: RestoredRevision) => void;
};

/**
 * Version history for a published article.
 *
 * Loaded on demand rather than with the page: most editing sessions never open
 * it, and the list is only interesting once something has gone wrong.
 */
export default function RevisionHistory({ articleId, onRestore }: RevisionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!articleId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/revisions`);
      if (!response.ok) {
        throw new Error('Could not load history.');
      }
      const body = await response.json();
      setRevisions(body?.data?.revisions ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load history.');
    } finally {
      setIsLoading(false);
    }
  }, [articleId]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && revisions === null) {
      void load();
    }
  };

  const restore = async (revisionId: number) => {
    if (!articleId) {
      return;
    }
    setRestoringId(revisionId);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/revisions?revision=${revisionId}`);
      if (!response.ok) {
        throw new Error('Could not load that version.');
      }
      const body = await response.json();
      const revision = body?.data?.revision;
      if (revision) {
        // Loaded into the editor, not written straight to the article: the
        // author still has to save, so a misclick is recoverable.
        onRestore(revision as RestoredRevision);
      }
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Could not restore.');
    } finally {
      setRestoringId(null);
    }
  };

  if (!articleId) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <History size={13} />
          History
        </span>
        <span aria-hidden>{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className="space-y-2">
          {isLoading && <Spinner className="size-4 text-muted-foreground" />}

          {!isLoading && revisions?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No earlier versions yet. One is kept each time you edit a published article.
            </p>
          )}

          {revisions?.map(revision => (
            <div
              key={revision.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-2 py-1.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-foreground">
                  {revision.title || 'Untitled'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(revision.created_at).toLocaleString()}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={restoringId !== null}
                onClick={() => void restore(revision.id)}
              >
                {restoringId === revision.id ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <RotateCcw size={13} />
                )}
                Restore
              </Button>
            </div>
          ))}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
