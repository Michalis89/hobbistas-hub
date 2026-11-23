'use client';
import { useRef, useState } from 'react';
import { ImageIcon, Upload, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CoverThumbImage, DEFAULT_HERO_SIZES } from '@/components/ui/cover-image';
import { uploadSeriesCoverImage } from '@/lib/media/uploadArticleImage';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

/**
 * Cover image for a series: upload (same pipeline as article covers) or paste
 * an https URL. Works before the series exists, because uploads are not tied
 * to a series id; the URL is stored when the series is saved.
 */
export default function SeriesCoverField({
  value,
  onChange,
  onUploadingChange,
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploadingChange?.(busy);
  };

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change.
    event.target.value = '';
    if (!file) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onChange(await uploadSeriesCoverImage(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Cover upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const trimmed = value.trim();
  const showPreview = /^https:\/\/\S+$/i.test(trimmed);

  return (
    <fieldset className="space-y-3" aria-busy={uploading}>
      <legend className="text-sm font-medium">Cover image</legend>
      {showPreview ? (
        <div className="relative h-40 w-full overflow-hidden rounded-xl bg-muted">
          <CoverThumbImage
            src={trimmed}
            alt="Series cover preview"
            sizes={DEFAULT_HERO_SIZES}
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40"
          aria-hidden="true"
        >
          <ImageIcon size={22} className="text-muted-foreground" />
        </div>
      )}

      <Input
        type="url"
        value={value}
        onChange={event => {
          setError(null);
          onChange(event.target.value);
        }}
        placeholder="https://…"
        aria-label="Cover image URL"
        disabled={disabled || uploading}
      />
      {trimmed && !showPreview && (
        <p className="text-xs text-destructive">The cover URL must start with https://</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Spinner className="size-4" /> : <Upload size={16} />}
          {uploading ? 'Uploading…' : trimmed ? 'Replace cover' : 'Upload cover'}
        </Button>
        {trimmed && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || uploading}
            onClick={() => {
              setError(null);
              onChange('');
            }}
          >
            <X size={16} />
            Remove cover
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        data-testid="series-cover-file"
        onChange={handleFile}
      />
      {uploading && (
        <p role="status" className="text-xs text-muted-foreground">
          Uploading cover…
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
