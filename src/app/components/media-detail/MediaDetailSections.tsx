'use client';

import React, { useState } from 'react';
import { CoverHeroImage, CoverThumbImage } from '@/components/ui/cover-image';
import { Globe, Star, Users } from 'lucide-react';
import type { MediaCategory } from '@/app/components/backlog/types';
import type { MediaEntryState, MediaItem } from '@/lib/media/types';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type GalleryImage = {
  id: string;
  src: string;
  alt: string;
};

export function ScoreCluster({
  mediaItem,
  entryState,
}: {
  mediaItem: MediaItem;
  entryState: MediaEntryState | null;
}) {
  const scoreItems = [
    typeof entryState?.rating === 'number'
      ? {
          label: 'My rating',
          value: entryState.rating.toFixed(1),
          icon: <Star className="inline-block h-3.5 w-3.5" />,
        }
      : null,
    typeof mediaItem.aggregated_rating === 'number'
      ? {
          label: 'Aggregated',
          value: mediaItem.aggregated_rating.toFixed(1),
          icon: <Globe className="inline-block h-3.5 w-3.5" />,
        }
      : null,
    typeof mediaItem.metacritic === 'number'
      ? {
          label: 'Metacritic',
          value: `${mediaItem.metacritic}`,
          icon: <span className="text-xs font-bold">M</span>,
        }
      : null,
    typeof mediaItem.aggregated_rating_count === 'number'
      ? {
          label: 'Ratings',
          value: mediaItem.aggregated_rating_count.toLocaleString(),
          icon: <Users className="inline-block h-3.5 w-3.5" />,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; icon: React.ReactNode }>;

  if (scoreItems.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {scoreItems.map(item => (
        <div key={item.label} className="rounded-xl border border-border/70 bg-card/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            <span className="mr-1 opacity-70">{item.icon}</span>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function MetadataGrid({
  category,
  mediaItem,
}: {
  category: MediaCategory;
  mediaItem: MediaItem;
}) {
  const fields: Array<{ label: string; value: string }> = [];

  if (category === 'games') {
    if (mediaItem.platforms?.length) {
      fields.push({ label: 'Platforms', value: mediaItem.platforms.join(', ') });
    }
    if (mediaItem.developer) {
      fields.push({ label: 'Developer', value: mediaItem.developer });
    }
    if (mediaItem.publisher) {
      fields.push({ label: 'Publisher', value: mediaItem.publisher });
    }
    if (mediaItem.esrb_rating) {
      fields.push({ label: 'ESRB', value: mediaItem.esrb_rating });
    }
    if (mediaItem.release_date || mediaItem.first_release_date) {
      fields.push({
        label: 'Release date',
        value: mediaItem.release_date || mediaItem.first_release_date || '-',
      });
    }
    if (mediaItem.igdb_game_modes?.length) {
      fields.push({ label: 'Game modes', value: mediaItem.igdb_game_modes.join(', ') });
    }
    if (mediaItem.igdb_player_perspectives?.length) {
      fields.push({
        label: 'Player perspective',
        value: mediaItem.igdb_player_perspectives.join(', '),
      });
    }
  } else if (category === 'anime' || category === 'tv') {
    if (mediaItem.number_of_episodes || mediaItem.episodes) {
      fields.push({
        label: 'Episodes',
        value: `${mediaItem.number_of_episodes ?? mediaItem.episodes}`,
      });
    }
    if (mediaItem.number_of_seasons) {
      fields.push({ label: 'Seasons', value: `${mediaItem.number_of_seasons}` });
    }
    if (mediaItem.start_date || mediaItem.first_air_date) {
      fields.push({
        label: 'Air date',
        value: mediaItem.start_date || mediaItem.first_air_date || '-',
      });
    }
    if (mediaItem.status) {
      fields.push({ label: 'Status', value: mediaItem.status });
    }
    if (mediaItem.duration || mediaItem.runtime) {
      fields.push({ label: 'Duration', value: `${mediaItem.duration ?? mediaItem.runtime} min` });
    }
  } else if (category === 'manga') {
    if (mediaItem.volumes) {
      fields.push({ label: 'Volumes', value: `${mediaItem.volumes}` });
    }
    if (mediaItem.chapters) {
      fields.push({ label: 'Chapters', value: `${mediaItem.chapters}` });
    }
    if (mediaItem.release_date || mediaItem.start_date) {
      fields.push({
        label: 'Release date',
        value: mediaItem.release_date || mediaItem.start_date || '-',
      });
    }
    if (mediaItem.status) {
      fields.push({ label: 'Status', value: mediaItem.status });
    }
  } else if (category === 'books') {
    if (mediaItem.page_count) {
      fields.push({ label: 'Page count', value: `${mediaItem.page_count}` });
    }
    if (mediaItem.publisher) {
      fields.push({ label: 'Publisher', value: mediaItem.publisher });
    }
    if (mediaItem.release_date) {
      fields.push({ label: 'Release date', value: mediaItem.release_date });
    }
  } else if (category === 'movies') {
    if (mediaItem.runtime) {
      fields.push({ label: 'Runtime', value: `${mediaItem.runtime} min` });
    }
    if (mediaItem.release_date) {
      fields.push({ label: 'Release date', value: mediaItem.release_date });
    }
    if (mediaItem.status) {
      fields.push({ label: 'Status', value: mediaItem.status });
    }
  }

  if (mediaItem.official_website) {
    fields.push({ label: 'Website', value: mediaItem.official_website });
  }

  if (fields.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/60 p-5">
      <h3 className="text-lg font-semibold text-foreground">Details</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {fields.map(field => (
          <div
            key={`${field.label}-${field.value}`}
            className="rounded-xl border border-border/60 bg-card/70 p-3"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {field.label}
            </p>
            {field.label === 'Website' ? (
              <a
                href={field.value}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Globe className="h-3.5 w-3.5" />
                {field.value}
              </a>
            ) : (
              <p className="mt-1 text-sm text-foreground">{field.value}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function GallerySection({ title, images }: { title: string; images: GalleryImage[] }) {
  const [activeImage, setActiveImage] = useState<GalleryImage | null>(null);

  if (images.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5">
      <h3 className="text-lg font-semibold text-foreground">Gallery</h3>
      <div className="mt-4 overflow-hidden">
        <Carousel opts={{ align: 'start', loop: false }} className="group relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background/85 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background/85 to-transparent" />
          <CarouselContent className="ml-0">
            {images.map(image => (
              <CarouselItem
                key={image.id}
                className="basis-[72%] pl-0 pr-4 sm:basis-[42%] lg:basis-[30%]"
              >
                <button
                  type="button"
                  onClick={() => setActiveImage(image)}
                  className="w-full overflow-hidden rounded-xl border border-border/60 bg-card/80 text-left"
                >
                  <div className="relative aspect-video w-full">
                    <CoverThumbImage
                      src={image.src}
                      alt={image.alt}
                      sizes="(max-width: 768px) 70vw, 28vw"
                    />
                  </div>
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full border border-border/80 bg-background/90 text-foreground shadow-md transition-all hover:scale-105 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary" />
          <CarouselNext className="right-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full border border-border/80 bg-background/90 text-foreground shadow-md transition-all hover:scale-105 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary" />
        </Carousel>
      </div>

      <Dialog open={Boolean(activeImage)} onOpenChange={open => !open && setActiveImage(null)}>
        <DialogContent className="max-w-5xl border-border bg-card p-3">
          {activeImage ? (
            <div className="space-y-2">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{activeImage.alt}</DialogDescription>
              </DialogHeader>
              <div className="relative aspect-video w-full overflow-hidden rounded-xl">
                <CoverHeroImage
                  src={activeImage.src}
                  alt={activeImage.alt}
                  sizes="100vw"
                  // Contain, not cover: the lightbox shows the whole frame.
                  className="object-contain"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
