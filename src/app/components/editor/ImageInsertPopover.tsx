'use client';

import { useRef, useState } from 'react';
import { ImageIcon, Upload } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { EDITOR_IMAGE_ACCEPT } from './useEditorImageUpload';

type ImageInsertPopoverProps = {
  readonly onUploadFiles: (files: readonly File[]) => void;
  readonly onInsertUrl: (url: string, alt: string) => void;
  readonly isUploading: boolean;
  readonly error: string | null;
  readonly onClearError: () => void;
  /** Controlled by the editor so the slash command can open it too. */
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

/**
 * Replaces the old `window.prompt('Image URL:')` flow: authors can upload a
 * file directly, or paste a URL, and always get an alt text field.
 */
export default function ImageInsertPopover({
  onUploadFiles,
  onInsertUrl,
  isUploading,
  error,
  onClearError,
  open,
  onOpenChange,
}: ImageInsertPopoverProps) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setUrl('');
      setAlt('');
      onClearError();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) {
      onUploadFiles(files);
      onOpenChange(false);
    }
  };

  const handleInsertUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    onInsertUrl(trimmed, alt.trim());
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          iconOnly
          title="Insert image"
          aria-label="Insert image"
          className="min-h-11 min-w-11 rounded-[10px] border border-border bg-card text-foreground shadow-none transition-colors hover:border-primary hover:text-primary [&_svg]:size-[18px]"
        >
          {isUploading ? <Spinner className="size-[18px]" /> : <ImageIcon size={18} />}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 space-y-4">
        <div className="space-y-2">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            {isUploading ? 'Uploading...' : 'Upload image'}
          </Button>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, WebP, GIF or AVIF. You can also drag a file onto the editor or paste from the
            clipboard.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={EDITOR_IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground" htmlFor="editor-image-url">
            Image URL
          </label>
          <Input
            id="editor-image-url"
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="https://..."
          />
          <label className="text-xs font-medium text-foreground" htmlFor="editor-image-alt">
            Alt text
          </label>
          <Input
            id="editor-image-alt"
            value={alt}
            onChange={event => setAlt(event.target.value)}
            placeholder="Describes the image for screen readers"
          />
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!url.trim()}
            onClick={handleInsertUrl}
          >
            Insert
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
