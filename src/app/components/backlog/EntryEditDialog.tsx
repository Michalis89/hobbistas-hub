'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Heart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import type { MediaCategory, MediaEntry, MediaStatus, SearchResult } from './types';
import { CATEGORY_CONFIG, getProgressLabel, getTotalCount } from './types';

export type EditState = {
  status: MediaStatus;
  progress: string;
  score: string;
  notes: string;
  isFavorite: boolean;
  selectedPlatform: string;
};

interface EntryEditDialogProps {
  entry: (MediaEntry & Partial<SearchResult>) | null;
  category: MediaCategory;
  onClose: () => void;
  onSave: (editState: EditState) => Promise<void>;
  onDelete: (entry: MediaEntry) => void;
  onRefreshEntry?: (refreshSelectedEntry?: boolean) => Promise<void> | void;
}

const NO_PLATFORM_VALUE = '__none';
const ANIME_PLATFORMS = [
  { key: 'crunchyroll', label: 'Crunchyroll' },
  { key: 'netflix', label: 'Netflix' },
  { key: 'prime_video', label: 'Amazon Prime Video' },
  { key: 'disney_plus', label: 'Disney+' },
  { key: 'tv', label: 'TV Broadcast' },
  { key: 'bluray', label: 'Blu-ray / DVD' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'other', label: 'Other' },
] as const;
const MOVIES_PLATFORMS = [
  { key: 'netflix', label: 'Netflix' },
  { key: 'prime_video', label: 'Amazon Prime Video' },
  { key: 'disney_plus', label: 'Disney+' },
  { key: 'hbo_max', label: 'HBO Max' },
  { key: 'apple_tv', label: 'Apple TV+' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tv', label: 'TV Broadcast' },
  { key: 'cinema', label: 'Cinema' },
  { key: 'bluray', label: 'Blu-ray / DVD' },
  { key: 'other', label: 'Other' },
] as const;
const TV_PLATFORMS = [
  { key: 'netflix', label: 'Netflix' },
  { key: 'prime_video', label: 'Amazon Prime Video' },
  { key: 'disney_plus', label: 'Disney+' },
  { key: 'hbo_max', label: 'HBO Max' },
  { key: 'apple_tv', label: 'Apple TV+' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tv', label: 'TV Broadcast' },
  { key: 'other', label: 'Other' },
] as const;
const READING_FORMATS = [
  { key: 'physical', label: 'Physical' },
  { key: 'digital', label: 'Digital' },
] as const;

/**
 * Fallback platforms for games.
 *
 * Every other category picks from a fixed list, but games used to offer only
 * `entry.platforms` — the platforms IGDB happened to return. That list is empty
 * for anything already in the library (it is only fetched for external results
 * that have no description yet), which left the dropdown with nothing to choose
 * while the API rejects games saved without a platform. Result: an entry that
 * could not be saved at all.
 */
const GAME_PLATFORM_FALLBACK = [
  'PC',
  'PS5',
  'PS4',
  'Xbox Series X/S',
  'Xbox One',
  'Nintendo Switch',
  'Steam Deck',
  'Mobile',
  'Other',
] as const;

/** The game's own platforms first, then any standard ones it did not list. */
function getGamePlatformOptions(entryPlatforms?: string[] | null): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const platform of [...(entryPlatforms ?? []), ...GAME_PLATFORM_FALLBACK]) {
    const trimmed = platform?.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    options.push(trimmed);
  }

  return options;
}

function formatMediaFormatLabel(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return '-';
  }

  const normalized = raw.toLowerCase();
  const specialMap: Record<string, string> = {
    tv: 'TV',
    ova: 'OVA',
    ona: 'ONA',
    oad: 'OAD',
  };

  if (specialMap[normalized]) {
    return specialMap[normalized];
  }

  return raw
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export default function EntryEditDialog({
  entry,
  category,
  onClose,
  onSave,
  onDelete,
}: Readonly<EntryEditDialogProps>) {
  const isMobile = useIsMobile();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectPortalContainer, setSelectPortalContainer] = useState<HTMLDivElement | null>(null);
  const saveInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const [editState, setEditState] = useState<EditState>({
    status: 'planned',
    progress: '',
    score: '',
    notes: '',
    isFavorite: false,
    selectedPlatform: '',
  });

  const config = CATEGORY_CONFIG[category];
  const progressLabel = getProgressLabel(category);
  const isAnime = category === 'anime';
  const isGames = category === 'games';
  const isReadingCategory = category === 'manga' || category === 'books';
  const isVisualWatchCategory = category === 'movies' || category === 'tv';
  const hasFormatValue = Boolean(entry?.format?.trim());
  const total = entry ? getTotalCount(entry, category) : undefined;
  const shouldAutoCompleteProgress = category !== 'games';
  const platformValue = editState.selectedPlatform || NO_PLATFORM_VALUE;

  const rawProgress = editState.progress;
  const numericProgress = Number.parseInt(rawProgress, 10);
  const hasNumericProgress = Number.isFinite(numericProgress);
  const safeProgress = hasNumericProgress ? Math.max(0, numericProgress) : 0;
  const clampedProgress = total ? Math.min(safeProgress, total) : safeProgress;
  const progressPercent =
    total && total > 0 ? Math.min(100, Math.round((clampedProgress / total) * 100)) : null;
  const scoreNumber = editState.score === '' ? 0 : Number(editState.score);

  const handleSelectPortalMount = useCallback((element: HTMLDivElement | null) => {
    setSelectPortalContainer(element);
  }, []);

  useEffect(() => {
    if (!entry) {
      return;
    }
    setEditState({
      status: entry.status ?? 'planned',
      progress: entry.progress ? String(entry.progress) : '',
      score: entry.entryId ? (entry.score ?? '') : '',
      notes: entry.notes ?? '',
      isFavorite: entry.isFavorite ?? false,
      selectedPlatform: entry.selectedPlatform ?? '',
    });
  }, [entry]);

  const handleStatusChange = (nextStatus: MediaStatus) => {
    setEditState(prev => {
      if (nextStatus === 'completed' && total !== undefined && shouldAutoCompleteProgress) {
        return { ...prev, status: nextStatus, progress: String(total) };
      }
      if (prev.status === 'completed' && nextStatus !== 'completed') {
        return { ...prev, status: nextStatus, progress: '' };
      }
      return { ...prev, status: nextStatus };
    });
  };

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) {
      return;
    }
    saveInFlightRef.current = true;
    try {
      await onSave(editState);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [editState, onSave]);

  const handleDeleteConfirmed = useCallback(() => {
    if (!entry || deleteInFlightRef.current) {
      return;
    }
    deleteInFlightRef.current = true;
    try {
      setShowDeleteConfirm(false);
      onDelete(entry);
    } finally {
      deleteInFlightRef.current = false;
    }
  }, [entry, onDelete]);

  const clampProgress = category !== 'games';
  const progressUnitLabel =
    category === 'manga'
      ? 'Vol'
      : category === 'books'
        ? 'pages'
        : category === 'movies'
          ? 'minutes'
          : category === 'tv'
            ? 'episodes'
            : category === 'anime'
              ? 'episodes'
              : 'hours';
  const setProgress = (next: number) => {
    const nextValue = Math.max(0, next);
    const nextClamped = clampProgress && total ? Math.min(nextValue, total) : nextValue;
    const shouldComplete = clampProgress && total !== undefined && nextClamped >= total;
    const shouldMoveToCurrent = nextClamped > 0 && !shouldComplete;
    setEditState(prev => ({
      ...prev,
      progress: String(nextClamped),
      status: shouldComplete
        ? 'completed'
        : prev.status === 'planned' && shouldMoveToCurrent
          ? 'current'
          : prev.status,
    }));
  };

  const handleProgressInputChange = (value: string) => {
    if (value === '') {
      setEditState(prev => ({ ...prev, progress: '' }));
      return;
    }
    if (!/^\d+$/.test(value)) {
      return;
    }
    const parsed = Number.parseInt(value, 10);
    const shouldComplete =
      clampProgress && total !== undefined && Number.isFinite(parsed) && parsed >= total;
    const shouldMoveToCurrent = Number.isFinite(parsed) && parsed > 0 && !shouldComplete;
    setEditState(prev => ({
      ...prev,
      progress: value,
      status: shouldComplete
        ? 'completed'
        : prev.status === 'planned' && shouldMoveToCurrent
          ? 'current'
          : prev.status,
    }));
  };

  const handleScoreChange = (raw: string) => {
    if (raw === '') {
      setEditState(prev => ({ ...prev, score: '' }));
      return;
    }
    let normalized = raw.replace(',', '.');
    if (!/^\d*\.?\d*$/.test(normalized)) {
      return;
    }
    if (normalized.startsWith('.')) {
      normalized = `0${normalized}`;
    }
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed) && parsed > 10) {
      normalized = '10';
    }
    setEditState(prev => ({ ...prev, score: normalized }));
  };

  const editorPanel = entry ? (
    <div className="flex h-[96dvh] max-h-[96dvh] flex-col overflow-hidden sm:h-[90vh] sm:max-h-[90vh]">
      <DialogHeader className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <DialogTitle className="text-base font-semibold text-foreground sm:text-lg">
          {isAnime ? 'Anime Entry' : `${config.title} Entry`}
        </DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-border bg-card/70 p-3 sm:p-4">
            <div className="relative mx-auto aspect-[2/3] w-full max-w-[220px] overflow-hidden rounded-xl border border-border bg-muted/20">
              <Image
                src={entry.cover}
                alt={entry.title}
                fill
                sizes="(max-width: 1024px) 220px, 280px"
                className="object-cover"
              />
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-lg font-semibold leading-tight text-foreground">{entry.title}</p>
                {entry.subtitle ? (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.subtitle}</p>
                ) : null}
              </div>

              {entry.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {entry.tags.slice(0, 8).map(tag => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <Separator className="bg-border" />

              <div className="grid grid-cols-3 gap-y-2 text-xs">
                {!isGames && hasFormatValue ? (
                  <>
                    <span className="text-muted-foreground">Format</span>
                    <span className="col-span-2 text-right font-medium text-foreground">
                      {formatMediaFormatLabel(entry.format)}
                    </span>
                  </>
                ) : null}
                <span className="text-muted-foreground">Year</span>
                <span className="col-span-2 text-right font-medium text-foreground">
                  {entry.year || '-'}
                </span>
                {!isGames ? (
                  <>
                    <span className="text-muted-foreground">
                      {category === 'movies' ? 'Runtime' : progressLabel}
                    </span>
                    <span className="col-span-2 text-right font-medium text-foreground">
                      {total ?? '-'}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-3 sm:p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="entry-status-trigger"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  value={editState.status}
                  onValueChange={value => handleStatusChange(value as MediaStatus)}
                >
                  <SelectTrigger id="entry-status-trigger" className="h-10 !min-h-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    portalContainer={selectPortalContainer ?? undefined}
                    className="data-[state=closed]:animate-none data-[state=open]:animate-none"
                  >
                    <SelectItem value="planned">{config.plannedLabel}</SelectItem>
                    {category !== 'movies' ? (
                      <SelectItem value="current">{config.currentLabel}</SelectItem>
                    ) : null}
                    <SelectItem value="completed">{config.completedLabel}</SelectItem>
                    <SelectItem value="dropped">{config.droppedLabel}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isAnime || category === 'games' || isReadingCategory || isVisualWatchCategory ? (
                <div className="space-y-2">
                  <label
                    htmlFor="entry-platform-trigger"
                    className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    {isAnime || isVisualWatchCategory
                      ? 'Watched on'
                      : isReadingCategory
                        ? 'Reading format'
                        : 'Platform'}
                  </label>
                  <Select
                    value={platformValue}
                    onValueChange={value =>
                      setEditState(prev => ({
                        ...prev,
                        selectedPlatform: value === NO_PLATFORM_VALUE ? '' : value,
                      }))
                    }
                  >
                    <SelectTrigger id="entry-platform-trigger" className="h-10 !min-h-0">
                      <SelectValue placeholder={isGames ? 'Select a platform' : 'Not selected'} />
                    </SelectTrigger>
                    <SelectContent
                      portalContainer={selectPortalContainer ?? undefined}
                      className="data-[state=closed]:animate-none data-[state=open]:animate-none"
                    >
                      {/* Games cannot be saved without a platform, so offering
                          "Not selected" would only lead to a rejected save. */}
                      {isGames ? null : (
                        <SelectItem value={NO_PLATFORM_VALUE}>Not selected</SelectItem>
                      )}
                      {isAnime
                        ? ANIME_PLATFORMS.map(platform => (
                            <SelectItem key={platform.key} value={platform.key}>
                              {platform.label}
                            </SelectItem>
                          ))
                        : isReadingCategory
                          ? READING_FORMATS.map(format => (
                              <SelectItem key={format.key} value={format.key}>
                                {format.label}
                              </SelectItem>
                            ))
                          : category === 'movies'
                            ? MOVIES_PLATFORMS.map(platform => (
                                <SelectItem key={platform.key} value={platform.key}>
                                  {platform.label}
                                </SelectItem>
                              ))
                            : category === 'tv'
                              ? TV_PLATFORMS.map(platform => (
                                  <SelectItem key={platform.key} value={platform.key}>
                                    {platform.label}
                                  </SelectItem>
                                ))
                              : getGamePlatformOptions(entry.platforms).map(platform => (
                                  <SelectItem key={platform} value={platform}>
                                    {platform}
                                  </SelectItem>
                                ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="entry-progress"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {`Progress (${progressUnitLabel})`}
                </label>
                {!isGames ? (
                  <span className="text-xs text-muted-foreground">
                    {clampedProgress}
                    {total ? ` / ${total}` : ''}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setProgress((hasNumericProgress ? safeProgress : 0) - 1)}
                  className="h-9 min-w-10 px-0"
                >
                  -
                </Button>
                <Input
                  id="entry-progress"
                  value={editState.progress}
                  onChange={event => handleProgressInputChange(event.target.value)}
                  className="h-9 text-center"
                  inputMode="numeric"
                  placeholder="0"
                  aria-label="Progress value"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setProgress((hasNumericProgress ? safeProgress : 0) + 1)}
                  className="h-9 min-w-10 px-0"
                >
                  +
                </Button>
                {total ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setProgress(total)}
                    className="h-9"
                  >
                    Max
                  </Button>
                ) : null}
              </div>
              {progressPercent !== null ? (
                <div className="h-2 overflow-hidden rounded-full bg-border/60">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="entry-score"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Score
                </label>
                <span className="text-sm font-semibold text-foreground">
                  {editState.score === '' ? '-' : editState.score}
                </span>
              </div>

              <Slider
                value={[Number.isFinite(scoreNumber) ? scoreNumber : 0]}
                min={0}
                max={10}
                step={0.5}
                onValueChange={value =>
                  setEditState(prev => ({
                    ...prev,
                    score: String(value[0] ?? 0),
                  }))
                }
                aria-label="Score slider"
                className="[&_[data-slot=slider-track]]:h-1.5"
              />

              <div className="flex items-center gap-2">
                <Input
                  id="entry-score"
                  value={editState.score}
                  inputMode="decimal"
                  placeholder="0-10"
                  onChange={event => handleScoreChange(event.target.value)}
                  className="h-9 max-w-24 text-center"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditState(prev => ({ ...prev, score: '' }))}
                  className="h-9"
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Favorite
              </label>
              <Button
                type="button"
                variant={editState.isFavorite ? 'primary' : 'secondary'}
                onClick={() => setEditState(prev => ({ ...prev, isFavorite: !prev.isFavorite }))}
                aria-pressed={editState.isFavorite}
                className="h-10 w-full justify-start gap-2"
              >
                <Heart className="h-4 w-4" fill={editState.isFavorite ? 'currentColor' : 'none'} />
                {editState.isFavorite ? 'Favorited' : 'Mark as favorite'}
              </Button>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="entry-notes"
                className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                Notes
              </label>
              <Textarea
                id="entry-notes"
                value={editState.notes}
                onChange={event => setEditState(prev => ({ ...prev, notes: event.target.value }))}
                className="min-h-[92px]"
                placeholder="Add personal notes..."
              />
            </div>
          </div>
        </section>
      </div>

      <DialogFooter className="border-t border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:w-auto">
            {entry.mediaId ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                icon={<Trash2 className="h-4 w-4" />}
                className="w-full sm:w-auto"
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSave()}
              className="w-full sm:w-auto"
            >
              Save
            </Button>
          </div>
        </div>
      </DialogFooter>
    </div>
  ) : null;

  return (
    <>
      {isMobile ? (
        <Sheet open={!!entry} onOpenChange={open => !open && onClose()}>
          {entry ? (
            <SheetContent
              ref={handleSelectPortalMount}
              side="bottom"
              className="h-[100dvh] w-full max-w-none gap-0 border-x-0 border-b-0 border-t border-border bg-card p-0"
            >
              {editorPanel}
            </SheetContent>
          ) : null}
        </Sheet>
      ) : (
        <Dialog open={!!entry} onOpenChange={open => !open && onClose()}>
          {entry ? (
            <DialogContent
              withBlurBackdrop
              portalContainerRef={handleSelectPortalMount}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-0 border-border bg-card p-0 sm:max-h-[90vh] sm:rounded-3xl"
            >
              {editorPanel}
            </DialogContent>
          ) : null}
        </Dialog>
      )}

      {entry?.mediaId ? (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent className="border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">Delete entry</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                {`Are you sure you want to remove "${entry.title}" from your library?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border bg-transparent text-foreground">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-accent text-white hover:brightness-110"
                onClick={handleDeleteConfirmed}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
