'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  USER_SETTINGS_DEFAULTS,
  type UserSettingsData,
  type UserSettingsValue,
} from '@/lib/settings/types';
import { useTheme } from '@/context/ThemeContext';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import NotificationSettings from '@/app/components/settings/NotificationSettings';
import ShareLinkCard from '@/app/components/settings/ShareLinkCard';

const toFormState = (settings: UserSettingsData): UserSettingsValue => ({
  theme: settings.theme,
  social_enabled: settings.social_enabled,
  community_activity_enabled: settings.community_activity_enabled,
  community_suggestions_enabled: settings.community_suggestions_enabled,
  social_profile_enabled: settings.social_profile_enabled,
  articles_enabled: settings.articles_enabled,
  reviews_enabled: settings.reviews_enabled,
  diary_enabled: settings.diary_enabled,
  dnd_enabled: settings.dnd_enabled,
  dnd_role: settings.dnd_role,
  ticket_notifications_enabled: settings.ticket_notifications_enabled,
  follows_notifications_enabled: settings.follows_notifications_enabled,
  dms_notifications_enabled: settings.dms_notifications_enabled,
});

type SettingsFormProps = {
  initialSettings: UserSettingsData;
};

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [formState, setFormState] = useState<UserSettingsValue>(() => toFormState(initialSettings));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResetDialogOpen, setResetDialogOpen] = useState(false);
  const [isMounted, setMounted] = useState(false);
  const { mutate } = useUserSettings(true);
  const { setThemePreference } = useTheme();

  const isProd = process.env.NODE_ENV === 'production';
  const isSocialPreviewMode = isProd;
  const isSocialMasterToggleLocked = isProd;
  const isDiaryPreviewMode = false;
  const isDndPreviewMode = isProd;

  const updateSetting = async (patch: Partial<UserSettingsValue>) => {
    /* c8 ignore next 3 -- UI disables all setting controls while saving */
    if (isSaving) {
      return;
    }

    const normalized = { ...patch };
    if (patch.social_enabled === false) {
      normalized.community_activity_enabled = false;
      normalized.community_suggestions_enabled = false;
      normalized.social_profile_enabled = false;
    }

    if (patch.dnd_enabled === false) {
      normalized.dnd_role = null;
    }

    const sanitized: Partial<UserSettingsValue> = {};
    if (normalized.theme !== undefined) {
      sanitized.theme = normalized.theme;
    }
    if (normalized.social_enabled !== undefined) {
      sanitized.social_enabled = normalized.social_enabled;
    }
    if (normalized.community_activity_enabled !== undefined) {
      sanitized.community_activity_enabled = normalized.community_activity_enabled;
    }
    if (normalized.community_suggestions_enabled !== undefined) {
      sanitized.community_suggestions_enabled = normalized.community_suggestions_enabled;
    }
    if (normalized.social_profile_enabled !== undefined) {
      sanitized.social_profile_enabled = normalized.social_profile_enabled;
    }
    if (normalized.articles_enabled !== undefined) {
      sanitized.articles_enabled = normalized.articles_enabled;
    }
    if (normalized.reviews_enabled !== undefined) {
      sanitized.reviews_enabled = normalized.reviews_enabled;
    }
    if (normalized.diary_enabled !== undefined) {
      sanitized.diary_enabled = normalized.diary_enabled;
    }
    if (normalized.dnd_enabled !== undefined) {
      sanitized.dnd_enabled = normalized.dnd_enabled;
    }
    if (normalized.dnd_role !== undefined) {
      sanitized.dnd_role = normalized.dnd_role;
    }
    if (normalized.ticket_notifications_enabled !== undefined) {
      sanitized.ticket_notifications_enabled = normalized.ticket_notifications_enabled;
    }
    if (normalized.follows_notifications_enabled !== undefined) {
      sanitized.follows_notifications_enabled = normalized.follows_notifications_enabled;
    }
    if (normalized.dms_notifications_enabled !== undefined) {
      sanitized.dms_notifications_enabled = normalized.dms_notifications_enabled;
    }

    /* c8 ignore next 3 -- defensive branch; current UI only emits known setting keys */
    if (Object.keys(sanitized).length === 0) {
      return;
    }

    const previousState = formState;
    const optimisticState = { ...formState, ...sanitized };
    setFormState(optimisticState);
    setIsSaving(true);
    setErrorMessage(null);

    // Apply theme preference immediately for instant feedback
    if (sanitized.theme) {
      setThemePreference(sanitized.theme);
    }

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sanitized),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to save settings.');
      }
      if (payload?.data) {
        setFormState(payload.data);
        mutate(payload.data, false);
      }
      toast.success('Settings saved');
    } catch (error) {
      // Rollback theme preference on error
      if (sanitized.theme) {
        setThemePreference(previousState.theme);
      }
      setFormState(previousState);
      const message = error instanceof Error ? error.message : 'Unable to save settings.';
      setErrorMessage(message);
      // The banner and the toast said different things: the banner carried the
      // server's reason while the toast always claimed a retry would help.
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeChange = (value: string) => {
    if (value === 'system' || value === 'dark' || value === 'light') {
      void updateSetting({ theme: value });
    }
  };

  const handleToggle = (key: keyof UserSettingsValue, value: boolean) => {
    void updateSetting({ [key]: value });
  };

  const handleDndRoleChange = (value: string) => {
    if (value === 'dm' || value === 'player') {
      void updateSetting({ dnd_role: value });
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleReset = () => {
    void updateSetting(USER_SETTINGS_DEFAULTS);
  };

  const {
    social_enabled,
    community_activity_enabled,
    community_suggestions_enabled,
    social_profile_enabled,
    diary_enabled,
    dnd_enabled,
    dnd_role,
    ticket_notifications_enabled,
    follows_notifications_enabled,
    dms_notifications_enabled,
  } = formState;

  return (
    <div className="space-y-6">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&rsquo;t save settings</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Set a theme that feels right for your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={formState.theme} onValueChange={handleThemeChange}>
            <TabsList className="max-w-xs">
              <TabsTrigger value="system" disabled={isSaving}>
                System
              </TabsTrigger>
              <TabsTrigger value="dark" disabled={isSaving}>
                Dark
              </TabsTrigger>
              <TabsTrigger value="light" disabled={isSaving}>
                Light
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-sm text-muted-foreground">
            Theme selections are synced across devices and saved instantly.
          </p>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Changes are saved automatically. A toast confirms the update.
          </p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Social Layer</CardTitle>
            {isSocialPreviewMode ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
                Coming Soon
              </Badge>
            ) : null}
          </div>
          <CardDescription>Social is optional—opt in whenever you want.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Enable social features</p>
              <p className="text-xs text-muted-foreground">
                Extend Hobbistas with community activity, recommendations, and shared discovery.
              </p>
            </div>
            <Switch
              checked={social_enabled}
              onCheckedChange={checked => handleToggle('social_enabled', checked)}
              disabled={isSaving || isSocialMasterToggleLocked}
            />
          </div>

          {!social_enabled && (
            <p className="text-sm text-muted-foreground">
              Your space stays private and personal until you enable the social layer.
            </p>
          )}

          {social_enabled && (
            <div className="space-y-4 rounded-xl border border-dashed border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Show community activity feed</p>
                  <p className="text-xs text-muted-foreground">
                    Live updates from the community while you keep your own streaks private.
                  </p>
                </div>
                <Switch
                  checked={community_activity_enabled}
                  onCheckedChange={checked => handleToggle('community_activity_enabled', checked)}
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Show community suggestions</p>
                  <p className="text-xs text-muted-foreground">
                    Get curated recommendations inspired by what everyone is enjoying.
                  </p>
                </div>
                <Switch
                  checked={community_suggestions_enabled}
                  onCheckedChange={checked =>
                    handleToggle('community_suggestions_enabled', checked)
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Enable Social Profile</p>
                  <p className="text-xs text-muted-foreground">
                    Create a public profile visible to other community members.
                  </p>
                </div>
                <Switch
                  checked={social_profile_enabled}
                  onCheckedChange={checked => handleToggle('social_profile_enabled', checked)}
                  disabled={isSaving}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Digital Personal Diary</CardTitle>
            {/* c8 ignore next 5 -- feature flag intentionally hardcoded off for now */}
            {isDiaryPreviewMode ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
                Coming Soon
              </Badge>
            ) : null}
          </div>
          <CardDescription>A private space for your thoughts—100% yours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Enable Personal Diary</p>
              <p className="text-xs text-muted-foreground">
                Keep private notes and journal entries. Only you can see them—ever.
              </p>
            </div>
            <Switch
              checked={diary_enabled}
              onCheckedChange={checked => handleToggle('diary_enabled', checked)}
              disabled={isSaving || isDiaryPreviewMode}
            />
          </div>

          {diary_enabled && (
            <div className="rounded-xl border border-dashed border-border p-4">
              <p className="text-sm text-muted-foreground">
                Your diary entries are encrypted and 100% private. Not even platform administrators
                can access your content.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Dungeons & Dragons Tools</CardTitle>
            {isDndPreviewMode ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
                Coming Soon
              </Badge>
            ) : null}
          </div>
          <CardDescription>Campaign management with zero-knowledge encryption.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Enable D&D Features</p>
              <p className="text-xs text-muted-foreground">
                Access DM tools or join campaigns as a player with end-to-end encryption.
              </p>
            </div>
            <Switch
              checked={dnd_enabled}
              onCheckedChange={checked => handleToggle('dnd_enabled', checked)}
              disabled={isSaving || isDndPreviewMode}
            />
          </div>

          {dnd_enabled && (
            <div className="space-y-4 rounded-xl border border-dashed border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Your Role</p>
                  <p className="text-xs text-muted-foreground">
                    Choose whether you&apos;re a Dungeon Master or a Player.
                  </p>
                </div>
                <Select
                  value={dnd_role ?? 'player'}
                  onValueChange={handleDndRoleChange}
                  disabled={isSaving || isDndPreviewMode}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dm">Dungeon Master</SelectItem>
                    <SelectItem value="player">Player</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {dnd_role === 'dm' && (
                <p className="text-sm text-muted-foreground">
                  As a DM, you can create campaigns, manage sessions, and share specific tools with
                  your players.
                </p>
              )}
              {dnd_role === 'player' && (
                <p className="text-sm text-muted-foreground">
                  As a Player, you can join campaigns and access tools shared by your DM.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Notifications</CardTitle>
            {isSocialPreviewMode ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
                Expandable
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            Tickets are active now. Follows and direct messages are ready as opt-in channels for
            upcoming social features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Support ticket updates</p>
              <p className="text-xs text-muted-foreground">
                Show unread ticket replies in your badges.
              </p>
            </div>
            <Switch
              checked={ticket_notifications_enabled}
              onCheckedChange={checked => handleToggle('ticket_notifications_enabled', checked)}
              disabled={isSaving}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Follow activity</p>
              <p className="text-xs text-muted-foreground">
                Enable notifications when users follow your profile.
              </p>
            </div>
            <Switch
              checked={follows_notifications_enabled}
              onCheckedChange={checked => handleToggle('follows_notifications_enabled', checked)}
              disabled={isSaving || isSocialPreviewMode}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Direct messages</p>
              <p className="text-xs text-muted-foreground">
                Enable unread message badges for private conversations.
              </p>
            </div>
            <Switch
              checked={dms_notifications_enabled}
              onCheckedChange={checked => handleToggle('dms_notifications_enabled', checked)}
              disabled={isSaving || isSocialPreviewMode}
            />
          </div>
        </CardContent>
      </Card>

      <NotificationSettings />

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
          <CardDescription>Pick the streams you want to surface in your hub.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Enable Articles</p>
              <p className="text-xs text-muted-foreground">
                Keep the latest write-ups and editorial features on your dashboard.
              </p>
            </div>
            <Switch
              checked={formState.articles_enabled}
              onCheckedChange={checked => handleToggle('articles_enabled', checked)}
              disabled={isSaving}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Enable Reviews</p>
              <p className="text-xs text-muted-foreground">
                Show community ratings and mini-reviews as part of your feed.
              </p>
            </div>
            <Switch
              checked={formState.reviews_enabled}
              onCheckedChange={checked => handleToggle('reviews_enabled', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {(isSocialPreviewMode || isDndPreviewMode) && (
        <Alert>
          <AlertTitle>Production Environment</AlertTitle>
          <AlertDescription>
            In production, only the &quot;Enable social features&quot; master toggle and Dungeons &
            Dragons
            Tools are locked and marked as Coming Soon. Digital Personal Diary is available now.
          </AlertDescription>
        </Alert>
      )}

      <ShareLinkCard />

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>Reset every setting back to the defaults.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Resets theme, content toggles, and the optional social layer. No account changes occur.
          </p>
        </CardContent>
        <CardFooter>
          {isMounted && (
            <AlertDialog open={isResetDialogOpen} onOpenChange={setResetDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isSaving} className="w-full">
                  Reset settings to default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will revert every preference to the default state. You can redo these steps
                    anytime.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleReset}
                    disabled={isSaving}
                  >
                    Reset settings
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
