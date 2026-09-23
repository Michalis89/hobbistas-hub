'use client';

import { useMemo } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import EmptyState from '@/components/ui/empty';
import MediaSearchResultCard from './MediaSearchResultCard';
import { trackRecommendationClick } from '@/lib/recommendations/instrumentation/client';
import type { MediaCategory, MediaEntry, SearchResult } from './types';

interface SuggestionsPanelProps {
  category: MediaCategory;
  suggestions: SearchResult[];
  isLoading: boolean;
  onOpenDialog: (entry: SearchResult) => void;
  libraryEntries: MediaEntry[];
}

export default function SuggestionsPanel({
  category,
  suggestions,
  isLoading,
  onOpenDialog,
  libraryEntries,
}: Readonly<SuggestionsPanelProps>) {
  const libraryMediaIds = useMemo(() => {
    return new Set(libraryEntries.map(entry => entry.mediaId).filter(Boolean));
  }, [libraryEntries]);

  const visibleSuggestions = useMemo(() => suggestions.slice(0, 4), [suggestions]);

  const summary = useMemo(() => {
    if (libraryEntries.length === 0) {
      return 'Start with one or two entries and recommendations will become more personal.';
    }

    const activeCount = libraryEntries.filter(entry => entry.status === 'current').length;
    if (activeCount > 0) {
      return `Based on your current activity, here are ${visibleSuggestions.length} titles worth checking now.`;
    }

    return `Based on your library profile, here are ${visibleSuggestions.length} recommended next picks.`;
  }, [libraryEntries, visibleSuggestions.length]);

  const isInLibrary = (entry: SearchResult): boolean => {
    if (entry.mediaId && libraryMediaIds.has(entry.mediaId)) {
      return true;
    }
    return false;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Lightbulb className="h-4 w-4 text-primary" />
          Personal summary
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Personal Suggestions
        </div>

        {visibleSuggestions.map(entry => (
          <MediaSearchResultCard
            key={entry.id}
            entry={{ ...entry, source: 'local' }}
            category={category}
            onOpenDialog={() => {
              trackRecommendationClick({ serveId: entry.serveId, mediaId: entry.mediaId });
              onOpenDialog({ ...entry, source: 'local' });
            }}
            isInLibrary={isInLibrary(entry)}
            variant="compact"
          />
        ))}

        {isLoading && (
          <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-5 text-center text-xs text-muted-foreground">
            Loading suggestions...
          </div>
        )}

        {!isLoading && visibleSuggestions.length === 0 && (
          <EmptyState
            title="No suggestions yet"
            description="Add a few entries and this panel will start offering curated picks."
            size="sm"
          />
        )}
      </div>
    </div>
  );
}
