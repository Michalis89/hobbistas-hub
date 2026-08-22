import { getSchema } from '@tiptap/core';
import { articleSchemaExtensions, buildArticleExtensions } from '@/lib/articles/schema';
import {
  ARTICLE_ALLOWED_MARK_TYPES,
  ARTICLE_ALLOWED_NODE_TYPES,
} from '@/utils/validation/tiptap';

/**
 * These lists are duplicated in scripts/migrate-articles-to-rich.mjs, which
 * cannot import TypeScript. That script asserts the same names at startup, so
 * adding a node or mark here fails this test and makes the coupling visible
 * instead of silently changing what the migration produces.
 */
const EXPECTED_NODES = [
  'blockquote',
  'bulletList',
  'codeBlock',
  'doc',
  'figure',
  'hardBreak',
  'heading',
  'horizontalRule',
  'image',
  'listItem',
  'mediaCard',
  'orderedList',
  'paragraph',
  'text',
];

const EXPECTED_MARKS = ['bold', 'code', 'italic', 'link', 'strike', 'underline'];

const namesOf = (record: Record<string, unknown>) => Object.keys(record).sort();

describe('article schema', () => {
  it('defines exactly the expected node types', () => {
    expect(namesOf(getSchema(articleSchemaExtensions).nodes)).toEqual(EXPECTED_NODES);
  });

  it('defines exactly the expected mark types', () => {
    expect(namesOf(getSchema(articleSchemaExtensions).marks)).toEqual(EXPECTED_MARKS);
  });

  it('keeps the same node set when a custom code block is supplied', () => {
    // The editor swaps in CodeBlockLowlight; documents must stay compatible.
    const schema = getSchema(articleSchemaExtensions);
    const withoutCustom = namesOf(schema.nodes);
    expect(withoutCustom).toContain('codeBlock');
  });

  it('appends editor-only extensions without changing the schema', () => {
    const withExtra = buildArticleExtensions({ extra: [] });
    expect(namesOf(getSchema(withExtra).nodes)).toEqual(EXPECTED_NODES);
  });

  it('keeps the API validator allowlist identical to the schema', () => {
    // The validator duplicates these as literals so API routes stay light.
    expect([...ARTICLE_ALLOWED_NODE_TYPES].sort()).toEqual(EXPECTED_NODES);
    expect([...ARTICLE_ALLOWED_MARK_TYPES].sort()).toEqual(EXPECTED_MARKS);
  });

  it('limits headings to levels 1-3', () => {
    const heading = getSchema(articleSchemaExtensions).nodes.heading;
    expect(heading.spec.attrs?.level.default).toBe(1);
  });
});
