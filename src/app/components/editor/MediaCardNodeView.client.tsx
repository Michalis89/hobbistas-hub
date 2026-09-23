'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { LibraryBig } from 'lucide-react';
import { CoverThumbImage, THUMB_SIZES_SM } from '@/components/ui/cover-image';

/**
 * How an embedded media card looks while writing.
 *
 * The node serialises to an anchor so the sanitized HTML fallback keeps a
 * working link; without this view the author would see that bare link instead
 * of the card their readers get.
 */
export default function MediaCardNodeView({ node, selected }: NodeViewProps) {
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : 'Media item';
  const cover = typeof node.attrs.cover === 'string' ? node.attrs.cover : null;
  const category = typeof node.attrs.category === 'string' ? node.attrs.category : '';
  const year = typeof node.attrs.year === 'string' ? node.attrs.year : null;

  return (
    <NodeViewWrapper
      data-media-card-view
      className={`my-6 flex items-center gap-3 rounded-2xl border bg-card/70 p-3 transition-colors ${
        selected ? 'border-primary' : 'border-border'
      }`}
    >
      <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
        {cover ? (
          <CoverThumbImage src={cover} alt={title} sizes={THUMB_SIZES_SM} className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center">
            <LibraryBig size={15} className="text-muted-foreground" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1" contentEditable={false}>
        <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {category}
          {year ? ` · ${year}` : ''}
        </span>
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
      </span>

      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Embed
      </span>
    </NodeViewWrapper>
  );
}
