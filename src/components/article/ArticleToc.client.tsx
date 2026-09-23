'use client';

import { useEffect, useState } from 'react';
import type { TocEntry } from '@/lib/articles/toc';

type ArticleTocProps = {
  readonly entries: TocEntry[];
};

/** Below this many sections a table of contents is more noise than help. */
const MIN_ENTRIES = 3;

export default function ArticleToc({ entries }: ArticleTocProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length < MIN_ENTRIES) {
      return undefined;
    }

    const headings = entries
      .map(entry => document.getElementById(entry.id))
      .filter((element): element is HTMLElement => element !== null);

    if (headings.length === 0) {
      return undefined;
    }

    // The top band keeps the highlight on the section being read rather than
    // the one just scrolled past.
    const observer = new IntersectionObserver(
      observed => {
        const visible = observed
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );

    headings.forEach(heading => observer.observe(heading));
    return () => observer.disconnect();
  }, [entries]);

  if (entries.length < MIN_ENTRIES) {
    return null;
  }

  return (
    <nav
      aria-label="On this page"
      className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto xl:block"
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-1 border-l border-border">
        {entries.map(entry => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              aria-current={activeId === entry.id ? 'location' : undefined}
              className={`-ml-px block border-l-2 py-1 text-sm leading-snug transition-colors ${
                entry.level === 3 ? 'pl-6' : 'pl-4'
              } ${
                activeId === entry.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
