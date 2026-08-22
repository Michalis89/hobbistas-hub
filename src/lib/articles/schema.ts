import type { AnyExtension, Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { Figure } from './extensions/figure';
import { MediaCard } from './extensions/mediaCard';

/**
 * The single definition of what an article document may contain.
 *
 * Every consumer builds from this list: the editor, the HTML -> JSON migration
 * script, and any server-side conversion. Adding a node or mark in one place
 * and not the others is what made the toolbar offer formatting that the
 * sanitizer silently discarded, so there is deliberately only one list.
 *
 * The renderer keeps its own explicit node/mark mapping (see
 * `ArticleRenderer`) rather than importing these extensions, so that unknown
 * node types are dropped instead of rendered.
 */

export const ARTICLE_HEADING_LEVELS = [1, 2, 3] as const;

export const ARTICLE_TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

export type ArticleTextAlignment = (typeof ARTICLE_TEXT_ALIGNMENTS)[number];

export const ARTICLE_LINK_OPTIONS = {
  openOnClick: false,
  HTMLAttributes: {
    class: 'text-primary underline hover:text-accent',
  },
} as const;

export const ARTICLE_IMAGE_OPTIONS = {
  HTMLAttributes: {
    class: 'rounded-lg max-w-full h-auto my-4',
    loading: 'lazy',
    decoding: 'async',
  },
} as const;

type BuildArticleExtensionsOptions = {
  /**
   * Replaces StarterKit's plain code block. The editor passes
   * CodeBlockLowlight for syntax highlighting; both register the same
   * `codeBlock` node name, so documents stay compatible either way.
   */
  codeBlock?: AnyExtension | null;
  /**
   * Replaces the default media card. The editor passes a variant carrying a
   * React node view; keeping that out of here means this module stays free of
   * React and safe to import from server code.
   */
  mediaCard?: AnyExtension | null;
  /** Editor-only extensions such as the placeholder. */
  extra?: Extensions;
};

export function buildArticleExtensions({
  codeBlock = null,
  mediaCard = null,
  extra = [],
}: BuildArticleExtensionsOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...ARTICLE_HEADING_LEVELS] },
      link: false,
      underline: false,
      ...(codeBlock ? { codeBlock: false as const } : {}),
    }),
    Underline,
    Link.configure(ARTICLE_LINK_OPTIONS),
    Image.configure(ARTICLE_IMAGE_OPTIONS),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    // `image` stays registered for documents written before figures existed.
    Figure,
    mediaCard ?? MediaCard,
    ...(codeBlock ? [codeBlock] : []),
    ...extra,
  ];
}

/** Schema used for parsing and validation, without editor-only extensions. */
export const articleSchemaExtensions = buildArticleExtensions();
