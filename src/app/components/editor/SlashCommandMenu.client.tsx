'use client';

import { useEffect, useRef } from 'react';
import type { SlashItem } from './slashItems';

type SlashCommandMenuProps = {
  readonly items: SlashItem[];
  readonly selectedIndex: number;
  readonly clientRect: DOMRect | null;
  readonly onSelect: (item: SlashItem) => void;
};

const MENU_WIDTH = 280;
const MENU_MAX_HEIGHT = 320;
const GAP = 8;

export default function SlashCommandMenu({
  items,
  selectedIndex,
  clientRect,
  onSelect,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the highlighted row in view when navigating with the keyboard.
  useEffect(() => {
    listRef.current?.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!clientRect || items.length === 0) {
    return null;
  }

  // Flip above the caret when there is not enough room below.
  const spaceBelow = window.innerHeight - clientRect.bottom;
  const shouldFlip = spaceBelow < MENU_MAX_HEIGHT && clientRect.top > spaceBelow;
  const left = Math.min(clientRect.left, window.innerWidth - MENU_WIDTH - GAP);

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label="Insert block"
      className="fixed z-50 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-2xl"
      style={{
        width: MENU_WIDTH,
        maxHeight: MENU_MAX_HEIGHT,
        left: Math.max(GAP, left),
        ...(shouldFlip
          ? { bottom: window.innerHeight - clientRect.top + GAP }
          : { top: clientRect.bottom + GAP }),
      }}
    >
      {items.map((item, index) => (
        <li key={item.id}>
          <button
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            // The editor keeps focus; mousedown would blur it before the click.
            onMouseDown={event => {
              event.preventDefault();
              onSelect(item);
            }}
            className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors ${
              index === selectedIndex ? 'bg-primary/12 text-foreground' : 'hover:bg-surface-hover'
            }`}
          >
            <span className="text-sm font-medium text-foreground">{item.title}</span>
            <span className="text-xs text-muted-foreground">{item.hint}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
