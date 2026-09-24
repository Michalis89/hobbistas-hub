'use client';

import { memo } from 'react';
import { CoverThumbImage } from '@/components/ui/cover-image';
import Link from 'next/link';
import { Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MediaCategory, SearchResult } from './types';

interface MediaSearchResultCardProps {
  entry: SearchResult;
  onOpenDialog: (entry: SearchResult) => void;
  variant?: 'compact' | 'default';
  isInLibrary?: boolean;
  category?: MediaCategory;
}

const toMediaSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

function MediaSearchResultCard({
  entry,
  onOpenDialog,
  variant = 'default',
  isInLibrary = false,
  category,
}: Readonly<MediaSearchResultCardProps>) {
  const handleOpenDialog = () => {
    if (isInLibrary) {
      return;
    }
    onOpenDialog(entry);
  };
  const mediaSlug = Number.isFinite(entry.mediaId)
    ? String(entry.mediaId)
    : entry.title?.trim()
      ? toMediaSlug(entry.title)
      : String(entry.externalId ?? entry.id);

  return (
    <article
      className={`flex w-full min-w-0 ${
        variant === 'compact'
          ? 'items-start gap-3 rounded-[16px] p-3'
          : 'items-center gap-3 rounded-[18px] p-4'
      }`}
    >
      <div className="relative h-16 w-12 rounded-[10px] bg-card">
        <CoverThumbImage
          src={entry.cover}
          alt={entry.title}
          sizes="48px"
          className="h-full w-full"
          fallbackClassName="rounded-[10px]"
        />
      </div>
      <div className="min-w-0 flex-1">
        {category ? (
          <Link
            href={`/media/${category}/${mediaSlug}`}
            className="block truncate text-sm font-semibold text-foreground transition-colors hover:text-primary hover:underline"
          >
            {entry.title}
          </Link>
        ) : (
          <p className="truncate text-sm font-semibold text-foreground">{entry.title}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {entry.subtitle} {entry.year ? `- ${entry.year}` : ''}
        </p>
      </div>

      {isInLibrary ? (
        <div
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
          data-active="true"
        >
          <Library className="h-3.5 w-3.5" />
          <span>In library</span>
        </div>
      ) : (
        <Button variant="outline" onClick={handleOpenDialog} className="h-9 rounded-[12px] px-3">
          Add Entry
        </Button>
      )}
    </article>
  );
}

export default memo(MediaSearchResultCard);
