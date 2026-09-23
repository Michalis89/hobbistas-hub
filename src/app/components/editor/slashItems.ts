import type { Editor, Range } from '@tiptap/core';

export type SlashActionContext = {
  editor: Editor;
  range: Range;
  /** Opens the image insert flow, since a file picker cannot run from a command. */
  openImagePicker: () => void;
  /** Opens the media search dialog for embedding a tracked item. */
  openMediaPicker: () => void;
};

export type SlashItem = {
  id: string;
  title: string;
  hint: string;
  /** Extra terms that should match this item, beyond its title. */
  keywords: string[];
  run: (context: SlashActionContext) => void;
};

/** Removes the "/query" text before running the command. */
const clearTrigger = ({ editor, range }: SlashActionContext) =>
  editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'heading2',
    title: 'Heading',
    hint: 'Section title',
    keywords: ['h2', 'title', 'section'],
    run: context => clearTrigger(context).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'heading3',
    title: 'Subheading',
    hint: 'Smaller title',
    keywords: ['h3', 'subtitle'],
    run: context => clearTrigger(context).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'bulletList',
    title: 'Bulleted list',
    hint: 'Unordered list',
    keywords: ['ul', 'bullet', 'unordered'],
    run: context => clearTrigger(context).toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    title: 'Numbered list',
    hint: 'Ordered list',
    keywords: ['ol', 'number', 'ordered'],
    run: context => clearTrigger(context).toggleOrderedList().run(),
  },
  {
    id: 'blockquote',
    title: 'Quote',
    hint: 'Pull out a passage',
    keywords: ['blockquote', 'citation'],
    run: context => clearTrigger(context).toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    title: 'Code block',
    hint: 'Monospaced block',
    keywords: ['pre', 'snippet'],
    run: context => clearTrigger(context).toggleCodeBlock().run(),
  },
  {
    id: 'divider',
    title: 'Divider',
    hint: 'Horizontal rule',
    keywords: ['hr', 'separator', 'rule'],
    run: context => clearTrigger(context).setHorizontalRule().run(),
  },
  {
    id: 'image',
    title: 'Image',
    hint: 'Upload or paste a URL',
    keywords: ['photo', 'picture', 'figure', 'upload'],
    run: context => {
      clearTrigger(context).run();
      context.openImagePicker();
    },
  },
  {
    id: 'mediaCard',
    title: 'Media card',
    hint: 'Embed a tracked title',
    keywords: ['game', 'movie', 'anime', 'book', 'library', 'embed'],
    run: context => {
      clearTrigger(context).run();
      context.openMediaPicker();
    },
  },
];

/**
 * Filters the command list for the text typed after the slash.
 *
 * Titles are matched by prefix first so that typing "h" puts Heading above
 * anything that merely contains an "h".
 */
export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return items;
  }

  const matches = items.filter(item => {
    const haystack = [item.title, ...item.keywords].map(value => value.toLowerCase());
    return haystack.some(value => value.includes(normalized));
  });

  return matches.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(normalized) ? 0 : 1;
    const bStarts = b.title.toLowerCase().startsWith(normalized) ? 0 : 1;
    return aStarts - bStarts;
  });
}
