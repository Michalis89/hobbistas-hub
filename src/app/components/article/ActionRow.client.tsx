'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClipboardCopy, Heart, Pencil, Share2, Trash2 } from 'lucide-react';
import type { ArticleRow } from '@/types/database';
import { selectCanEditArticles, selectIsAuthorOf } from '@/store/slices/authSlice';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ActionRowProps = {
  article: ArticleRow;
  className?: string;
};

type LikeState = {
  liked: boolean;
  count: number;
};

const ACTION_BUTTON_BASE =
  'h-9 w-9 rounded-full border border-transparent bg-transparent text-muted-foreground shadow-none transition-colors duration-200 hover:border-border hover:bg-muted/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:bg-muted/70';

export default function ActionRow({ article, className }: ActionRowProps) {
  const router = useRouter();
  const canEditRaw = useSelector(selectCanEditArticles);
  const isAuthorRaw = useSelector(selectIsAuthorOf(article.author_id));
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const canEdit = mounted && canEditRaw;
  const isAuthor = mounted && isAuthorRaw;
  const [likeState, setLikeState] = useState<LikeState>({
    liked: false,
    count: article.likes || 0,
  });
  const [likeLoading, setLikeLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackBase = article.topic === 'reviews' ? '/review' : '/articles';
  const fallbackHref = `${fallbackBase}?category=${article.category}`;

  useEffect(() => {
    let active = true;
    fetch(`/api/articles/${article.id}/like`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active || !data) {
          return;
        }
        const payload = data?.data ?? data;
        setLikeState({
          liked: !!payload.liked,
          count: typeof payload.count === 'number' ? payload.count : article.likes || 0,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [article.id, article.likes]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleShare = async () => {
    const shareData = {
      title: article.title,
      text: article.description || '',
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled or share failed
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareData.url);
    } catch {
      // ignore clipboard failure
    }
  };

  const handleCopyLink = async () => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      // ignore clipboard failures
    }
  };

  const toggleLike = async () => {
    if (likeLoading || isAuthor) {
      return;
    }
    setLikeLoading(true);

    try {
      const method = likeState.liked ? 'DELETE' : 'POST';
      const response = await fetch(`/api/articles/${article.id}/like`, { method });
      if (!response.ok) {
        setLikeLoading(false);
        return;
      }

      const data = await response.json();
      const payload = data?.data ?? data;
      setLikeState({
        liked: !!payload.liked,
        count: typeof payload.count === 'number' ? payload.count : likeState.count,
      });
    } catch {
      // ignore like failures
    } finally {
      setLikeLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Are you sure you want to permanently delete this article? This action cannot be undone.',
      )
    ) {
      return;
    }

    setIsDeleteLoading(true);
    try {
      const response = await fetch(`/api/articles/${article.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete the article.');
      }

      router.push(fallbackHref);
    } catch (deleteError) {
      console.error('Error deleting article:', deleteError);
      window.alert(
        deleteError instanceof Error
          ? deleteError.message
          : 'Something went wrong while deleting. Please try again.',
      );
    } finally {
      setIsDeleteLoading(false);
    }
  };

  return (
    <>
      <div className={cn('flex items-center justify-center gap-1', className)}>
        <Button
          type="button"
          iconOnly
          size="icon"
          variant="secondary"
          onClick={handleShare}
          aria-label="Share"
          title="Share"
          className={ACTION_BUTTON_BASE}
        >
          <Share2 size={18} strokeWidth={2.2} />
        </Button>

        <Button
          type="button"
          iconOnly
          size="icon"
          variant="secondary"
          onClick={handleCopyLink}
          aria-label="Copy link"
          title={copied ? 'Link copied!' : 'Copy link'}
          className={cn(ACTION_BUTTON_BASE, copied ? 'text-primary' : 'hover:text-primary')}
        >
          <ClipboardCopy size={18} strokeWidth={2.2} />
        </Button>

        <Button
          type="button"
          iconOnly
          size="icon"
          variant="secondary"
          onClick={toggleLike}
          disabled={likeLoading || isAuthor}
          className={cn(
            ACTION_BUTTON_BASE,
            likeState.liked ? 'text-primary' : 'hover:text-primary',
            isAuthor && 'cursor-not-allowed opacity-40',
          )}
        >
          <Heart size={18} fill={likeState.liked ? 'currentColor' : 'none'} strokeWidth={2.2} />
        </Button>

        {canEdit && (
          <Button
            type="button"
            iconOnly
            size="icon"
            variant="secondary"
            asChild
            title="Edit in Studio"
            className={cn(ACTION_BUTTON_BASE, 'hover:text-primary')}
          >
            <Link href={`/studio/${article.id}`} aria-label="Edit in Studio">
              <Pencil size={18} strokeWidth={2.2} />
            </Link>
          </Button>
        )}

        {canEdit && (
          <Button
            type="button"
            variant="secondary"
            iconOnly
            size="icon"
            onClick={handleDelete}
            disabled={isDeleteLoading}
            className={cn(
              ACTION_BUTTON_BASE,
              'text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive',
            )}
          >
            {isDeleteLoading ? (
              <Spinner className="size-4 text-destructive" />
            ) : (
              <Trash2 size={18} strokeWidth={2.2} />
            )}
          </Button>
        )}
      </div>
    </>
  );
}
