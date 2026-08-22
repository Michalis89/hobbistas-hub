'use client';

import { memo, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useLocale } from '@/context/LocaleContext';
import type { DiaryEntryDecrypted } from '@/lib/diary/types';
import { cn } from '@/lib/utils';

type DiaryEntryCardProps = {
  entry: DiaryEntryDecrypted;
  isActive: boolean;
  onSelect: (entryId: string) => void;
};

function DiaryEntryCardComponent({ entry, isActive, onSelect }: DiaryEntryCardProps) {
  const locale = useLocale();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    [locale],
  );

  return (
    <button type="button" className="w-full text-left" onClick={() => onSelect(entry.id)}>
      <Card
        className={cn(
          'transition-all duration-200 ease-out hover:shadow-md',
          isActive ? 'border-primary/60 shadow-sm' : 'border-border/80',
        )}
      >
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm text-muted-foreground">
              {dateFormatter.format(new Date(entry.entry_date))}
            </p>
            {entry.mood ? (
              <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize text-muted-foreground">
                {entry.mood}
              </span>
            ) : null}
          </div>
          <h3 className="line-clamp-1 text-2xl font-medium leading-8 text-foreground">
            {entry.title || 'Untitled reflection'}
          </h3>
          <p className="line-clamp-3 text-[17px] leading-8 text-muted-foreground">
            {entry.content || 'No content yet'}
          </p>
        </CardContent>
      </Card>
    </button>
  );
}

export const DiaryEntryCard = memo(DiaryEntryCardComponent);
