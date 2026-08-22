'use client';

import { useCallback, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { uploadArticleBodyImage } from '@/lib/media/uploadArticleImage';

/** Mirrors the allowlist enforced by /api/uploads/article-image. */
export const EDITOR_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export const EDITOR_IMAGE_ACCEPT = EDITOR_IMAGE_MIME_TYPES.join(',');

export function isEditorImageFile(file: File): boolean {
  return (EDITOR_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}

/**
 * Derives a readable alt fallback from the filename so uploaded images are not
 * silently published without any alternative text.
 */
export function deriveAltFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type UseEditorImageUpload = {
  insertFiles: (files: readonly File[]) => Promise<void>;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
};

/**
 * Uploads dropped, pasted or picked images and inserts them at the cursor.
 *
 * Uploads run sequentially so that multiple images keep their drop order in
 * the document.
 */
export function useEditorImageUpload(editor: Editor | null): UseEditorImageUpload {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  const insertFiles = useCallback(
    async (files: readonly File[]) => {
      const images = files.filter(isEditorImageFile);

      if (!editor || images.length === 0 || inFlightRef.current) {
        if (files.length > 0 && images.length === 0) {
          setError('Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.');
        }
        return;
      }

      inFlightRef.current = true;
      setIsUploading(true);
      setError(null);

      try {
        for (const file of images) {
          const url = await uploadArticleBodyImage(file);
          editor
            .chain()
            .focus()
            .setFigure({ src: url, alt: deriveAltFromFilename(file.name) })
            .run();
        }
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : 'Image upload failed. Try again.',
        );
      } finally {
        inFlightRef.current = false;
        setIsUploading(false);
      }
    },
    [editor],
  );

  return { insertFiles, isUploading, error, clearError };
}
