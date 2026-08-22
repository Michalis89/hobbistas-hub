'use client';

import { useEffect, useState } from 'react';
import { LibraryBig, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { CoverThumbImage, THUMB_SIZES_SM } from '@/components/ui/cover-image';
import type { ArticleCategory } from '@/types/database';
import { mediaSearchEndpointFor } from '@/lib/articles/composerConfig';

export type PickedMediaItem = {
  mediaId: number;
  title: string;
  cover: string | null;
  year: string | null;
};

type MediaPickerDialogProps = {
  readonly open: boolean;
  readonly category: ArticleCategory | '';
  readonly onClose: () => void;
  readonly onSelect: (item: PickedMediaItem) => void;
};

const SEARCH_DEBOUNCE_MS = 400;

type SearchResponseItem = {
  mediaId?: number;
  title?: string;
  cover?: string | null;
  year?: string | null;
};

/**
 * Searches the media library so an author can embed a title inside an article.
 *
 * Only the article's own category is searchable: the embed links into
 * /media/{category}/..., so mixing categories would produce dead links.
 */
export default function MediaPickerDialog({
  open,
  category,
  onClose,
  onSelect,
}: MediaPickerDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedMediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const endpoint = mediaSearchEndpointFor(category);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !endpoint || !query.trim()) {
      setResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const response = await fetch(`${endpoint}${separator}q=${encodeURIComponent(query.trim())}`);
        if (response.ok) {
          const data = (await response.json()) as { items?: SearchResponseItem[] };
          setResults(
            (data.items ?? [])
              .filter((item): item is SearchResponseItem & { mediaId: number } =>
                Boolean(item.mediaId),
              )
              .slice(0, 8)
              .map(item => ({
                mediaId: item.mediaId,
                title: item.title ?? 'Untitled',
                cover: item.cover ?? null,
                year: item.year ?? null,
              })),
          );
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [open, query, endpoint]);

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Embed a title</DialogTitle>
          <DialogDescription>
            {endpoint
              ? 'Readers can add it to their library without leaving the article.'
              : 'Pick a media category for this article first.'}
          </DialogDescription>
        </DialogHeader>

        {endpoint && (
          <div className="space-y-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search a title..."
                className="pl-9"
              />
              {isSearching && (
                <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>

            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {results.map(item => (
                <li key={item.mediaId}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                      {item.cover ? (
                        <CoverThumbImage
                          src={item.cover}
                          alt={item.title}
                          sizes={THUMB_SIZES_SM}
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center">
                          <LibraryBig size={14} className="text-muted-foreground" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      {item.year && (
                        <span className="text-xs text-muted-foreground">{item.year}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {!isSearching && query.trim() && results.length === 0 && (
                <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Nothing found for “{query.trim()}”.
                </li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
