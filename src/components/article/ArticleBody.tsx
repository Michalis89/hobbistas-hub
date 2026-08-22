import { ArticleContent } from './ArticleContent';
import { ArticleRenderer, isArticleDoc, type ArticleDocNode } from './ArticleRenderer';

type ArticleBodyProps = {
  /** TipTap JSON. Preferred when present. */
  contentRich: unknown;
  /** Sanitized HTML. The fallback for articles not yet migrated. */
  contentHtml: string;
  className?: string;
};

/**
 * Parses a stored `content_rich` value, which may be a JSON object or a JSON
 * string depending on how it was written.
 */
export function parseArticleDoc(value: unknown): ArticleDocNode | null {
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return null;
    }
    try {
      return parseArticleDoc(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return isArticleDoc(value) ? value : null;
}

/**
 * Dual-read article body.
 *
 * Rich JSON is the source of truth once an article has been migrated, but
 * `content_html` is never deleted, so anything not migrated keeps rendering
 * exactly as before. This is what makes the migration reversible.
 */
export function ArticleBody({ contentRich, contentHtml, className }: ArticleBodyProps) {
  const doc = parseArticleDoc(contentRich);

  if (doc) {
    return <ArticleRenderer doc={doc} className={className} />;
  }

  if (!contentHtml) {
    return null;
  }

  return <ArticleContent html={contentHtml} className={className} />;
}
