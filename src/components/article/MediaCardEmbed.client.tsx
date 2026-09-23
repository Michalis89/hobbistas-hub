'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, LibraryBig, Plus } from 'lucide-react';
import { CoverThumbImage, THUMB_SIZES_SM } from '@/components/ui/cover-image';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type MediaCardEmbedProps = {
  readonly mediaId: number;
  readonly category: string;
  readonly slug?: string | null;
  readonly title: string;
  readonly cover?: string | null;
  readonly year?: string | null;
};

type AddState = 'idle' | 'adding' | 'added' | 'error';

/**
 * A tracked media item embedded in an article body.
 *
 * Games are sent to their own page instead of being added inline, because the
 * add API requires a platform choice that this card has no room to ask for.
 */
export default function MediaCardEmbed({
  mediaId,
  category,
  slug,
  title,
  cover,
  year,
}: MediaCardEmbedProps) {
  const [state, setState] = useState<AddState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // The media route resolves a numeric id as well as a slug.
  const href = `/media/${category}/${slug || mediaId}`;
  const needsPlatformChoice = category === 'games';

  const handleAdd = async () => {
    setState('adding');
    setMessage(null);

    try {
      const response = await fetch(`/api/${category}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'local', mediaId, status: 'planned' }),
      });

      if (response.status === 401) {
        setState('error');
        setMessage('Sign in to save this.');
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Could not add this item.');
      }

      setState('added');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not add this item.');
    }
  };

  return (
    <aside
      data-media-card
      className="not-prose my-8 flex items-center gap-4 rounded-2xl border border-border bg-card/70 p-3 sm:p-4"
    >
      <Link href={href} className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {cover ? (
          <CoverThumbImage src={cover} alt={title} sizes={THUMB_SIZES_SM} className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center">
            <LibraryBig size={18} className="text-muted-foreground" />
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {category}
          {year ? ` · ${year}` : ''}
        </span>
        <Link
          href={href}
          className="mt-0.5 block truncate text-base font-semibold text-foreground no-underline transition-colors hover:text-primary"
        >
          {title}
        </Link>
        {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
      </div>

      {needsPlatformChoice ? (
        <Button variant="secondary" size="sm" asChild className="shrink-0">
          <Link href={href}>Choose platform</Link>
        </Button>
      ) : (
        <Button
          variant={state === 'added' ? 'ghost' : 'secondary'}
          size="sm"
          className="shrink-0"
          disabled={state === 'adding' || state === 'added'}
          onClick={() => void handleAdd()}
        >
          {state === 'adding' && <Spinner className="size-4" />}
          {state === 'added' && <Check size={15} className="text-success" />}
          {(state === 'idle' || state === 'error') && <Plus size={15} />}
          {state === 'added' ? 'In your library' : 'Add to library'}
        </Button>
      )}
    </aside>
  );
}
