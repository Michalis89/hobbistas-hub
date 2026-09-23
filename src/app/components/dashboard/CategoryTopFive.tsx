'use client';

import { CoverThumbImage } from '@/components/ui/cover-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  DragDropProvider,
  DragOverlay,
  PointerSensor,
  type DragDropEventHandlers,
} from '@dnd-kit/react';
import { isSortableOperation, useSortable } from '@dnd-kit/react/sortable';
import { arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import type { DashboardCategoryKey, DashboardTopFiveItem } from '@/lib/dashboard/category-data';
import DashboardSectionHeader from './DashboardSectionHeader';
import {
  DASH_BORDER,
  DASH_PADDING_LARGE,
  DASH_PADDING_STANDARD,
  DASH_RADIUS_SECTION,
  DASH_SURFACE_SECTION,
} from './dashboard-ui-tokens';
import { useIsMobile } from '@/hooks/use-mobile';

const TOP_FIVE_LIMIT = 5;
const SORTABLE_GROUP_ID = 'dashboard-favorites';

type CategoryTopFiveProps = {
  category: DashboardCategoryKey;
  items: DashboardTopFiveItem[];
  favorites?: DashboardTopFiveItem[];
  isReadOnly?: boolean;
};

type DragStartPayload = Parameters<NonNullable<DragDropEventHandlers['onDragStart']>>[0];
type DragEndPayload = Parameters<NonNullable<DragDropEventHandlers['onDragEnd']>>[0];

function normalizeEntryId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function SortableFavoriteCard({
  item,
  rank,
  index,
  isMobile,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isReadOnly = false,
}: {
  item: DashboardTopFiveItem;
  rank: number;
  index: number;
  isMobile: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isReadOnly?: boolean;
}) {
  const { ref, isDragging } = useSortable({
    id: item.entryId,
    index,
    group: SORTABLE_GROUP_ID,
    transition: {
      duration: 300,
      easing: 'cubic-bezier(0.18, 0.9, 0.22, 1)',
    },
  });

  const isTopFive = rank <= TOP_FIVE_LIMIT;
  const isPriorityImage = rank === 1;
  return (
    <article
      ref={ref}
      className={[
        // Base
        'group relative h-full w-full select-none overflow-hidden rounded-3xl',
        isMobile ? 'touch-auto' : 'touch-none',
        isMobile ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        'border border-border/35 bg-card/40',
        'shadow-[0_18px_60px_-40px_rgba(0,0,0,0.85)]',
        'ease-snappy transition-all delay-0 duration-300 group-hover:delay-75',
        // Lift / glow on hover
        'hover:border-border/50 hover:bg-card/50',
        // Drag state
        isDragging ? 'z-10 opacity-60 shadow-2xl' : '',
        // Top-5 highlight (subtle but premium)
        isTopFive ? 'ring-1 ring-primary/15' : 'ring-1 ring-white/5',
      ].join(' ')}
      aria-label={`Reorder favorite ${item.title}`}
    >
      {/* Cinematic Poster Stage */}
      <div className="relative aspect-[16/10] w-full bg-black">
        <CoverThumbImage
          src={item.cover}
          alt={item.title}
          sizes="(max-width: 768px) 90vw, 240px"
          priority={isPriorityImage}
          loading={isPriorityImage ? undefined : 'lazy'}
          // Cinematic crop (faces/top composition survives more often)
          className="ease-snappy object-cover object-[50%_25%] transition-transform delay-0 duration-300 [backface-visibility:hidden] group-hover:scale-[1.04] group-hover:delay-75"
        />

        <div
          className="duration-220 ease-snappy pointer-events-none absolute -inset-px transition-opacity delay-0 group-hover:opacity-95 dark:hidden"
          style={{
            background:
              'linear-gradient(to bottom, rgba(255,255,255,0.14), rgba(255,255,255,0) 45%, rgba(255,255,255,0.48)),' +
              'linear-gradient(to top, rgba(255,255,255,0.58), rgba(255,255,255,0.16) 55%, rgba(255,255,255,0)),' +
              'radial-gradient(900px circle at 15% 0%, rgba(255,255,255,0.08), transparent 55%)',
          }}
        />
        <div
          className="duration-220 ease-snappy pointer-events-none absolute -inset-px hidden transition-opacity delay-0 group-hover:opacity-95 dark:block"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.22), rgba(0,0,0,0) 45%, rgba(0,0,0,0.70)),' +
              'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0)),' +
              'radial-gradient(900px circle at 15% 0%, rgba(255,255,255,0.10), transparent 55%)',
          }}
        />

        {/* Top badge */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white ring-1 ring-white/10 backdrop-blur-sm">
            {isTopFive ? `Top ${rank}` : `#${rank}`}
          </span>

          {item.status === 'current' ? (
            <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90 ring-1 ring-white/10 backdrop-blur-sm">
              Current
            </span>
          ) : null}
        </div>

        {isMobile && !isReadOnly ? (
          <div className="absolute bottom-3 right-3 inline-flex items-center gap-1">
            <button
              type="button"
              aria-label={`Move ${item.title} up`}
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/90 backdrop-blur-sm disabled:opacity-45"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Move ${item.title} down`}
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/90 backdrop-blur-sm disabled:opacity-45"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* Rating badge */}
        {item.rating ? (
          <div className="absolute right-3 top-3">
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1',
                'text-[10px] font-semibold tracking-[0.12em] text-white ring-1 ring-white/10 backdrop-blur-sm',
                // subtle violet glow (fits violet-bloom without hardcoding neon)
                'shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_40px_-20px_rgba(124,58,237,0.55)]',
              ].join(' ')}
            >
              <span className="text-white/90">★</span>
              <span>{item.rating}</span>
            </span>
          </div>
        ) : null}

        {/* Bottom text */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground dark:text-white dark:drop-shadow-[0_12px_28px_rgba(0,0,0,0.9)]">
            {item.title}
          </h3>

          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-foreground/70 dark:text-white/70">
              {item.subtitle}
            </p>
          </div>

          {/* Progress (only current) */}
          {item.status === 'current' && item.progressPercent !== undefined ? (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-medium text-foreground/70 dark:text-white/70">
                <span>Progress</span>
                <span>{item.progressPercent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/15 dark:bg-white/15">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${item.progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MobileFavoriteCard({
  item,
  rank,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isReadOnly = false,
}: {
  item: DashboardTopFiveItem;
  rank: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isReadOnly?: boolean;
}) {
  const isTopFive = rank <= TOP_FIVE_LIMIT;
  const isPriorityImage = rank === 1;

  return (
    <article
      className={[
        'group relative h-full w-full touch-auto select-none overflow-hidden rounded-3xl',
        'cursor-default border border-border/35 bg-card/40',
        'shadow-[0_18px_60px_-40px_rgba(0,0,0,0.85)]',
        'ease-snappy transition-all delay-0 duration-300 group-hover:delay-75',
        'hover:border-border/50 hover:bg-card/50',
        isTopFive ? 'ring-1 ring-primary/15' : 'ring-1 ring-white/5',
      ].join(' ')}
      aria-label={`Reorder favorite ${item.title}`}
    >
      <div className="relative aspect-[16/10] w-full bg-black">
        <CoverThumbImage
          src={item.cover}
          alt={item.title}
          sizes="(max-width: 768px) 90vw, 240px"
          priority={isPriorityImage}
          loading={isPriorityImage ? undefined : 'lazy'}
          className="ease-snappy object-cover object-[50%_25%] transition-transform delay-0 duration-300 [backface-visibility:hidden] group-hover:scale-[1.04] group-hover:delay-75"
        />

        <div
          className="duration-220 ease-snappy pointer-events-none absolute -inset-px transition-opacity delay-0 group-hover:opacity-95 dark:hidden"
          style={{
            background:
              'linear-gradient(to bottom, rgba(255,255,255,0.14), rgba(255,255,255,0) 45%, rgba(255,255,255,0.48)),' +
              'linear-gradient(to top, rgba(255,255,255,0.58), rgba(255,255,255,0.16) 55%, rgba(255,255,255,0)),' +
              'radial-gradient(900px circle at 15% 0%, rgba(255,255,255,0.08), transparent 55%)',
          }}
        />
        <div
          className="duration-220 ease-snappy pointer-events-none absolute -inset-px hidden transition-opacity delay-0 group-hover:opacity-95 dark:block"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.22), rgba(0,0,0,0) 45%, rgba(0,0,0,0.70)),' +
              'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0)),' +
              'radial-gradient(900px circle at 15% 0%, rgba(255,255,255,0.10), transparent 55%)',
          }}
        />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white ring-1 ring-white/10 backdrop-blur-sm">
            {isTopFive ? `Top ${rank}` : `#${rank}`}
          </span>
          {item.status === 'current' ? (
            <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90 ring-1 ring-white/10 backdrop-blur-sm">
              Current
            </span>
          ) : null}
        </div>

        {!isReadOnly ? (
          <div className="pointer-events-auto absolute bottom-3 right-3 z-10 inline-flex items-center gap-1">
            <button
              type="button"
              aria-label={`Move ${item.title} up`}
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/90 backdrop-blur-sm disabled:opacity-45"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Move ${item.title} down`}
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/90 backdrop-blur-sm disabled:opacity-45"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {item.rating ? (
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-white ring-1 ring-white/10 backdrop-blur-sm">
              <span className="text-white/90">★</span>
              <span>{item.rating}</span>
            </span>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground dark:text-white dark:drop-shadow-[0_12px_28px_rgba(0,0,0,0.9)]">
            {item.title}
          </h3>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-foreground/70 dark:text-white/70">
              {item.subtitle}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function mergeFavorites(
  topItems: DashboardTopFiveItem[],
  favorites: DashboardTopFiveItem[],
): DashboardTopFiveItem[] {
  const merged: DashboardTopFiveItem[] = [];
  const seen = new Set<number>();

  for (const item of [...topItems, ...favorites]) {
    if (seen.has(item.entryId)) {
      continue;
    }
    seen.add(item.entryId);
    merged.push(item);
  }

  return merged;
}

function OverlayFavoriteCard({ item, rank }: { item: DashboardTopFiveItem; rank: number }) {
  const isTopFive = rank <= TOP_FIVE_LIMIT;

  return (
    <article
      className={[
        'relative w-[min(340px,92vw)] overflow-hidden rounded-3xl border p-0',
        isTopFive ? 'border-primary/35 bg-card/70' : 'border-border/40 bg-card/60',
        'shadow-[0_30px_120px_-60px_rgba(0,0,0,0.9)]',
      ].join(' ')}
    >
      <div className="relative aspect-[16/10] w-full bg-black">
        <CoverThumbImage
          src={item.cover}
          alt={item.title}
          sizes="340px"
          loading="eager"
          className="object-cover object-[50%_25%] [backface-visibility:hidden]"
        />
        <div className="via-white/18 pointer-events-none absolute -inset-px bg-gradient-to-t from-white/65 to-transparent dark:hidden" />
        <div className="pointer-events-none absolute -inset-px hidden bg-gradient-to-t from-black/85 via-black/25 to-transparent dark:block" />
        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white ring-1 ring-white/10 backdrop-blur-sm">
            {isTopFive ? `Top ${rank}` : `#${rank}`}
          </span>
        </div>
        {item.rating ? (
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-white ring-1 ring-white/10 backdrop-blur-sm">
              <span className="text-white/90">★</span>
              <span>{item.rating}</span>
            </span>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground drop-shadow-none dark:text-white dark:drop-shadow-[0_12px_28px_rgba(0,0,0,0.9)]">
            {item.title}
          </h3>
          <p className="mt-1 truncate text-xs text-foreground/70 dark:text-white/70">
            {item.subtitle}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function CategoryTopFive({
  category,
  items,
  favorites = [],
  isReadOnly = false,
}: CategoryTopFiveProps) {
  const isMobile = useIsMobile();
  const initialOrder = useMemo(() => mergeFavorites(items, favorites), [items, favorites]);
  const [order, setOrder] = useState<DashboardTopFiveItem[]>(initialOrder);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [hasLocalReorder, setHasLocalReorder] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);
  const lastCategoryRef = useRef(category);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const initialOrderKey = useMemo(
    () => initialOrder.map(item => item.entryId).join(','),
    [initialOrder],
  );
  const orderKey = useMemo(() => order.map(item => item.entryId).join(','), [order]);

  useEffect(() => {
    if (lastCategoryRef.current === category) {
      return;
    }
    lastCategoryRef.current = category;

    const resetTimer = window.setTimeout(() => {
      setHasLocalReorder(false);
      setOrder(initialOrder);
      setIsExpanded(false);
    }, 0);

    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [category, initialOrder]);

  useEffect(() => {
    if (activeId !== null) {
      return;
    }

    const syncOrderTimer = window.setTimeout(() => {
      if (hasLocalReorder) {
        // Keep local optimistic order until upstream props catch up.
        if (initialOrderKey === orderKey) {
          setHasLocalReorder(false);
        }
        return;
      }

      setOrder(initialOrder);
    }, 0);

    return () => {
      window.clearTimeout(syncOrderTimer);
    };
  }, [activeId, hasLocalReorder, initialOrder, initialOrderKey, orderKey]);

  const activeItem = useMemo(
    () => (activeId === null ? null : (order.find(item => item.entryId === activeId) ?? null)),
    [activeId, order],
  );
  const activeRank = useMemo(
    () => (activeId === null ? 0 : order.findIndex(item => item.entryId === activeId) + 1),
    [activeId, order],
  );

  const handleReorder = useCallback(
    async (newOrder: DashboardTopFiveItem[]) => {
      if (isReadOnly) {
        return;
      }
      if (!newOrder.length) {
        return;
      }

      const response = await fetch('/api/dashboard/reorder-favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          order: newOrder.map(item => item.entryId),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder favorites');
      }
    },
    [category, isReadOnly],
  );

  const handleMobileMove = useCallback(
    async (entryId: number, direction: -1 | 1) => {
      const currentIndex = order.findIndex(item => item.entryId === entryId);
      if (currentIndex === -1) {
        return;
      }
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= order.length) {
        return;
      }

      const prevOrder = order;
      const nextOrder = arrayMove(order, currentIndex, nextIndex);
      setOrder(nextOrder);
      setHasLocalReorder(true);

      try {
        await handleReorder(nextOrder);
      } catch {
        // Keep local order even if persistence fails; user intent should stay visible on mobile.
        if (prevOrder.length > 0) {
          toast.error('Saved locally. Server sync failed, try again later.');
        }
      }
    },
    [handleReorder, order],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndPayload) => {
      setActiveId(null);
      if (event.canceled) {
        return;
      }

      if (!isSortableOperation(event.operation) || !event.operation.source) {
        return;
      }

      const oldIndex = event.operation.source.initialIndex;
      const newIndex = event.operation.source.index;
      if (oldIndex === newIndex) {
        return;
      }

      const prevOrder = order;
      const nextOrder = arrayMove(order, oldIndex, newIndex);
      setOrder(nextOrder);
      setHasLocalReorder(true);

      try {
        await handleReorder(nextOrder);
      } catch {
        setOrder(prevOrder);
        setHasLocalReorder(false);
        toast.error('Unable to save the new order. Please try again.');
      }
    },
    [handleReorder, order],
  );

  const handleDragStart = useCallback((event: DragStartPayload) => {
    const sourceId = normalizeEntryId(event.operation.source?.id);
    if (sourceId !== null) {
      setActiveId(sourceId);
    }
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }

    const measureHeights = () => {
      const cards = Array.from(grid.children) as HTMLElement[];
      if (!cards.length) {
        setCollapsedHeight(null);
        setExpandedHeight(null);
        return;
      }

      const firstRowTop = cards[0].offsetTop;
      const secondRowCard = cards.find(card => card.offsetTop > firstRowTop);
      setExpandedHeight(grid.scrollHeight);

      if (!secondRowCard) {
        setCollapsedHeight(null);
        return;
      }

      const nextRowHalfVisible = secondRowCard.offsetTop + secondRowCard.offsetHeight / 2;
      setCollapsedHeight(nextRowHalfVisible);
    };

    const measureTimer = window.setTimeout(() => {
      measureHeights();
    }, 0);

    const resizeObserver = new ResizeObserver(() => {
      measureHeights();
    });
    resizeObserver.observe(grid);
    for (const child of Array.from(grid.children)) {
      resizeObserver.observe(child);
    }

    return () => {
      window.clearTimeout(measureTimer);
      resizeObserver.disconnect();
    };
  }, [orderKey]);

  const canCollapse = isMobile ? order.length > 1 : collapsedHeight !== null;
  const gridMaxHeight = isExpanded ? expandedHeight : collapsedHeight;
  const mobileCollapsedFallback = 360;
  const mobileCollapsedMeasuredMaxHeight =
    isMobile && !isExpanded && gridMaxHeight ? Math.max(280, gridMaxHeight - 120) : gridMaxHeight;
  const collapsedOverlayClass =
    canCollapse && !isExpanded
      ? 'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-16 after:bg-gradient-to-t after:from-background/95 after:to-transparent'
      : '';

  if (!order.length) {
    return (
      <section className="space-y-5">
        <DashboardSectionHeader
          eyebrow="Your favorites"
          title="The titles you always want close by."
        />
        <div className="rounded-2xl border border-dashed border-muted/60 p-6 text-center text-sm text-muted-foreground">
          No favorites yet.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 py-1 md:py-2">
      <DashboardSectionHeader
        eyebrow="Your favorites"
        title="The titles you always want close by."
        rightSlot={
          canCollapse ? (
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/90 transition-colors hover:bg-background"
            >
              {isExpanded ? 'Show less' : 'See all'}
            </button>
          ) : undefined
        }
      />

      {isMobile ? (
        <div
          className={`${DASH_RADIUS_SECTION} ${DASH_BORDER} ${DASH_SURFACE_SECTION} ${DASH_PADDING_STANDARD} ${DASH_PADDING_LARGE} shadow-sm`}
        >
          <DashboardSectionHeader
            eyebrow={
              isReadOnly
                ? 'Favorite Highlights'
                : isMobile
                  ? 'Reorder Controls'
                  : 'Drag And Reorder'
            }
            title={isReadOnly ? 'Favorite highlights' : 'Reorder your favorites'}
            className="mb-4"
          />
          <div
            className={[
              'ease-snappy relative overflow-hidden transition-[max-height] duration-300',
              collapsedOverlayClass,
            ].join(' ')}
            style={
              mobileCollapsedMeasuredMaxHeight
                ? { maxHeight: `${mobileCollapsedMeasuredMaxHeight}px` }
                : isMobile && !isExpanded && canCollapse
                  ? { maxHeight: `${mobileCollapsedFallback}px` }
                  : undefined
            }
          >
            <div
              ref={gridRef}
              className="relative z-0 grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
            >
              {order.map((item, index) => (
                <MobileFavoriteCard
                  key={item.entryId}
                  item={item}
                  rank={index + 1}
                  canMoveUp={index > 0}
                  canMoveDown={index < order.length - 1}
                  onMoveUp={() => void handleMobileMove(item.entryId, -1)}
                  onMoveDown={() => void handleMobileMove(item.entryId, 1)}
                  isReadOnly={isReadOnly}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <DragDropProvider
          sensors={isReadOnly ? [] : [PointerSensor]}
          onDragStart={isReadOnly ? undefined : handleDragStart}
          onDragEnd={isReadOnly ? undefined : handleDragEnd}
        >
          <div
            className={`${DASH_RADIUS_SECTION} ${DASH_BORDER} ${DASH_SURFACE_SECTION} ${DASH_PADDING_STANDARD} ${DASH_PADDING_LARGE} shadow-sm`}
          >
            <DashboardSectionHeader
              eyebrow={isReadOnly ? 'Favorite Highlights' : 'Drag And Reorder'}
              title={isReadOnly ? 'Favorite highlights' : 'Reorder your favorites'}
              className="mb-4"
            />
            <div
              className={[
                'ease-snappy relative overflow-hidden transition-[max-height] duration-300',
                collapsedOverlayClass,
              ].join(' ')}
              style={gridMaxHeight ? { maxHeight: `${gridMaxHeight}px` } : undefined}
            >
              <div
                ref={gridRef}
                className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
              >
                {order.map((item, index) => (
                  <SortableFavoriteCard
                    key={item.entryId}
                    item={item}
                    rank={index + 1}
                    index={index}
                    isMobile={false}
                    canMoveUp={false}
                    canMoveDown={false}
                    onMoveUp={() => {}}
                    onMoveDown={() => {}}
                    isReadOnly={isReadOnly}
                  />
                ))}
              </div>
            </div>
          </div>
          {!isReadOnly ? (
            <DragOverlay
              dropAnimation={{
                duration: 260,
                easing: 'cubic-bezier(0.18, 0.9, 0.22, 1)',
              }}
            >
              {activeItem ? <OverlayFavoriteCard item={activeItem} rank={activeRank} /> : null}
            </DragOverlay>
          ) : null}
        </DragDropProvider>
      )}
    </section>
  );
}
