import { createHeadingIdFactory } from './headings';

export type TocEntry = {
  id: string;
  text: string;
  level: 2 | 3;
};

type DocNode = {
  type?: string;
  attrs?: Record<string, unknown> | null;
  content?: DocNode[] | null;
  text?: string | null;
};

const textOf = (node: DocNode): string => {
  if (typeof node.text === 'string') {
    return node.text;
  }
  return (node.content ?? []).map(textOf).join('');
};

/**
 * Builds the table of contents from a TipTap document.
 *
 * Walks only the top level: a heading nested inside a quote or a list item is
 * not a section of the article.
 */
export function tocFromDoc(doc: unknown): TocEntry[] {
  const root = doc as DocNode | null;
  if (!root || !Array.isArray(root.content)) {
    return [];
  }

  const nextId = createHeadingIdFactory();
  const entries: TocEntry[] = [];

  for (const node of root.content) {
    if (node?.type !== 'heading') {
      continue;
    }

    const level = Number(node.attrs?.level);
    const text = textOf(node).trim();

    // h1 is the article title; only h2/h3 are navigable sections.
    if (!text || (level !== 2 && level !== 3)) {
      continue;
    }

    entries.push({ id: nextId(text), text, level: level as 2 | 3 });
  }

  return entries;
}

const HEADING_WITH_ID = /<h([23])([^>]*\sid=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/h\1>/gi;

/**
 * Builds the table of contents from already-enriched legacy HTML.
 *
 * Reads the ids that are actually present in the markup rather than
 * regenerating them, so it cannot disagree with the rendered anchors.
 */
export function tocFromHtml(html: string): TocEntry[] {
  if (!html) {
    return [];
  }

  const entries: TocEntry[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(HEADING_WITH_ID)) {
    const level = Number(match[1]) as 2 | 3;
    const id = match[3];
    const text = match[4]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!id || !text || seen.has(id)) {
      continue;
    }

    seen.add(id);
    entries.push({ id, text, level });
  }

  return entries;
}
