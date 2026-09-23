import { slugify } from '@/utils/slugify';

/**
 * Produces stable, unique ids for the headings of a single document.
 *
 * The renderer and the table of contents both go through this, so an anchor in
 * the sidebar always matches the id actually rendered in the body. Call it once
 * per document: the returned function is stateful.
 */
export function createHeadingIdFactory(): (text: string) => string {
  const used = new Map<string, number>();

  return (text: string) => {
    const base = slugify(text) || 'section';
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };
}
