import { z } from 'zod';

/**
 * Allowlist of node and mark types an article document may contain.
 *
 * These mirror the schema built in src/lib/articles/schema.ts. They are
 * duplicated as plain literals so API routes do not have to bundle the whole
 * TipTap extension set; src/lib/articles/__tests__/schema.test.ts asserts the
 * two stay identical.
 */
const ALLOWED_NODE_TYPES = new Set([
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
]);

const ALLOWED_MARK_TYPES = new Set(['bold', 'code', 'italic', 'link', 'strike', 'underline']);

export const ARTICLE_ALLOWED_NODE_TYPES = ALLOWED_NODE_TYPES;
export const ARTICLE_ALLOWED_MARK_TYPES = ALLOWED_MARK_TYPES;

const TipTapMarkSchema = z.object({
  type: z.string().refine(t => ALLOWED_MARK_TYPES.has(t), {
    message: 'Invalid mark type',
  }),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const BaseTipTapNodeSchema = z.object({
  type: z.string().refine(t => ALLOWED_NODE_TYPES.has(t), {
    message: 'Invalid node type',
  }),
  text: z.string().optional(),
  marks: z.array(TipTapMarkSchema).optional(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

type TipTapNode = z.infer<typeof BaseTipTapNodeSchema> & {
  content?: TipTapNode[];
};

const MAX_DEPTH = 20;

function validateTipTapNode(node: unknown, depth = 0): node is TipTapNode {
  if (depth > MAX_DEPTH) {
    return false;
  }

  const baseResult = BaseTipTapNodeSchema.safeParse(node);
  if (!baseResult.success) {
    return false;
  }

  const typedNode = node as Record<string, unknown>;
  if ('content' in typedNode && Array.isArray(typedNode.content)) {
    return typedNode.content.every(child => validateTipTapNode(child, depth + 1));
  }

  return true;
}

const TipTapDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.unknown()).optional(),
});

export type TipTapValidationResult = {
  isValid: boolean;
  error?: string;
};

/**
 * Validates TipTap JSON content structure.
 *
 * @param content - The content_rich field value (string or object)
 * @returns Validation result with isValid flag and optional error message
 */
export function validateTipTapContent(content: unknown): TipTapValidationResult {
  if (content === null || content === undefined) {
    return { isValid: true };
  }

  let parsed: unknown;

  if (typeof content === 'string') {
    if (content.trim() === '') {
      return { isValid: true };
    }
    try {
      parsed = JSON.parse(content);
    } catch {
      return { isValid: false, error: 'Invalid JSON in content_rich' };
    }
  } else {
    parsed = content;
  }

  const docResult = TipTapDocumentSchema.safeParse(parsed);
  if (!docResult.success) {
    return { isValid: false, error: 'Invalid TipTap document structure' };
  }

  const doc = parsed as { content?: unknown[] };
  if (doc.content && Array.isArray(doc.content)) {
    for (const node of doc.content) {
      if (!validateTipTapNode(node)) {
        return { isValid: false, error: 'Invalid node in TipTap content' };
      }
    }
  }

  return { isValid: true };
}
