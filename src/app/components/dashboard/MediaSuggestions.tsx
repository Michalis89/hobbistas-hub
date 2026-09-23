'use client';

import Link from 'next/link';
import { CoverThumbImage, IMAGE_SIZES } from '@/components/ui/cover-image';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { MediaSuggestion } from '@/lib/dashboard/category-data';
import { DEFAULT_COVER } from '@/lib/constants/messages';
import { trackRecommendationClick } from '@/lib/recommendations/instrumentation/client';
import DashboardSectionHeader from './DashboardSectionHeader';
import {
  DASH_BORDER,
  DASH_RADIUS_CARD,
  DASH_PADDING_LARGE,
  DASH_PADDING_STANDARD,
  DASH_RADIUS_SECTION,
} from './dashboard-ui-tokens';

type MediaSuggestionsProps = {
  suggestions: MediaSuggestion[];
  category: string;
  hideWhenEmpty?: boolean;
};
const MIN_POSSIBLE_NEXT_CONFIDENCE = 0.2;

function SuggestionCard({ suggestion }: { suggestion: MediaSuggestion }) {
  const hasMediaId = Number.isFinite(suggestion.mediaId);
  const href = hasMediaId
    ? `/media/${suggestion.category}/${suggestion.mediaId}`
    : suggestion.slug
      ? `/media/${suggestion.category}/${suggestion.slug}`
      : null;

  const cardContent = (
    <>
      <div className="absolute inset-0">
        <CoverThumbImage
          src={suggestion.cover || DEFAULT_COVER}
          alt={suggestion.title}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          sizes={IMAGE_SIZES.grid3}
        />
        <div className="via-white/46 absolute inset-0 bg-gradient-to-t from-white/90 to-white/10 dark:hidden" />
        <div className="from-white/34 absolute inset-0 bg-gradient-to-r via-transparent to-white/10 dark:hidden" />
        <div className="via-white/42 absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white/80 to-transparent dark:hidden" />
        <div className="via-black/46 absolute inset-0 hidden bg-gradient-to-t from-black/90 to-black/10 dark:block" />
        <div className="from-black/34 absolute inset-0 hidden bg-gradient-to-r via-transparent to-black/10 dark:block" />
        <div className="via-black/42 absolute inset-x-0 bottom-0 hidden h-32 bg-gradient-to-t from-black/80 to-transparent dark:block" />
      </div>

      <div className="relative z-10 flex h-full min-w-0 flex-col justify-end p-3.5 sm:p-4">
        <div className="space-y-2">
          <p className="min-w-0 text-balance break-words text-base font-semibold leading-tight text-black dark:text-white dark:drop-shadow-[0_10px_24px_rgba(0,0,0,0.9)] sm:text-[18px]">
            {suggestion.title}
          </p>
          <p className="text-black/82 dark:text-white/84 min-w-0 break-words text-xs leading-relaxed dark:drop-shadow-[0_6px_18px_rgba(0,0,0,0.8)] sm:text-[13px]">
            {suggestion.reason}
          </p>
        </div>

        <div className="mt-3.5 flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-black/68 dark:text-white/74 text-[10px] uppercase tracking-[0.22em] dark:drop-shadow-[0_6px_18px_rgba(0,0,0,0.8)]">
              Confidence
            </p>
            <p className="text-xs font-semibold text-black dark:text-white/95 dark:drop-shadow-[0_8px_20px_rgba(0,0,0,0.88)] sm:text-sm">
              {Math.round(suggestion.confidence * 100)}%
            </p>
          </div>
          {href && (
            <span className="text-black/68 dark:text-white/74 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] transition-transform duration-200 group-focus-within:translate-x-0.5 group-hover:translate-x-0.5 dark:drop-shadow-[0_6px_18px_rgba(0,0,0,0.8)]">
              View details
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Card
        className={`group relative min-h-[184px] min-w-0 overflow-hidden bg-card/[0.98] shadow-[0_14px_34px_-26px_rgba(255,255,255,0.96)] transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/70 focus-within:ring-offset-2 focus-within:ring-offset-background hover:shadow-[0_20px_44px_-28px_rgba(255,255,255,1)] dark:bg-card/90 dark:shadow-[0_18px_34px_-26px_rgba(0,0,0,0.82)] dark:hover:shadow-[0_18px_34px_-26px_rgba(0,0,0,0.82)] ${DASH_RADIUS_CARD} ${DASH_BORDER}`}
      >
        <Link
          href={href}
          className="block h-full focus-visible:outline-none"
          onClick={() =>
            trackRecommendationClick({
              serveId: suggestion.serveId,
              mediaId: suggestion.mediaId,
            })
          }
        >
          {cardContent}
        </Link>
      </Card>
    );
  }

  return (
    <Card
      className={`group relative min-h-[184px] min-w-0 overflow-hidden bg-card/[0.98] shadow-[0_14px_34px_-26px_rgba(255,255,255,0.96)] dark:bg-card/90 dark:shadow-[0_18px_34px_-26px_rgba(0,0,0,0.82)] ${DASH_RADIUS_CARD} ${DASH_BORDER}`}
    >
      {cardContent}
    </Card>
  );
}

function SuggestionColumn({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: MediaSuggestion[];
  emptyLabel: string;
}) {
  return (
    <div className="min-w-0 space-y-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/90">
          {title}
        </p>
        <span className="text-xs text-muted-foreground/80">{items.length}/4</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/55 bg-card/40 p-5 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
          {items.map(suggestion => (
            <SuggestionCard
              key={`media-suggestion-${suggestion.source}-${suggestion.mediaId}`}
              suggestion={suggestion}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ category }: { category: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <div className="rounded-full bg-muted p-3">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            Not enough activity yet for {category}
          </h3>
          <p className="text-sm text-muted-foreground">
            Add a few more titles and this space will start to fill in.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Generates a dynamic label based on suggestion sources
 */
function generateSuggestionsLabel(suggestions: MediaSuggestion[]): string {
  const backlogCount = suggestions.filter(s => s.source === 'backlog').length;
  const dbCount = suggestions.filter(
    s => s.source === 'database' || s.source === 'database-fallback',
  ).length;

  if (backlogCount === 0 && dbCount === 0) {
    return '';
  }

  if (backlogCount === 0) {
    return dbCount === 1 ? '1 possible next title' : `${dbCount} possible next titles`;
  }

  if (dbCount === 0) {
    return backlogCount === 1 ? '1 from your backlog' : `${backlogCount} from your backlog`;
  }

  // Both exist
  return `${backlogCount} from backlog + ${dbCount} possible next`;
}

export default function MediaSuggestions({
  suggestions,
  category,
  hideWhenEmpty = false,
}: MediaSuggestionsProps) {
  const categoryLabelForSentence = category === 'TV' ? category : category.toLowerCase();
  const backlogSuggestions = suggestions.filter(s => s.source === 'backlog').slice(0, 4);
  const databaseSuggestions = suggestions
    .filter(
      s =>
        (s.source === 'database' || s.source === 'database-fallback') &&
        s.confidence >= MIN_POSSIBLE_NEXT_CONFIDENCE,
    )
    .slice(0, 4);
  const visibleSuggestions = [...backlogSuggestions, ...databaseSuggestions];
  const suggestionsLabel = generateSuggestionsLabel(visibleSuggestions);

  if (hideWhenEmpty && visibleSuggestions.length === 0) {
    return null;
  }

  return (
    <section
      className={`space-y-5 ${DASH_RADIUS_SECTION} ${DASH_BORDER} bg-muted/[0.12] ${DASH_PADDING_STANDARD} ${DASH_PADDING_LARGE} md:space-y-6`}
    >
      <DashboardSectionHeader
        eyebrow="Why these fit you"
        title={`Your next ${categoryLabelForSentence}`}
        rightSlot={
          visibleSuggestions.length > 0 && suggestionsLabel ? (
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground/85">
              {suggestionsLabel}
            </span>
          ) : undefined
        }
      />

      {visibleSuggestions.length === 0 ? (
        <EmptyState category={category} />
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-5">
          <SuggestionColumn
            title="From your backlog"
            items={backlogSuggestions}
            emptyLabel="Nothing to show from your backlog right now."
          />
          <SuggestionColumn
            title="Possible next titles"
            items={databaseSuggestions}
            emptyLabel="Not enough data yet to suggest possible next titles."
          />
        </div>
      )}
    </section>
  );
}
