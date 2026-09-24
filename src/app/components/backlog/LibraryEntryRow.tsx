'use client';

import { memo, useMemo, useState } from 'react';
import { CoverThumbImage } from '@/components/ui/cover-image';
import Link from 'next/link';
import { Heart, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { MediaCategory, MediaEntry, SearchResult } from './types';
import { CATEGORY_CONFIG, getTotalCount } from './types';

interface LibraryEntryRowProps {
  entry: MediaEntry;
  category: MediaCategory;
  index: number;
  onOpenDialog: (entry: MediaEntry & Partial<SearchResult>) => void;
  onDelete: (entry: MediaEntry) => void;
  isReadOnly?: boolean;
  canToggleFavorite?: boolean;
  onToggleFavorite?: (entry: MediaEntry) => void;
}

const ANIME_PLATFORM_LABELS: Record<string, string> = {
  crunchyroll: 'Crunchyroll',
  netflix: 'Netflix',
  prime_video: 'Amazon Prime Video',
  disney_plus: 'Disney+',
  tv: 'TV Broadcast',
  bluray: 'Blu-ray / DVD',
  youtube: 'YouTube',
  other: 'Other',
};
const READING_FORMAT_LABELS: Record<string, string> = {
  physical: 'Physical',
  digital: 'Digital',
};
const WATCH_PLATFORM_LABELS: Record<string, string> = {
  netflix: 'Netflix',
  prime_video: 'Amazon Prime Video',
  disney_plus: 'Disney+',
  hbo_max: 'HBO Max',
  apple_tv: 'Apple TV+',
  tv: 'TV Broadcast',
  cinema: 'Cinema',
  bluray: 'Blu-ray / DVD',
  other: 'Other',
};

const toMediaSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

function LibraryEntryRow({
  entry,
  category,
  index,
  onOpenDialog,
  onDelete,
  isReadOnly = false,
  canToggleFavorite = false,
  onToggleFavorite,
}: Readonly<LibraryEntryRowProps>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const config = CATEGORY_CONFIG[category];
  const total = getTotalCount(entry, category);
  const isReadingCategory = category === 'manga' || category === 'books';
  const isVisualWatchCategory = category === 'movies' || category === 'tv';
  const displayPlatform =
    category === 'anime'
      ? (ANIME_PLATFORM_LABELS[entry.selectedPlatform?.trim().toLowerCase() ?? ''] ??
        entry.selectedPlatform)
      : isVisualWatchCategory
        ? (WATCH_PLATFORM_LABELS[entry.selectedPlatform?.trim().toLowerCase() ?? ''] ??
          entry.selectedPlatform)
        : isReadingCategory
          ? (READING_FORMAT_LABELS[entry.selectedPlatform?.trim().toLowerCase() ?? ''] ??
            entry.selectedPlatform)
          : entry.selectedPlatform;

  const statusLabel =
    entry.status === 'current'
      ? config.currentLabel
      : entry.status === 'planned'
        ? config.plannedLabel
        : entry.status === 'dropped'
          ? config.droppedLabel
          : config.completedLabel;

  const progressValue = entry.progress ?? null;
  const progressDisplay =
    category !== 'games'
      ? progressValue !== null
        ? `${progressValue}${total ? ` / ${total}` : ''}`
        : '-'
      : progressValue !== null
        ? `${progressValue}h`
        : '-';

  const scoreLabel = useMemo(() => {
    if (!entry.score) {
      return 'No score';
    }
    return `Score ${entry.score}`;
  }, [entry.score]);
  const mediaSlug = useMemo(
    () =>
      Number.isFinite(entry.mediaId)
        ? String(entry.mediaId)
        : entry.title?.trim()
          ? toMediaSlug(entry.title)
          : String(entry.id),
    [entry.id, entry.mediaId, entry.title],
  );

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(entry);
  };

  return (
    <>
      <article
        className={`group rounded-2xl border p-3 transition-colors duration-150 hover:border-primary/30 hover:bg-card sm:p-4 ${
          index % 2 === 0 ? 'border-border/70 bg-card/70' : 'border-border/60 bg-card/50'
        }`}
      >
        <div className="grid grid-cols-[80px,minmax(0,1fr)] gap-3 md:grid-cols-[92px,1.4fr,0.55fr,0.5fr,112px] md:items-center md:gap-4">
          <div className="relative h-28 w-20 overflow-hidden rounded-xl border border-border/60 bg-card">
            <CoverThumbImage
              src={entry.cover}
              alt={entry.title}
              sizes="80px"
              className="h-full w-full"
            />
          </div>

          <div className="min-w-0 space-y-1 self-start">
            <Link
              href={`/media/${category}/${mediaSlug}`}
              className="line-clamp-2 block text-base font-semibold leading-tight text-foreground transition-colors hover:text-primary hover:underline sm:text-lg"
            >
              {entry.title}
            </Link>
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {entry.subtitle}
              {entry.year ? ` - ${entry.year}` : ''}
            </p>
            {category === 'anime' ||
            category === 'games' ||
            isReadingCategory ||
            isVisualWatchCategory ? (
              <p className="text-xs font-medium text-muted-foreground">
                {isReadingCategory
                  ? 'Reading format'
                  : isVisualWatchCategory
                    ? 'Watched on'
                    : 'Platform'}
                : {displayPlatform || '-'}
              </p>
            ) : null}
            <p className="line-clamp-2 text-xs text-muted-foreground md:line-clamp-1">
              {entry.tags.slice(0, 3).join(', ') || 'No genres'}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
              <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-1.5 py-1 text-[11px] font-semibold text-primary">
                {statusLabel}
              </span>
              <Badge
                variant="secondary"
                className="rounded-full border border-border/70 bg-card/80 px-1.5 py-1 text-[11px]"
              >
                {scoreLabel}
              </Badge>
              <span className="text-[11px] text-muted-foreground">Progress: {progressDisplay}</span>
            </div>
          </div>

          <div className="hidden space-y-2 md:block">
            <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {statusLabel}
            </span>
            <p className="text-xs text-muted-foreground">Progress: {progressDisplay}</p>
          </div>

          <div className="hidden space-y-2 md:block">
            <Badge
              variant="secondary"
              className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-xs"
            >
              {scoreLabel}
            </Badge>
          </div>

          {canToggleFavorite && (
            <div className="col-span-2 flex items-center justify-end gap-1.5 pt-2 md:col-auto md:pt-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onToggleFavorite?.(entry)}
                title={entry.isFavorite ? 'Unfavorite' : 'Favorite'}
                aria-label={entry.isFavorite ? 'Unfavorite' : 'Favorite'}
                className={`h-8 w-8 rounded-xl ${
                  entry.isFavorite
                    ? 'text-primary hover:bg-primary/10 hover:text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                <Heart className="h-3.5 w-3.5" fill={entry.isFavorite ? 'currentColor' : 'none'} />
              </Button>
            </div>
          )}

          {!isReadOnly && (
            <div className="col-span-2 flex items-center justify-end gap-1.5 pt-2 md:col-auto md:pt-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onOpenDialog(entry)}
                title="Edit"
                aria-label="Edit"
                className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleDeleteClick}
                title="Delete"
                aria-label="Delete"
                className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </article>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="space-y-6 sm:max-w-xl">
          <AlertDialogHeader className="text-center sm:text-left">
            <AlertDialogTitle>Delete entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &ldquo;{entry.title}&rdquo; from your library?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default memo(LibraryEntryRow);
