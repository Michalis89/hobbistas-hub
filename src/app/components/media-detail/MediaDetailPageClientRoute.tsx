'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Star, CheckCircle, XCircle, CalendarDays, Pencil, BookOpen } from 'lucide-react';
import { CoverHeroImage } from '@/components/ui/cover-image';
import { PageContainer } from '@/app/components/layout';
import { Button } from '@/components/ui/button';
import BackButton from '@/app/components/shared/BackButton';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle, ErrorAlert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import MediaEntryDialogController from '@/app/components/media/MediaEntryDialogController';
import Breadcrumbs from '@/components/ui/breadcrumbs';
import type { EditState } from '@/app/components/backlog/EntryEditDialog';
import { yieldToMain } from '@/lib/performance';
import {
  CATEGORY_CONFIG,
  getApiBase,
  type MediaCategory,
  type MediaEntry,
  type SearchResult,
} from '@/app/components/backlog/types';
import type { MediaEntryState, MediaItem } from '@/lib/media/types';
import type { ArticleRow } from '@/types/database';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import {
  buildEntry,
  getProgressDisplay,
  getStatusLabel,
  igdbImageUrl,
} from '@/app/components/media-detail/mediaDetailClient.helpers';
import {
  GallerySection,
  MetadataGrid,
  ScoreCluster,
  type GalleryImage,
} from '@/app/components/media-detail/MediaDetailSections';

type AlertState = {
  type: 'success' | 'error';
  title: string;
  message: string;
} | null;

type MediaDetailPageClientProps = {
  category: MediaCategory;
  mediaItem: MediaItem;
};

/** Pulls the API's own explanation out of a failed response, if it has one. */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === 'string' && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export default function MediaDetailPageClient({
  category,
  mediaItem,
}: Readonly<MediaDetailPageClientProps>) {
  const [entryState, setEntryState] = useState<MediaEntryState | null>(null);
  const [entryLoading, setEntryLoading] = useState(true);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [dialogEntry, setDialogEntry] = useState<(MediaEntry & Partial<SearchResult>) | null>(null);
  const [alert, setAlert] = useState<AlertState>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [linkedArticles, setLinkedArticles] = useState<ArticleRow[]>([]);

  const { settings } = useUserSettings(true);

  const apiBase = getApiBase(category);
  const baseEntry = useMemo(() => buildEntry(mediaItem, entryState), [mediaItem, entryState]);
  const hasEntry = Boolean(entryState?.entryId);
  const shouldRenderMyEntrySection = entryLoading || Boolean(entryError) || hasEntry;

  const galleryImages = useMemo<GalleryImage[]>(() => {
    const artworks = (mediaItem.igdb_artwork_image_ids ?? []).map((id, idx) => ({
      id: `art-${idx}-${id}`,
      src: igdbImageUrl(id),
      alt: `${baseEntry.title} artwork ${idx + 1}`,
    }));
    const screenshots = (mediaItem.igdb_screenshot_image_ids ?? []).map((id, idx) => ({
      id: `shot-${idx}-${id}`,
      src: igdbImageUrl(id),
      alt: `${baseEntry.title} screenshot ${idx + 1}`,
    }));
    return [...artworks, ...screenshots];
  }, [mediaItem.igdb_artwork_image_ids, mediaItem.igdb_screenshot_image_ids, baseEntry.title]);

  const overviewText = mediaItem.summary || mediaItem.description || '';
  const storyText = mediaItem.storyline?.trim() || '';
  const shortOverview =
    overviewText.length > 280 ? `${overviewText.slice(0, 280).trim()}...` : overviewText;

  const refreshEntry = async () => {
    if (!mediaItem.id) {
      return;
    }

    setEntryLoading(true);
    setEntryError(null);

    try {
      const response = await fetch(
        `/api/media/entry?category=${encodeURIComponent(category)}&mediaId=${mediaItem.id}`,
      );

      if (response.status === 401) {
        setEntryState(null);
        return;
      }

      if (!response.ok) {
        throw new Error('Entry fetch failed');
      }

      const data = (await response.json()) as { entry?: MediaEntryState | null };
      setEntryState(data.entry ?? null);
    } catch (error) {
      console.warn('Entry fetch failed:', error);
      setEntryError('Failed to fetch entry data.');
    } finally {
      setEntryLoading(false);
    }
  };

  useEffect(() => {
    void refreshEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, mediaItem.id]);

  const refreshLinkedArticles = async () => {
    if (!mediaItem.id) {
      return;
    }
    const res = await fetch(`/api/articles?media_id=${mediaItem.id}&limit=20`);
    if (res.ok) {
      const data = (await res.json()) as { data?: ArticleRow[] };
      setLinkedArticles(data.data ?? []);
    }
  };

  useEffect(() => {
    void refreshLinkedArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaItem.id]);

  const openDialog = (overrides?: Partial<MediaEntry>) => {
    setDialogEntry({
      ...baseEntry,
      ...overrides,
      source: 'local',
      mediaId: mediaItem.id,
    });
  };

  const handleSaveEntry = async (editState: EditState) => {
    if (!apiBase) {
      return;
    }

    setDialogEntry(null);
    setActionLoading(true);
    await yieldToMain();

    try {
      const progressValue = Number.parseInt(editState.progress, 10);
      const scoreValue = Number.parseFloat(editState.score);
      const nextProgress = Number.isFinite(progressValue) ? progressValue : null;
      const nextScore = Number.isFinite(scoreValue) ? scoreValue : null;
      const nextNotes = editState.notes || null;

      if (hasEntry) {
        const response = await fetch(`${apiBase}/library`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId: mediaItem.id,
            clientUpdatedAt: entryState?.updatedAt,
            status: editState.status,
            is_favorite: editState.isFavorite,
            selected_platform:
              category === 'games' ? editState.selectedPlatform || null : undefined,
            progress: nextProgress,
            score: nextScore,
            notes: nextNotes,
          }),
        });

        if (response.status === 409) {
          await refreshEntry();
          setAlert({
            type: 'error',
            title: 'Conflict',
            message: 'Your changes conflicted with another update. Entry refreshed.',
          });
          return;
        }

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Update failed'));
        }
      } else {
        const response = await fetch(`${apiBase}/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'local',
            mediaId: mediaItem.id,
            status: editState.status,
            is_favorite: editState.isFavorite,
            // The API rejects games without a platform. This was omitted here
            // while the update branch above sent it, so adding a game from this
            // page always failed with 400.
            selected_platform:
              category === 'games' ? editState.selectedPlatform || null : undefined,
            progress: nextProgress ?? undefined,
            score: nextScore ?? undefined,
            notes: nextNotes,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Add failed'));
        }
      }

      await yieldToMain();
      await refreshEntry();

      setAlert({
        type: 'success',
        title: 'Entry saved',
        message: 'Your library entry was saved successfully.',
      });
    } catch (error) {
      console.warn('Save entry failed:', error);
      setAlert({
        type: 'error',
        title: 'Error',
        // Show what the server actually objected to. A blanket "try again"
        // sends the user in circles when the fix is a missing platform.
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Failed to save entry. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteEntry = async (entry: MediaEntry) => {
    if (!apiBase || !entry.mediaId) {
      setEntryState(null);
      return;
    }

    setActionLoading(true);

    try {
      const response = await fetch(`${apiBase}/library`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: entry.mediaId }),
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      setEntryState(null);
      setAlert({
        type: 'success',
        title: 'Entry removed',
        message: 'The library entry was removed.',
      });
    } catch (error) {
      console.warn('Delete entry failed:', error);
      setAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete entry. Please try again.',
      });
    } finally {
      setActionLoading(false);
      setDialogEntry(null);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!apiBase) {
      return;
    }

    if (!hasEntry) {
      openDialog({ isFavorite: true });
      return;
    }

    setActionLoading(true);
    await yieldToMain();

    try {
      const response = await fetch(`${apiBase}/library`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: mediaItem.id,
          clientUpdatedAt: entryState?.updatedAt,
          is_favorite: !(entryState?.favorite ?? false),
        }),
      });

      if (response.status === 409) {
        await refreshEntry();
        setAlert({
          type: 'error',
          title: 'Conflict',
          message: 'Your changes conflicted with another update. Entry refreshed.',
        });
        return;
      }

      if (!response.ok) {
        throw new Error('Favorite toggle failed');
      }

      await yieldToMain();
      await refreshEntry();
    } catch (error) {
      console.warn('Favorite toggle failed:', error);
      setAlert({
        type: 'error',
        title: 'Error',
        message: 'Could not update favorite status. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const visibleLinkedReviews = linkedArticles.filter(
    a => a.topic === 'reviews' && (settings?.reviews_enabled ?? true),
  );

  const statusLabel = getStatusLabel(category, entryState);
  const ratingLabel =
    entryState?.rating !== null && entryState?.rating !== undefined
      ? entryState.rating.toFixed(1)
      : '-';

  const categoryLabel = CATEGORY_CONFIG[category]?.title || category;
  const breadcrumbs = [
    { label: 'Home', href: '/dashboard' },
    { label: 'Library', href: '/backlog' },
    { label: categoryLabel, href: `/backlog?category=${category}` },
    { label: baseEntry.title },
  ];

  return (
    <PageContainer size="lg" className="py-8">
      {alert && (
        <Alert
          key={`${alert.type}-${alert.title}`}
          variant={alert.type === 'error' ? 'destructive' : 'success'}
          className="mb-6"
        >
          {alert.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <Breadcrumbs items={breadcrumbs} className="mb-6" />
      <BackButton fallbackHref={`/backlog?category=${category}`} className="mb-4" />

      <div className="relative space-y-6">
        <div className="absolute inset-0 -z-10 opacity-30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,hsl(var(--primary)/0.2),transparent_52%)]" />
          {mediaItem.banner_image ? (
            <div
              className="absolute inset-x-0 top-0 h-72 bg-cover bg-center opacity-20"
              style={{
                backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.35), transparent), url(${mediaItem.banner_image})`,
              }}
            />
          ) : null}
        </div>

        <section className="rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
            <div className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-2xl border border-border/70 bg-card/70">
              <div className="relative aspect-[3/4]">
                <CoverHeroImage
                  src={baseEntry.cover}
                  alt={baseEntry.title}
                  sizes="(max-width: 768px) 70vw, 260px"
                  priority
                  className="object-cover"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                  {category.toUpperCase()}
                </p>
                <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  {baseEntry.title}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {baseEntry.subtitle}
                  {baseEntry.year ? ` - ${baseEntry.year}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="rounded-full border border-border/70 bg-card/70 px-3 py-1"
                >
                  {statusLabel}
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full border border-border/70 bg-card/70 px-3 py-1"
                >
                  <Star className="mr-1 h-3.5 w-3.5 text-primary" />
                  {ratingLabel}
                </Badge>
                {baseEntry.year ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full border border-border/70 bg-card/70 px-3 py-1"
                  >
                    <CalendarDays className="mr-1 h-3.5 w-3.5" />
                    {baseEntry.year}
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {baseEntry.tags.length > 0 ? (
                  baseEntry.tags.slice(0, 10).map(tag => (
                    <span
                      key={tag}
                      className="rounded-full border border-border/70 bg-card/50 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No genres available</span>
                )}
                {(mediaItem.igdb_themes ?? []).slice(0, 4).map(theme => (
                  <span
                    key={theme}
                    className="rounded-full border border-border/70 bg-card/50 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {theme}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  onClick={() => (hasEntry ? openDialog() : openDialog({ status: 'planned' }))}
                  disabled={actionLoading}
                  className="rounded-full px-5"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {hasEntry ? 'Update Entry' : 'Add Entry'}
                </Button>

                <Button
                  type="button"
                  onClick={handleFavoriteToggle}
                  disabled={actionLoading}
                  variant={entryState?.favorite ? 'primary' : 'secondary'}
                  className="rounded-full"
                >
                  <Heart className="mr-2 h-4 w-4" />
                  {entryState?.favorite ? 'In favorites' : 'Add to favorites'}
                </Button>

                {visibleLinkedReviews.length > 0 ? (
                  <Button variant="secondary" asChild className="rounded-full">
                    <a href={`/review/${visibleLinkedReviews[0].slug}`}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Read Review
                    </a>
                  </Button>
                ) : null}
              </div>

              <ScoreCluster mediaItem={mediaItem} entryState={entryState} />
            </div>
          </div>
        </section>

        {shouldRenderMyEntrySection ? (
          <section className="rounded-2xl border border-border/70 bg-card/60 p-5">
            <h3 className="text-lg font-semibold text-foreground">My Entry</h3>

            {entryLoading ? (
              <div className="mt-4 inline-flex items-center gap-2">
                <Spinner className="size-4" />
                <span className="text-sm text-muted-foreground">Fetching entry data...</span>
              </div>
            ) : entryError ? (
              <div className="mt-4">
                <ErrorAlert message={entryError} />
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{statusLabel}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Progress
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {getProgressDisplay(category, entryState, mediaItem)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    My rating
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{ratingLabel}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground/90">
                    {entryState?.notes || 'No notes yet.'}
                  </p>
                </div>
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-2xl border border-border/70 bg-card/60 p-5">
          <h3 className="text-lg font-semibold text-foreground">Overview</h3>
          <div className="mt-3 text-sm leading-relaxed text-foreground/90">
            {overviewText ? (
              <p className="whitespace-pre-line">
                {overviewExpanded ? overviewText : shortOverview}
              </p>
            ) : (
              <p className="text-muted-foreground">No description available.</p>
            )}
          </div>
          {overviewText.length > 280 ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => setOverviewExpanded(v => !v)}
            >
              {overviewExpanded ? 'Show less' : 'Read more'}
            </Button>
          ) : null}
        </section>

        {storyText ? (
          <section className="rounded-2xl border border-border/70 bg-card/60 p-5">
            <h3 className="text-lg font-semibold text-foreground">Story</h3>
            <div className="mt-3 text-sm leading-relaxed text-foreground/90">
              <p className="whitespace-pre-line">{storyText}</p>
            </div>
          </section>
        ) : null}

        <MetadataGrid category={category} mediaItem={mediaItem} />

        <GallerySection title={baseEntry.title} images={galleryImages} />
      </div>

      <MediaEntryDialogController
        category={category}
        entry={dialogEntry}
        onClose={() => setDialogEntry(null)}
        onSave={handleSaveEntry}
        onDelete={handleDeleteEntry}
      />
    </PageContainer>
  );
}
