import type { JSONContent } from '@tiptap/core';
import type { ArticleCategory, ArticleStatus, ArticleTopic } from '@/types/database';
import { sanitizeHtmlContent } from '@/utils/security/sanitizeHtml';
import { stripEmptyParagraphs, type ContentType } from '@/lib/articles/composerConfig';

export type ComposerDraft = {
  type: ContentType;
  category: ArticleCategory | '';
  topic: ArticleTopic;
  title: string;
  description: string;
  coverImage: string;
  contentHtml: string;
  contentRich: JSONContent | null;
  tags: string;
  score: string;
  mediaId: number | null;
  linkedMediaTitle: string | null;
  metaTitle: string;
  metaDescription: string;
  status: ArticleStatus;
  /** Local datetime-local value; only meaningful while status is 'scheduled'. */
  scheduledFor: string;
};

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const AUTOSAVE_DELAY_MS = 1500;

export function emptyDraft(type: ContentType = 'article'): ComposerDraft {
  return {
    type,
    category: '',
    topic: type === 'review' ? 'reviews' : 'articles',
    title: '',
    description: '',
    coverImage: '',
    contentHtml: '',
    contentRich: null,
    tags: '',
    score: '',
    mediaId: null,
    linkedMediaTitle: null,
    metaTitle: '',
    metaDescription: '',
    status: 'draft',
    scheduledFor: '',
  };
}

type ArticlePayload = Record<string, unknown>;

export function buildArticlePayload(draft: ComposerDraft): ArticlePayload {
  const rawHtml = (draft.contentHtml || '').trim();
  // Blank paragraphs are how an author spaces their text, so they are kept.
  // Stripping is only used to decide whether the document is effectively empty.
  const hasContent = stripEmptyParagraphs(rawHtml).trim() !== '';

  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    category: draft.category,
    topic: draft.type === 'review' ? 'reviews' : draft.topic,
    tags: draft.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean),
    cover_image: draft.coverImage.trim() || null,
    content_html: hasContent ? sanitizeHtmlContent(rawHtml).trim() || null : null,
    content_rich: draft.contentRich,
    meta_title: draft.metaTitle.trim() || null,
    meta_description: draft.metaDescription.trim() || null,
    score: draft.type === 'review' && draft.score !== '' ? Number.parseFloat(draft.score) : null,
    media_id: draft.mediaId,
    // Only carried while the article is (or is becoming) scheduled; the API
    // clears it on any other status.
    scheduled_for: fromLocalDateTimeInput(draft.scheduledFor),
  };
}

/** Minimum a draft needs before it is worth persisting. */
export function isSaveable(draft: ComposerDraft): boolean {
  return draft.title.trim().length > 0 && draft.category !== '';
}


type ArticleRowLike = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  topic?: string | null;
  tags?: string[] | null;
  cover_image?: string | null;
  content_html?: string | null;
  content_rich?: unknown;
  meta_title?: string | null;
  meta_description?: string | null;
  status?: string | null;
  scheduled_for?: string | null;
  score?: number | null;
  media_id?: number | null;
};

/** Builds the composer state from a stored article row. */
export function draftFromRow(row: ArticleRowLike): ComposerDraft {
  const isReview = row.topic === 'reviews';

  return {
    type: isReview ? 'review' : 'article',
    category: (row.category ?? '') as ComposerDraft['category'],
    topic: (row.topic ?? 'articles') as ArticleTopic,
    title: row.title ?? '',
    description: row.description ?? '',
    coverImage: row.cover_image ?? '',
    contentHtml: row.content_html ?? '',
    contentRich: (row.content_rich as JSONContent | null) ?? null,
    tags: (row.tags ?? []).join(', '),
    score: row.score != null ? String(row.score) : '',
    mediaId: row.media_id ?? null,
    // Resolved lazily by the media field; the row only stores the id.
    linkedMediaTitle: null,
    metaTitle: row.meta_title ?? '',
    metaDescription: row.meta_description ?? '',
    status: (row.status ?? 'draft') as ArticleStatus,
    scheduledFor: toLocalDateTimeInput(row.scheduled_for),
  };
}

/**
 * Converts a stored timestamp into the value an `<input type="datetime-local">`
 * expects, which is local time without a zone suffix.
 */
export function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Converts the datetime-local value back into an absolute ISO timestamp. */
export function fromLocalDateTimeInput(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
