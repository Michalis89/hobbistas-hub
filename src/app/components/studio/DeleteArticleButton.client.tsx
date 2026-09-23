'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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

type DeleteArticleButtonProps = {
  readonly articleId: number;
  readonly title: string;
  /** A published article is live, so the confirmation has to say so. */
  readonly isPublished: boolean;
};

/**
 * Deletion is permanent - the API cascades likes, comments and views - so it
 * always goes through a confirmation, never a single click.
 */
export default function DeleteArticleButton({
  articleId,
  title,
  isPublished,
}: DeleteArticleButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const label = title || 'Untitled draft';

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/articles/${articleId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || body?.message || 'Delete failed');
      }
      toast.success(`"${label}" deleted`);
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          iconOnly
          title="Delete"
          aria-label={`Delete ${label}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{label}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            {isPublished
              ? 'This article is live. Deleting it removes the public page along with its comments, likes and views. This cannot be undone.'
              : 'This draft and its revision history will be permanently removed. This cannot be undone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={event => {
              // The dialog closes on its own action click; keep it open until
              // the request settles so the spinner and any error are visible.
              event.preventDefault();
              void handleDelete();
            }}
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
