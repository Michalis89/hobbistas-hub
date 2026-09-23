import type { CSSProperties, ReactNode } from 'react';
import { renderJSONContentToReactElement } from '@tiptap/static-renderer/json/react';
import { cn } from '@/lib/utils';
import { ARTICLE_PROSE } from './typography';
import { ARTICLE_TEXT_ALIGNMENTS } from '@/lib/articles/schema';
import { FIGURE_ALIGNMENTS } from '@/lib/articles/extensions/figure';
import MediaCardEmbed from './MediaCardEmbed.client';
import { createHeadingIdFactory } from '@/lib/articles/headings';

export type ArticleDocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ArticleDocNode[];
  marks?: ReadonlyArray<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

type NodeRenderProps = {
  node: ArticleDocNode;
  children?: ReactNode;
};

type MarkRenderProps = {
  mark: { type: string; attrs?: Record<string, unknown> };
  children?: ReactNode;
};

const attrString = (node: ArticleDocNode, key: string): string | undefined => {
  const value = node.attrs?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const attrNumber = (node: ArticleDocNode, key: string): number | undefined => {
  const value = node.attrs?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
};

/** Matches the sanitizer's rule: only absolute https URLs are rendered. */
const isHttpsUrl = (value: string | undefined): value is string => {
  if (!value || value.trim().startsWith('//')) {
    return false;
  }
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Categories that can appear in a media card href. Guards the path. */
const EMBEDDABLE_CATEGORIES = new Set(['anime', 'manga', 'movies', 'tv', 'books', 'games']);

const alignmentStyle = (node: ArticleDocNode): CSSProperties | undefined => {
  const align = attrString(node, 'textAlign');
  return align && (ARTICLE_TEXT_ALIGNMENTS as readonly string[]).includes(align)
    ? { textAlign: align as CSSProperties['textAlign'] }
    : undefined;
};

const collectText = (node: ArticleDocNode): string => {
  if (typeof node.text === 'string') {
    return node.text;
  }
  return (node.content ?? []).map(collectText).join('');
};

/**
 * Renders a TipTap document to React on the server.
 *
 * Node and mark handlers are declared explicitly rather than derived from the
 * editor extensions: anything not listed here is dropped, so a document that
 * somehow contains an unexpected node cannot inject markup. This replaces
 * `dangerouslySetInnerHTML` for rich content.
 */
function createArticleRenderer() {
  // Shared with the table of contents so an anchor always resolves.
  const nextHeadingId = createHeadingIdFactory();
  const headingId = (node: ArticleDocNode): string => nextHeadingId(collectText(node));

  const nodeMapping = {
    doc: ({ children }: NodeRenderProps) => <>{children}</>,

    paragraph: ({ node, children }: NodeRenderProps) => (
      <p style={alignmentStyle(node)}>{children}</p>
    ),

    heading: ({ node, children }: NodeRenderProps) => {
      const level = attrNumber(node, 'level') ?? 2;
      const safeLevel = level >= 1 && level <= 3 ? level : 2;
      const Tag = `h${safeLevel}` as 'h1' | 'h2' | 'h3';
      return (
        <Tag id={headingId(node)} style={alignmentStyle(node)}>
          {children}
        </Tag>
      );
    },

    text: ({ node }: NodeRenderProps) => <>{node.text ?? ''}</>,

    hardBreak: () => <br />,

    horizontalRule: () => <hr />,

    blockquote: ({ children }: NodeRenderProps) => <blockquote>{children}</blockquote>,

    bulletList: ({ children }: NodeRenderProps) => <ul>{children}</ul>,

    orderedList: ({ node, children }: NodeRenderProps) => {
      const start = attrNumber(node, 'start');
      return <ol start={start && start !== 1 ? start : undefined}>{children}</ol>;
    },

    listItem: ({ children }: NodeRenderProps) => <li>{children}</li>,

    codeBlock: ({ node, children }: NodeRenderProps) => {
      const language = attrString(node, 'language');
      return (
        <pre>
          <code className={language ? `language-${language}` : undefined}>{children}</code>
        </pre>
      );
    },

    figure: ({ node, children }: NodeRenderProps) => {
      const src = attrString(node, 'src');
      if (!isHttpsUrl(src)) {
        return null;
      }
      const align = attrString(node, 'align');
      const safeAlign = (FIGURE_ALIGNMENTS as readonly string[]).includes(align ?? '')
        ? align
        : 'inline';
      const hasCaption = (node.content ?? []).length > 0;

      return (
        <figure data-align={safeAlign}>
          {/* eslint-disable-next-line @next/next/no-img-element -- author images have no known dimensions */}
          <img
            src={src}
            alt={attrString(node, 'alt') ?? ''}
            loading="lazy"
            decoding="async"
          />
          {hasCaption && <figcaption>{children}</figcaption>}
        </figure>
      );
    },

    mediaCard: ({ node }: NodeRenderProps) => {
      const mediaId = attrNumber(node, 'mediaId');
      const category = attrString(node, 'category');
      const slug = attrString(node, 'slug');
      const title = attrString(node, 'title');

      if (!mediaId || !category || !title || !EMBEDDABLE_CATEGORIES.has(category)) {
        return null;
      }

      return (
        <MediaCardEmbed
          mediaId={mediaId}
          category={category}
          slug={slug}
          title={title}
          cover={attrString(node, 'cover')}
          year={attrString(node, 'year')}
        />
      );
    },

    image: ({ node }: NodeRenderProps) => {
      const src = attrString(node, 'src');
      if (!isHttpsUrl(src)) {
        return null;
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element -- author images have no known dimensions
        <img
          src={src}
          alt={attrString(node, 'alt') ?? ''}
          title={attrString(node, 'title')}
          width={attrNumber(node, 'width')}
          height={attrNumber(node, 'height')}
          loading="lazy"
          decoding="async"
        />
      );
    },
  };

  const markMapping = {
    bold: ({ children }: MarkRenderProps) => <strong>{children}</strong>,
    italic: ({ children }: MarkRenderProps) => <em>{children}</em>,
    underline: ({ children }: MarkRenderProps) => <u>{children}</u>,
    strike: ({ children }: MarkRenderProps) => <s>{children}</s>,
    code: ({ children }: MarkRenderProps) => <code>{children}</code>,
    link: ({ mark, children }: MarkRenderProps) => {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : undefined;
      if (!isHttpsUrl(href)) {
        return <>{children}</>;
      }
      return (
        <a href={href} rel="noopener noreferrer" target="_blank">
          {children}
        </a>
      );
    },
  };

  return renderJSONContentToReactElement({
    nodeMapping,
    markMapping,
    // Unknown structure is discarded, but its text is preserved.
    unhandledNode: ({ children }: NodeRenderProps) => <>{children}</>,
    unhandledMark: ({ children }: MarkRenderProps) => <>{children}</>,
  } as Parameters<typeof renderJSONContentToReactElement>[0]);
}

/** True when the value is a TipTap document worth rendering. */
export function isArticleDoc(value: unknown): value is ArticleDocNode {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as ArticleDocNode;
  return candidate.type === 'doc' && Array.isArray(candidate.content);
}

type ArticleRendererProps = {
  doc: ArticleDocNode;
  className?: string;
};

export function ArticleRenderer({ doc, className }: ArticleRendererProps) {
  const render = createArticleRenderer();

  return (
    <section className={cn(ARTICLE_PROSE, className)}>
      {render({ content: doc } as Parameters<ReturnType<typeof createArticleRenderer>>[0])}
    </section>
  );
}
