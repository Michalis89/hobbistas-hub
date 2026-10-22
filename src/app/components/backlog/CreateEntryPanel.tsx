'use client';

import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import EmptyState from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MediaSearchResultCard from './MediaSearchResultCard';
import type { MediaCategory, MediaEntry, SearchResult } from './types';
import { CATEGORY_CONFIG } from './types';

interface CreateEntryPanelProps {
  category: MediaCategory;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchResults: SearchResult[];
  isLoading: boolean;
  onOpenDialog: (entry: SearchResult) => void;
  onClose: () => void;
  libraryEntries: MediaEntry[];
  /** Whether the API has another page of results (paginated categories only). */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function CreateEntryPanel({
  category,
  searchQuery,
  onSearchChange,
  searchResults,
  isLoading,
  onOpenDialog,
  onClose,
  libraryEntries,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: Readonly<CreateEntryPanelProps>) {
  const config = CATEGORY_CONFIG[category];
  const normalizeLookupValue = (value: string | undefined) =>
    (value ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const libraryMediaIds = useMemo(() => {
    return new Set(libraryEntries.map(entry => entry.mediaId).filter(Boolean));
  }, [libraryEntries]);
  const libraryTitleYearKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of libraryEntries) {
      const normalizedTitle = normalizeLookupValue(entry.title);
      if (!normalizedTitle) {
        continue;
      }
      keys.add(`${normalizedTitle}::${entry.year ?? ''}`);
      keys.add(`${normalizedTitle}::`);
    }
    return keys;
  }, [libraryEntries]);

  const isInLibrary = (entry: SearchResult): boolean => {
    if (entry.mediaId && libraryMediaIds.has(entry.mediaId)) {
      return true;
    }
    const normalizedTitle = normalizeLookupValue(entry.title);
    if (!normalizedTitle) {
      return false;
    }
    if (libraryTitleYearKeys.has(`${normalizedTitle}::${entry.year ?? ''}`)) {
      return true;
    }
    if (libraryTitleYearKeys.has(`${normalizedTitle}::`)) {
      return true;
    }
    return false;
  };

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Add Entry</p>
          <p className="text-xs text-muted-foreground">{config.searchPlaceholder}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pt-4 sm:px-5">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search size={16} />
          </div>
          <Input
            type="search"
            value={searchQuery}
            onChange={event => onSearchChange(event.target.value)}
            placeholder={config.searchPlaceholder}
            className="h-10 rounded-xl border-border/60 bg-background/60 pl-10 text-sm"
          />
        </div>
      </div>

      {/* Results */}
      <div className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          {searchResults.map(entry => (
            <MediaSearchResultCard
              key={`create-${entry.id}`}
              entry={entry}
              category={category}
              onOpenDialog={onOpenDialog}
              variant="compact"
              isInLibrary={isInLibrary(entry)}
            />
          ))}
          {isLoading && (
            <div className="rounded-xl px-4 py-5 text-center text-xs text-muted-foreground md:col-span-2">
              Searching...
            </div>
          )}
          {!isLoading && searchResults.length === 0 && (
            <EmptyState title="No results found." size="sm" className="md:col-span-2" />
          )}
          {!isLoading && hasMore && searchResults.length > 0 && onLoadMore && (
            <div className="flex justify-center pt-1 md:col-span-2">
              <Button
                variant="outline"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="h-9 rounded-[12px] px-4"
              >
                {isLoadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
