'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { MediaCategory } from './types';
import { CATEGORY_CONFIG } from './types';

interface CategoryStatsProps {
  category: MediaCategory;
  totalEntries: number;
  activeStatus: 'all' | 'planned' | 'current' | 'completed' | 'dropped';
  onStatusChange: (status: 'all' | 'planned' | 'current' | 'completed' | 'dropped') => void;
  counts: {
    planned: number;
    current: number;
    completed: number;
    dropped: number;
  };
}

type StatCard = {
  key: string;
  label: string;
  value: number;
  caption: string;
  filter: 'all' | 'planned' | 'current' | 'completed' | 'dropped';
};

export default function CategoryStats({
  category,
  totalEntries,
  activeStatus,
  onStatusChange,
  counts,
}: Readonly<CategoryStatsProps>) {
  const config = CATEGORY_CONFIG[category];
  const safeTotal = Math.max(totalEntries, 1);

  const cards: StatCard[] = [
    {
      key: 'entries',
      label: 'All',
      value: totalEntries,
      caption: 'Total entries',
      filter: 'all',
    },
    {
      key: 'planned',
      label: config.plannedLabel,
      value: counts.planned,
      caption: 'Queued',
      filter: 'planned',
    },
    {
      key: 'current',
      label: config.currentLabel,
      value: counts.current,
      caption: 'In progress',
      filter: 'current',
    },
    {
      key: 'completed',
      label: config.completedLabel,
      value: counts.completed,
      caption: 'Finished',
      filter: 'completed',
    },
    {
      key: 'dropped',
      label: config.droppedLabel,
      value: counts.dropped,
      caption: 'Paused',
      filter: 'dropped',
    },
  ];

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(card => (
        <Card
          key={card.key}
          role="button"
          tabIndex={0}
          onClick={() => onStatusChange(card.filter)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onStatusChange(card.filter);
            }
          }}
          className={`group cursor-pointer border transition duration-200 hover:shadow-lg ${
            activeStatus === card.filter
              ? 'border-primary/40 bg-primary/10 shadow-md shadow-primary/10'
              : 'border-border/70 bg-card/70'
          }`}
        >
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.caption}</p>
            <Progress
              value={Math.min(100, Math.round((card.value / safeTotal) * 100))}
              className="mt-3 h-1.5 bg-white/10"
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
