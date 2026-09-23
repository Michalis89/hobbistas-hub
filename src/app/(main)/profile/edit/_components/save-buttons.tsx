'use client';

import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SaveButtonsProps {
  saving: boolean;
  isDirty: boolean;
  /** The demo account cannot write, so saving is disabled rather than failing. */
  isDemo?: boolean;
  onCancel: () => void;
}

export function SaveButtons({ saving, isDirty, isDemo = false, onCancel }: SaveButtonsProps) {
  // The database refuses the write anyway; disabling here means nobody fills
  // the whole form in before finding that out.
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3 rounded-lg border bg-card/80 px-4 py-3 shadow-sm">
      {isDemo ? (
        <p className="mr-auto text-xs text-muted-foreground">
          The demo account cannot save profile changes.
        </p>
      ) : null}
      {/* Primary Button */}
      <Button
        type="submit"
        variant={'primary'}
        disabled={saving || !isDirty || isDemo}
        className="flex items-center gap-2"
      >
        <Save className="h-4 w-4" />
        <span>{saving ? 'Saving...' : 'Save'}</span>
      </Button>
      {/* Secondary Button */}
      <Button
        onClick={onCancel}
        disabled={saving}
        variant={'secondary'}
        className="flex items-center gap-2"
      >
        Cancel
      </Button>
    </div>
  );
}
