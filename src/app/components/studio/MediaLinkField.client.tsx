'use client';

import { useEffect, useState } from 'react';
import { Link2, Search, X } from 'lucide-react';
import { CoverThumbImage, THUMB_SIZES_SM } from '@/components/ui/cover-image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ArticleCategory } from '@/types/database';
import { mediaSearchEndpointFor, type MediaSearchItem } from '@/lib/articles/composerConfig';

type MediaLinkFieldProps = {
  readonly category: ArticleCategory | '';
  readonly mediaId: number | null;
  readonly linkedTitle: string | null;
  readonly onLink: (item: MediaSearchItem) => void;
  readonly onUnlink: () => void;
};

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Attaches a media item to an article.
 *
 * Beyond filtering, the link is what lets a review point at the thing it
 * reviews, so the article can surface on that item's page and carry a real
 * subject in its structured data.
 */
export default function MediaLinkField({
  category,
  mediaId,
  linkedTitle,
  onLink,
  onUnlink,
}: MediaLinkFieldProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const endpoint = mediaSearchEndpointFor(category);

  useEffect(() => {
    if (!endpoint || !query.trim()) {
      setResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const response = await fetch(
          `${endpoint}${separator}q=${encodeURIComponent(query.trim())}`,
        );
        if (response.ok) {
          const data = (await response.json()) as { items?: MediaSearchItem[] };
          setResults((data.items ?? []).filter(item => item.mediaId).slice(0, 5));
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, endpoint]);

  if (!endpoint) {
    return null;
  }

  if (mediaId) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium text-foreground">Linked item</span>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <Link2 size={14} className="shrink-0 text-primary" />
            <span className="truncate">{linkedTitle ?? `#${mediaId}`}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            iconOnly
            title="Remove link"
            aria-label="Remove linked item"
            onClick={onUnlink}
          >
            <X size={14} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-foreground" htmlFor="composer-media-search">
        Linked item <span className="text-muted-foreground">(optional)</span>
      </label>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="composer-media-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search a title..."
          className="pl-9"
        />
        {isSearching && (
          <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>

      {results.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-border bg-card p-1">
          {results.map(item => (
            <li key={item.mediaId}>
              <button
                type="button"
                onClick={() => {
                  onLink(item);
                  setQuery('');
                  setResults([]);
                }}
                className="hover:bg-surface-hover flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
              >
                <span className="relative h-10 w-7 shrink-0 overflow-hidden rounded bg-muted">
                  {item.cover && (
                    <CoverThumbImage src={item.cover} alt={item.title} sizes={THUMB_SIZES_SM} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {item.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
