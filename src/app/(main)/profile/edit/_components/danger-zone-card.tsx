'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DangerZoneCardProps {
  showDeleteConfirm: boolean;
  deleteConfirmText: string;
  deleting: boolean;
  /** Hidden for the shared demo account, which nobody should be able to delete. */
  isDemo?: boolean;
  onShowDeleteConfirm: () => void;
  onCancelDelete: () => void;
  onDeleteConfirmTextChange: (text: string) => void;
  onDeleteAccount: () => void;
}

export function DangerZoneCard({
  showDeleteConfirm,
  deleteConfirmText,
  deleting,
  isDemo = false,
  onShowDeleteConfirm,
  onCancelDelete,
  onDeleteConfirmTextChange,
  onDeleteAccount,
}: DangerZoneCardProps) {
  // `withApiRoute` refuses the request, but a shared account should not be
  // showing strangers a button that offers to delete it.
  if (isDemo) {
    return null;
  }

  return (
    <Card className="">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#ff453a]">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-foreground">
          Deleting your account is <strong>permanent</strong> and cannot be undone.
        </p>
        <p className="text-muted-foreground">This action will delete:</p>
        <ul className="mb-4 ml-4 list-disc space-y-1 text-muted-foreground">
          <li>All your personal data</li>
          <li>Your profile</li>
          <li>Guides you have written (if any)</li>
          <li>Your comments</li>
          <li>Your activity history</li>
        </ul>

        {!showDeleteConfirm ? (
          <Button
            onClick={onShowDeleteConfirm}
            className="bg-[#ff3b30]/14 flex items-center gap-2 border border-[#ff3b30]/55 px-5 py-2.5 font-semibold text-[#ff453a] shadow-sm transition hover:bg-[#ff3b30]/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete Account
          </Button>
        ) : (
          <div className="bg-[#ff3b30]/12 space-y-4 border border-[#ff3b30]/45 p-4">
            <p className="font-semibold text-[#ffb4ae]">
              Are you sure? This action cannot be undone.
            </p>
            <div>
              <label className="mb-2 block text-xs text-foreground">
                Type <code className="rounded-[8px] bg-card px-2 py-1 text-[#ff6961]">DELETE</code>{' '}
                to confirm:
              </label>
              <Input
                type="text"
                value={deleteConfirmText}
                onChange={e => onDeleteConfirmTextChange(e.target.value)}
                placeholder="DELETE"
                disabled={deleting}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancelDelete} disabled={deleting}>
                Cancel
              </Button>
              <Button
                onClick={onDeleteAccount}
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                variant="destructive"
                className="disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
