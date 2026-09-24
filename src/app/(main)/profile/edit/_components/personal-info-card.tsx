'use client';

import { Camera, Eye, EyeOff, Link2, MapPin, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectField as Select } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AvatarImage } from '@/components/ui/avatar-image';
import { COUNTRIES } from '@/data/hobbyConstants';
import { SOCIAL_PLATFORMS, TIMEZONES } from '../_constants';
import { ARTICLE_LOCALES, ARTICLE_LOCALE_LABELS } from '@/lib/articles/locales';
import type { ProfileFormData, ProfilePrivacyState } from '../_types';
import type { ProfileVisibility, User } from '@/types/user';

export const BIO_MAX_LENGTH = 500;

/**
 * `friends` exists in the column's enum but nothing implements a friend list,
 * so offering it would promise filtering the app does not do.
 */
const VISIBILITY_OPTIONS: readonly ProfileVisibility[] = ['public', 'private'];

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Public - anyone with the link',
  private: 'Private - only you',
};

const PRIVACY_TOGGLES: ReadonlyArray<{
  key: keyof Omit<ProfilePrivacyState, 'profile_visibility'>;
  label: string;
  hint: string;
}> = [
  { key: 'show_full_name', label: 'Show full name', hint: 'Your legal name on your profile.' },
  { key: 'show_age', label: 'Show age', hint: 'Derived from your date of birth.' },
  { key: 'show_location', label: 'Show country/city', hint: 'Where you are based.' },
  { key: 'show_email', label: 'Show email', hint: 'Visible to anyone who opens your profile.' },
  { key: 'show_social_links', label: 'Show social links', hint: 'Your linked accounts.' },
  { key: 'show_stats', label: 'Show stats', hint: 'Library counts and totals.' },
  { key: 'show_psn_id', label: 'Show gaming IDs', hint: 'PSN, Xbox, Steam and Nintendo handles.' },
];

interface PersonalInfoCardProps {
  user: User;
  formData: ProfileFormData;
  socialLinks: Record<string, string>;
  locationCity: string;
  privacySettings: ProfilePrivacyState;
  currentAvatar: string;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSelectChange: (name: string) => (value: string) => void;
  onSocialLinkChange: (key: string, value: string) => void;
  onLocationCityChange: (city: string) => void;
  onPrivacyToggle: (key: keyof Omit<ProfilePrivacyState, 'profile_visibility'>) => void;
  onVisibilityChange: (visibility: ProfileVisibility) => void;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
}

export function PersonalInfoCard({
  user,
  formData,
  socialLinks,
  locationCity,
  privacySettings,
  currentAvatar,
  onFormChange,
  onSelectChange,
  onSocialLinkChange,
  onLocationCityChange,
  onPrivacyToggle,
  onVisibilityChange,
  onAvatarUpload,
  onAvatarRemove,
}: PersonalInfoCardProps) {
  return (
    <Card className="">
      <CardHeader className="border-b border-border bg-card/50">
        <p className="mb-1 text-xs uppercase tracking-[0.25em] text-primary">Core Details</p>
        <CardTitle className="text-lg text-foreground">Personal Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-card/88 rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Account Information</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Input label="Username" value={user.username} disabled />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Your handle is permanent - it is part of every link to your profile.
              </p>
            </div>
            <Input
              label="Display Name"
              type="text"
              name="display_name"
              value={formData.display_name || ''}
              onChange={onFormChange}
              placeholder="The name visible to everyone"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Full Name"
            type="text"
            name="full_name"
            value={formData.full_name || ''}
            onChange={onFormChange}
            placeholder="John Doe"
          />

          <Input
            label="Date of Birth"
            type="date"
            name="date_of_birth"
            value={formData.date_of_birth || ''}
            onChange={onFormChange}
          />
        </div>

        <div className="bg-card/88 rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            <span>Location &amp; Language</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              key={`country-${formData.country || 'none'}`}
              label="Country"
              options={COUNTRIES}
              value={(formData.country as string) || ''}
              onChange={onSelectChange('country')}
            />
            <Input
              label="City"
              type="text"
              name="city"
              value={locationCity}
              onChange={e => onLocationCityChange(e.target.value)}
              placeholder="e.g. Athens"
            />
            <Select
              key={`timezone-${formData.timezone || 'none'}`}
              label="Time Zone"
              options={TIMEZONES}
              value={(formData.timezone as string) || ''}
              onChange={onSelectChange('timezone')}
            />
            <div>
              <Select
                key={`language-${formData.language_preference || 'none'}`}
                label="Reading language"
                options={ARTICLE_LOCALES}
                optionLabels={ARTICLE_LOCALE_LABELS}
                value={(formData.language_preference as string) || ''}
                onChange={onSelectChange('language_preference')}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Articles and reviews open in this language when a translation exists.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bio</label>
            <Textarea
              name="bio"
              value={formData.bio || ''}
              onChange={onFormChange}
              placeholder="Tell us a few words about yourself..."
              rows={4}
              maxLength={BIO_MAX_LENGTH}
            />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formData.bio?.length || 0} / {BIO_MAX_LENGTH} characters
          </div>
        </div>

        <div className="bg-card/88 rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Link2 className="h-4 w-4 text-primary" />
              <span>Social Presence</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {SOCIAL_PLATFORMS.map(platform => {
              const Icon = platform.icon;
              return (
                <div key={platform.key} className="flex items-center gap-3 border bg-card/80 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border bg-muted text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {platform.label}
                    </p>
                    <input
                      type="text"
                      value={socialLinks[platform.key] || ''}
                      onChange={e => onSocialLinkChange(platform.key, e.target.value)}
                      placeholder={platform.placeholder}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card/88 rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Camera className="h-4 w-4 text-primary" />
            <span>Profile Photo</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-card">
              {currentAvatar ? (
                <AvatarImage src={currentAvatar} alt="Avatar" size={80} className="rounded-full" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  No avatar
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Avatar Upload
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onAvatarUpload}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:font-semibold file:uppercase file:tracking-wide file:text-background hover:file:opacity-90"
                />
              </div>
              <Input
                label="Avatar URL"
                type="text"
                name="avatar_url"
                value={(formData.avatar_url as string) || ''}
                onChange={onFormChange}
                placeholder="https://..."
              />
              <Button type="button" variant="outline" onClick={onAvatarRemove}>
                Remove
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-card/88 rounded-lg border p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Privacy Settings</span>
          </div>
          <p className="mb-4 text-[11px] text-muted-foreground">
            Visibility controls what other people can reach. The switches below control what each
            visitor sees once they are there.
          </p>

          <div className="mb-4 max-w-md">
            <Select
              key={`visibility-${privacySettings.profile_visibility}`}
              label="Profile visibility"
              options={VISIBILITY_OPTIONS}
              optionLabels={VISIBILITY_LABELS}
              value={privacySettings.profile_visibility}
              onChange={value => onVisibilityChange(value as ProfileVisibility)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Private also disables your shared dashboard and backlog links.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {PRIVACY_TOGGLES.map(setting => {
              const active = privacySettings[setting.key];
              return (
                <Button
                  type="button"
                  key={setting.key}
                  onClick={() => onPrivacyToggle(setting.key)}
                  className={`flex h-auto w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? `bg-primary/12 dark:bg-primary/22 border-primary/30 text-primary dark:border-primary/55 dark:text-[#8ec5ff]`
                      : `hover:bg-primary/8 border-border bg-card text-foreground hover:border-primary/35`
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{setting.label}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {setting.hint}
                    </span>
                  </span>
                  {active ? (
                    <Eye className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
