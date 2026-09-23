'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle, XCircle } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { selectUser, updateUserProfile, logout, fetchSession } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store/store';
import type { ProfileVisibility, User } from '@/types/user';
import { supabase } from '@/lib/supabase-client';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { isDemoUserId } from '@/lib/demo';
import { isArticleLocale } from '@/lib/articles/locales';
import dynamic from 'next/dynamic';

import { SOCIAL_LAYER_HOBBY_CATEGORIES } from './_constants';
import {
  type CategoryNotes,
  type ProfileFormData,
  type ProfilePrivacyState,
  DEFAULT_PROFILE_PRIVACY,
  EMPTY_CATEGORY_NOTES,
} from './_types';
import { ProfileEditSkeleton } from './_components/profile-edit-skeleton';
import { ProfilePageHeader } from './_components/profile-page-header';
import { BIO_MAX_LENGTH, PersonalInfoCard } from './_components/personal-info-card';
import { CategorySelectionSection } from './_components/category-selection-section';
import { SaveButtons } from './_components/save-buttons';
import { DangerZoneCard } from './_components/danger-zone-card';

const ProfileCategoryTabs = dynamic(
  () => import('@/components/profile/profile-category-tabs').then(mod => mod.ProfileCategoryTabs),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" />,
  },
);

/**
 * A failure this page raised itself, with a message already written for the
 * person reading it. Everything else reaching the catch is a driver or network
 * error whose text would leak database internals, so it stays generic.
 */
class ProfileSaveError extends Error {}

/**
 * Reads every privacy flag off the stored JSON. Defaults matter: a flag that
 * has never been set must fall back to the same value the profile renderer
 * assumes, or the toggle would show the opposite of what visitors see.
 */
function readPrivacySettings(raw: Record<string, unknown> | null | undefined): ProfilePrivacyState {
  const source = raw ?? {};
  const flag = (key: keyof ProfilePrivacyState, fallback: boolean) =>
    (source[key] as boolean | undefined) ?? fallback;

  return {
    profile_visibility:
      (source.profile_visibility as ProfileVisibility | undefined) ??
      DEFAULT_PROFILE_PRIVACY.profile_visibility,
    show_full_name: flag('show_full_name', DEFAULT_PROFILE_PRIVACY.show_full_name),
    show_age: flag('show_age', DEFAULT_PROFILE_PRIVACY.show_age),
    show_location: flag('show_location', DEFAULT_PROFILE_PRIVACY.show_location),
    show_email: flag('show_email', DEFAULT_PROFILE_PRIVACY.show_email),
    show_social_links: flag('show_social_links', DEFAULT_PROFILE_PRIVACY.show_social_links),
    show_stats: flag('show_stats', DEFAULT_PROFILE_PRIVACY.show_stats),
    show_psn_id: flag('show_psn_id', DEFAULT_PROFILE_PRIVACY.show_psn_id),
  };
}

export default function EditProfilePage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector(selectUser);
  // Middleware ensures only authenticated users reach this page

  const [formData, setFormData] = useState<ProfileFormData>({
    favorite_anime_genres: [],
    favorite_movie_genres: [],
    favorite_book_genres: [],
    favorite_languages: [],
    pet_types: [],
    vape_device: '',
    vape_flavor: '',
  });
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [locationCity, setLocationCity] = useState('');
  const [privacySettings, setPrivacySettings] =
    useState<ProfilePrivacyState>(DEFAULT_PROFILE_PRIVACY);
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const [snapshotUserId, setSnapshotUserId] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [showNewUserInfo, setShowNewUserInfo] = useState(false);
  const { settings } = useUserSettings(!!user);

  const initialCategoryNotes = useMemo<CategoryNotes>(() => {
    // Read from new user_category_profiles table (via /api/me)
    const categoryProfile = user?.category_profile as CategoryNotes | null | undefined;
    return categoryProfile || EMPTY_CATEGORY_NOTES;
  }, [user?.category_profile]);

  const socialLayerEnabled = settings?.social_enabled ?? true;
  const visibleCategoriesForTabs = ((formData.categories as string[] | undefined) ?? [])
    .map(String)
    .filter(cat =>
      socialLayerEnabled
        ? true
        : !SOCIAL_LAYER_HOBBY_CATEGORIES.includes(cat as 'coding' | 'pet' | 'vape'),
    );

  // Handle hash scroll after page load (for links like #categories)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      // Small delay to ensure the element is rendered
      const timer = setTimeout(() => {
        const element = document.querySelector(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (user) {
      // Calculate categories from category_profile (keys of the object)
      const userCategories = user.category_profile
        ? Object.keys(user.category_profile).filter(key => key && typeof key === 'string')
        : [];
      const hasNoCategories = userCategories.length === 0;

      // Show info alert if user has no categories selected
      setShowNewUserInfo(hasNoCategories);

      // Extract game fields from category_profile.games (NEW SOURCE)
      const gamesProfile =
        (initialCategoryNotes.games as Record<string, unknown> | undefined) || {};

      setFormData({
        full_name: user.full_name || '',
        date_of_birth: user.date_of_birth || '',
        country: user.country || 'GR',
        timezone: user.timezone || '',
        language_preference: user.language_preference || 'en',
        display_name: user.display_name || '',
        avatar_url: user.avatar_url || '',
        bio: user.bio || '',
        psn_id: (gamesProfile.psn_id as string) || '',
        xbox_gamertag: (gamesProfile.xbox_gamertag as string) || '',
        steam_id: (gamesProfile.steam_id as string) || '',
        nintendo_id: (gamesProfile.nintendo_id as string) || '',
        favorite_platform: (gamesProfile.favorite_platform as string) || '',
        favorite_genres: (gamesProfile.user_favorite_genres as string[]) || [],
        favorite_anime_genres:
          ((initialCategoryNotes.anime as Record<string, unknown>)?.genres as string[]) || [],
        favorite_movie_genres:
          ((initialCategoryNotes.movies as Record<string, unknown>)?.genres as string[]) || [],
        favorite_book_genres:
          ((initialCategoryNotes.books as Record<string, unknown>)?.genres as string[]) || [],
        favorite_languages:
          ((initialCategoryNotes.coding as Record<string, unknown>)?.languages as string[]) || [],
        gaming_since: (gamesProfile.gaming_since as number) || null,
        categories: hasNoCategories ? [] : userCategories,
        category_notes: initialCategoryNotes,
        pet_types: ((initialCategoryNotes.pet as Record<string, unknown>)?.type as string)
          ? [(initialCategoryNotes.pet as Record<string, unknown>)?.type as string]
          : [],
        vape_device:
          ((initialCategoryNotes.vape as Record<string, unknown>)?.device as string) || '',
        vape_flavor:
          ((initialCategoryNotes.vape as Record<string, unknown>)?.flavors as string[])?.[0] || '',
      });

      const rawSocial = (user.social_links as Record<string, unknown> | undefined) || {};
      setSocialLinks({
        discord: (rawSocial.discord as string) || '',
        instagram: (rawSocial.instagram as string) || '',
        youtube: (rawSocial.youtube as string) || '',
        twitch: (rawSocial.twitch as string) || '',
        twitter: (rawSocial.twitter as string) || '',
        reddit: (rawSocial.reddit as string) || '',
        website: (rawSocial.website as string) || (rawSocial.portfolio as string) || '',
      });
      // Read from new location_city column (clean, no fallback)
      setLocationCity(user.location_city || '');

      const rawPrivacy = (user.privacy_settings as unknown as Record<string, unknown>) || {};
      const hydratedPrivacy = readPrivacySettings(rawPrivacy);
      setPrivacySettings(hydratedPrivacy);
      setAvatarPreview(null);
      const snap = makeSnapshot(
        {
          full_name: user.full_name || '',
          date_of_birth: user.date_of_birth || '',
          country: user.country || 'GR',
          timezone: user.timezone || '',
          language_preference: user.language_preference || 'en',
          display_name: user.display_name || '',
          avatar_url: user.avatar_url || '',
          bio: user.bio || '',
          psn_id: (gamesProfile.psn_id as string) || '',
          xbox_gamertag: (gamesProfile.xbox_gamertag as string) || '',
          steam_id: (gamesProfile.steam_id as string) || '',
          nintendo_id: (gamesProfile.nintendo_id as string) || '',
          favorite_platform: (gamesProfile.favorite_platform as string) || '',
          favorite_genres: (gamesProfile.user_favorite_genres as string[]) || [],
          favorite_anime_genres:
            ((initialCategoryNotes.anime as Record<string, unknown>)?.genres as string[]) || [],
          favorite_movie_genres:
            ((initialCategoryNotes.movies as Record<string, unknown>)?.genres as string[]) || [],
          favorite_book_genres:
            ((initialCategoryNotes.books as Record<string, unknown>)?.genres as string[]) || [],
          favorite_languages:
            ((initialCategoryNotes.coding as Record<string, unknown>)?.languages as string[]) || [],
          gaming_since: (gamesProfile.gaming_since as number) || null,
          categories: userCategories.length > 0 ? userCategories : ['games'],
          category_notes: initialCategoryNotes,
          pet_types: ((initialCategoryNotes.pet as Record<string, unknown>)?.type as string)
            ? [(initialCategoryNotes.pet as Record<string, unknown>)?.type as string]
            : [],
          vape_device:
            ((initialCategoryNotes.vape as Record<string, unknown>)?.device as string) || '',
          vape_flavor:
            ((initialCategoryNotes.vape as Record<string, unknown>)?.flavors as string[])?.[0] ||
            '',
        },
        {
          discord: (rawSocial.discord as string) || '',
          instagram: (rawSocial.instagram as string) || '',
          youtube: (rawSocial.youtube as string) || '',
          twitch: (rawSocial.twitch as string) || '',
          twitter: (rawSocial.twitter as string) || '',
          reddit: (rawSocial.reddit as string) || '',
          website: (rawSocial.website as string) || (rawSocial.portfolio as string) || '',
        },
        // Read from new location_city column (clean, no fallback)
        user.location_city || '',
        hydratedPrivacy,
        (user.avatar_url as string) || '',
      );
      setInitialSnapshot(snap);
      setSnapshotUserId(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, initialCategoryNotes]);

  // Show loading skeleton while user data loads from Redux
  if (!user) {
    return <ProfileEditSkeleton />;
  }

  const isDemoAccount = isDemoUserId(user.id);
  const currentAvatar =
    avatarPreview || (formData.avatar_url as string) || (user.avatar_url as string | null) || '';
  const currentSnapshot = makeSnapshot(
    formData,
    socialLinks,
    locationCity,
    privacySettings,
    avatarFile
      ? 'pending-upload'
      : (formData.avatar_url as string) || (user.avatar_url as string) || '',
  );
  const isDirty =
    !!avatarFile ||
    (!!initialSnapshot && currentSnapshot !== initialSnapshot && snapshotUserId === user.id);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange =
    (name: string) =>
    (value: string): void => {
      setFormData(prev => ({ ...prev, [name]: value }));
    };

  const handleSocialLinkChange = (key: string, value: string) => {
    setSocialLinks(prev => ({ ...prev, [key]: value }));
  };

  const togglePrivacySetting = (key: keyof Omit<ProfilePrivacyState, 'profile_visibility'>) => {
    setPrivacySettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleVisibilityChange = (profile_visibility: ProfileVisibility) => {
    setPrivacySettings(prev => ({ ...prev, profile_visibility }));
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarRemove = () => {
    setAvatarPreview(null);
    setFormData(prev => ({ ...prev, avatar_url: '' }));
    setAvatarFile(null);
  };

  function normalizeArray(val: unknown) {
    return Array.isArray(val) ? [...val].map(String).sort() : val;
  }

  function makeSnapshot(
    data: ProfileFormData,
    socials: Record<string, string>,
    locCity: string,
    privacy: ProfilePrivacyState,
    avatarMarker: string,
  ) {
    const { favorite_genres, categories, category_notes, ...rest } = data;
    return JSON.stringify({
      form: {
        ...rest,
        favorite_genres: normalizeArray(favorite_genres),
        categories: normalizeArray(categories),
        category_notes: category_notes || EMPTY_CATEGORY_NOTES,
      },
      socials,
      locCity,
      privacy,
      avatar: avatarMarker,
    });
  }

  const toggleCategory = (cat: string) => {
    setFormData(prev => {
      const current = (prev.categories as string[] | undefined) ?? [];
      const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];

      // Hide the new user info alert when user selects at least one category
      if (next.length > 0 && showNewUserInfo) {
        setShowNewUserInfo(false);
      }

      return { ...prev, categories: next };
    });
  };

  const handleCategoryNoteField =
    (cat: string, key: string) => (value: string | number | string[]) => {
      setFormData(prev => {
        const notes = (prev.category_notes as Record<string, unknown> | undefined) || {};
        const current = (notes[cat] as Record<string, unknown> | undefined) || {};
        return {
          ...prev,
          category_notes: {
            ...notes,
            [cat]: { ...current, [key]: value },
          },
        };
      });
    };

  const handleCategoryListToggle = (cat: string, key: string, item: string) => {
    setFormData(prev => {
      const notes = (prev.category_notes as Record<string, unknown> | undefined) || {};
      const current = (notes[cat] as Record<string, unknown> | undefined) || {};
      const list: string[] = Array.isArray((current as { [k: string]: unknown })[key])
        ? ((current as { [k: string]: string[] })[key] as string[])
        : [];
      const next = list.includes(item) ? list.filter(v => v !== item) : [...list, item];
      return {
        ...prev,
        category_notes: {
          ...notes,
          [cat]: { ...current, [key]: next },
        },
      };
    });
  };

  const togglePetType = (type: string) => {
    setFormData(prev => {
      const current = (prev.pet_types as string[] | undefined) || [];
      const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
      return { ...prev, pet_types: next };
    });
  };

  // Helper functions removed - favorite_*_genres now stored in category_notes
  // and sent directly to /api/me/category-profile

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);

    // The profile write goes straight to Supabase, so this is the only place
    // the counter's limit is actually enforced.
    const bioValue = (formData.bio as string | undefined) ?? '';
    if (bioValue.length > BIO_MAX_LENGTH) {
      setAlert({
        type: 'error',
        message: `Your bio is ${bioValue.length} characters. The limit is ${BIO_MAX_LENGTH}.`,
      });
      return;
    }

    setSaving(true);

    try {
      let uploadedAvatarUrl: string | null = null;
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'png';
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, cacheControl: '3600' });
        if (uploadError) {
          throw uploadError;
        }
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        uploadedAvatarUrl = data.publicUrl || null;
      }

      const { category_notes, ...rest } = formData;
      const mergedPrivacy = {
        ...(user.privacy_settings as unknown as Record<string, unknown>),
        ...privacySettings,
      };
      // Clean social_links: remove location_city and category_notes (now stored separately)
      const mergedSocialLinks = {
        ...(user.social_links as Record<string, unknown> | undefined),
        ...socialLinks,
      } as User['social_links'];

      // Convert empty strings to null for unique constraint fields and date fields
      const emptyToNull = (val: string | null | undefined): string | null =>
        val && val.trim() !== '' ? val.trim() : null;

      // Only update fields that belong to public.users.
      // Category/game fields now live in user_category_profiles and are sent below.
      const userUpdates: Partial<User> = {
        full_name: emptyToNull(rest.full_name),
        date_of_birth: emptyToNull(rest.date_of_birth),
        country: emptyToNull(rest.country),
        timezone: emptyToNull(rest.timezone),
        // Narrowed at the boundary: the column is free text, the app is not.
        language_preference: isArticleLocale(rest.language_preference)
          ? rest.language_preference
          : 'en',
        display_name: emptyToNull(rest.display_name),
        bio: emptyToNull(rest.bio),
        avatar_url: uploadedAvatarUrl || emptyToNull(rest.avatar_url) || user.avatar_url || null,
        privacy_settings: mergedPrivacy as User['privacy_settings'],
        social_links: mergedSocialLinks,
      };

      // Update basic profile fields (bio, country, timezone, etc.)
      await dispatch(
        updateUserProfile({
          userId: user.id,
          updates: userUpdates,
        }),
      ).unwrap();

      // The city lives on its own endpoint. A failure here used to be logged
      // and swallowed, so the form still reported success while the city was
      // silently dropped.
      const locationResponse = await fetch('/api/me/location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_city: locationCity || null }),
      });
      if (!locationResponse.ok) {
        const failure = await locationResponse.json().catch(() => null);
        throw new ProfileSaveError(
          typeof failure?.error === 'string' ? failure.error : 'Failed to save your city.',
        );
      }

      // Build category profile from selected categories (keys define enabled categories)
      const selectedCategories = ((formData.categories as string[] | undefined) ?? [])
        .map(String)
        .filter(Boolean);
      const noteMap = (category_notes as Record<string, unknown> | undefined) || {};
      const categoryProfilePayload = Object.fromEntries(
        selectedCategories.map(cat => {
          const existingNote = noteMap[cat];
          const normalizedNote =
            existingNote && typeof existingNote === 'object' && !Array.isArray(existingNote)
              ? existingNote
              : {};
          return [cat, normalizedNote];
        }),
      );

      // Update category profile (critical for category activation and library routing)
      const categoryProfileResponse = await fetch('/api/me/category-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryProfilePayload),
      });
      if (!categoryProfileResponse.ok) {
        const failure = await categoryProfileResponse.json().catch(() => null);
        const failureMessage =
          typeof failure?.error === 'string' ? failure.error : 'Failed to update category profile';
        throw new ProfileSaveError(failureMessage);
      }

      // Refetch user to update Redux store with latest data (including category_profile)
      await dispatch(fetchSession()).unwrap();

      setAlert({ type: 'success', message: 'Profile updated successfully.' });

      // Reset snapshot after successful save
      const newSnapshot = makeSnapshot(
        {
          ...formData,
          avatar_url: uploadedAvatarUrl || rest.avatar_url || user.avatar_url || null,
        },
        socialLinks,
        locationCity,
        privacySettings,
        uploadedAvatarUrl || (rest.avatar_url as string) || (user.avatar_url as string) || '',
      );
      setInitialSnapshot(newSnapshot);
      setSnapshotUserId(user.id);

      setTimeout(() => {
        router.push('/profile');
      }, 1500);
    } catch (error) {
      console.error('Update error:', error);

      // Handle specific database constraint errors
      let errorMessage = 'Profile update failed. Please try again.';
      const errorStr = String(error);

      if (error instanceof ProfileSaveError) {
        setAlert({ type: 'error', message: error.message });
        return;
      }

      if (errorStr.includes('23505') || errorStr.includes('unique constraint')) {
        if (errorStr.includes('psn_id')) {
          errorMessage = 'This PSN ID is already used by another user.';
        } else if (errorStr.includes('username')) {
          errorMessage = 'This username is already in use.';
        } else if (errorStr.includes('email')) {
          errorMessage = 'This email is already in use.';
        } else {
          errorMessage = 'This value is already used by another user.';
        }
      }

      setAlert({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/profile');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setAlert({
        type: 'error',
        message: 'Type "DELETE" to confirm.',
      });
      return;
    }

    setDeleting(true);
    setAlert(null);

    try {
      const response = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }
      const payload = data.data ?? data;
      void payload;

      setAlert({
        type: 'success',
        message: 'Account deleted. Redirecting to home page...',
      });

      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('SignOut error (ignored):', e);
      }

      await dispatch(logout());

      localStorage.clear();
      sessionStorage.clear();

      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (error) {
      console.error('Delete account error:', error);
      setAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Account deletion failed',
      });
      setDeleting(false);
    }
  };

  return (
    <div className="pb-10 pt-6 md:pb-16 md:pt-8">
      <div className="px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6">
          <ProfilePageHeader />

          {showNewUserInfo && (
            <Alert variant="info" className="mb-6">
              <AlertDescription>
                <strong>Welcome to Hobbistas Hub!</strong> As a new user, please select at least one
                hobby category below under{' '}
                <a
                  href="#categories"
                  className="font-semibold text-primary underline hover:text-primary/80"
                >
                  My Hobbies → Hobby Categories
                </a>
                . You can also configure additional settings like social links, articles, and
                reviews in{' '}
                <a
                  href="/settings"
                  className="font-semibold text-primary underline hover:text-primary/80"
                >
                  Settings
                </a>
                . Don&apos;t forget to save your changes when you&apos;re done!
              </AlertDescription>
            </Alert>
          )}

          {alert && (
            <Alert variant={alert.type === 'error' ? 'destructive' : 'success'} className="mb-6">
              {alert.type === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>{String(alert.message ?? '')}</AlertDescription>
            </Alert>
          )}

          <form id="edit-profile-form" onSubmit={handleSubmit} className="space-y-6">
            <PersonalInfoCard
              user={user}
              formData={formData}
              socialLinks={socialLinks}
              locationCity={locationCity}
              privacySettings={privacySettings}
              currentAvatar={currentAvatar}
              onFormChange={handleChange}
              onSelectChange={handleSelectChange}
              onSocialLinkChange={handleSocialLinkChange}
              onLocationCityChange={setLocationCity}
              onPrivacyToggle={togglePrivacySetting}
              onVisibilityChange={handleVisibilityChange}
              onAvatarUpload={handleAvatarUpload}
              onAvatarRemove={handleAvatarRemove}
            />

            <CategorySelectionSection
              selectedCategories={(formData.categories as string[] | undefined) ?? []}
              socialLayerEnabled={socialLayerEnabled}
              onToggleCategory={toggleCategory}
            />

            <Card>
              <CardHeader className="border-b border-border bg-card/50">
                <CardTitle className="text-lg text-foreground">Category Tabs</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ProfileCategoryTabs
                  categories={visibleCategoriesForTabs}
                  codingFavoriteLanguages={(
                    (formData.favorite_languages as string[] | undefined) || []
                  ).map(String)}
                  gameForm={{
                    psn_id:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.games as
                          | Record<string, unknown>
                          | undefined
                      )?.psn_id as string | undefined) || '',
                    xbox_gamertag:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.games as
                          | Record<string, unknown>
                          | undefined
                      )?.xbox_gamertag as string | undefined) || '',
                    steam_id:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.games as
                          | Record<string, unknown>
                          | undefined
                      )?.steam_id as string | undefined) || '',
                    nintendo_id:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.games as
                          | Record<string, unknown>
                          | undefined
                      )?.nintendo_id as string | undefined) || '',
                    favorite_platform:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.games as
                          | Record<string, unknown>
                          | undefined
                      )?.favorite_platform as string | undefined) || '',
                    favorite_genres:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.games as
                          | Record<string, unknown>
                          | undefined
                      )?.user_favorite_genres as string[] | undefined) || [],
                    gaming_since:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.games as
                          | Record<string, unknown>
                          | undefined
                      )?.gaming_since as string | number | null | undefined) ?? '',
                  }}
                  vapeFallback={{
                    device:
                      ((
                        (formData.category_notes as Record<string, unknown> | undefined)?.vape as
                          | Record<string, unknown>
                          | undefined
                      )?.device as string | undefined) || '',
                    flavor:
                      (
                        (
                          (formData.category_notes as Record<string, unknown> | undefined)?.vape as
                            | Record<string, unknown>
                            | undefined
                        )?.flavors as string[] | undefined
                      )?.[0] || '',
                  }}
                  onGameFieldChange={(name, value) => {
                    // Write to category_notes.games instead of root level
                    setFormData(prev => {
                      const notes =
                        (prev.category_notes as Record<string, unknown> | undefined) || {};
                      const games = (notes.games as Record<string, unknown> | undefined) || {};
                      return {
                        ...prev,
                        category_notes: {
                          ...notes,
                          games: { ...games, [name]: value },
                        },
                      };
                    });
                  }}
                  onGamePlatformChange={value => {
                    // Write to category_notes.games.favorite_platform
                    setFormData(prev => {
                      const notes =
                        (prev.category_notes as Record<string, unknown> | undefined) || {};
                      const games = (notes.games as Record<string, unknown> | undefined) || {};
                      return {
                        ...prev,
                        category_notes: {
                          ...notes,
                          games: { ...games, favorite_platform: value },
                        },
                      };
                    });
                  }}
                  categoryNotes={
                    ((formData.category_notes as Record<string, unknown> | undefined) ||
                      {}) as Record<string, unknown>
                  }
                  petTypes={((formData.pet_types as string[] | undefined) || []).map(String)}
                  onPetTypeToggle={togglePetType}
                  onPetEntryField={(type, key, value) =>
                    setFormData(prev => {
                      const notes =
                        (prev.category_notes as Record<string, unknown> | undefined) || {};
                      const petNote = (notes.pet as Record<string, unknown> | undefined) || {};

                      return {
                        ...prev,
                        category_notes: {
                          ...notes,
                          pet: {
                            ...petNote,
                            type,
                            [key]: value,
                          },
                        },
                      };
                    })
                  }
                  onCategoryFieldChange={(cat, key, value) =>
                    handleCategoryNoteField(cat, key)(value)
                  }
                  onCategoryListToggle={handleCategoryListToggle}
                  genreAffinity={user.genre_affinity}
                />
              </CardContent>
            </Card>

            <SaveButtons
              saving={saving}
              isDirty={isDirty}
              isDemo={isDemoAccount}
              onCancel={handleCancel}
            />
          </form>

          {/* Danger Zone */}
          <DangerZoneCard
            showDeleteConfirm={showDeleteConfirm}
            deleteConfirmText={deleteConfirmText}
            deleting={deleting}
            isDemo={isDemoAccount}
            onShowDeleteConfirm={() => setShowDeleteConfirm(true)}
            onCancelDelete={() => {
              setShowDeleteConfirm(false);
              setDeleteConfirmText('');
            }}
            onDeleteConfirmTextChange={setDeleteConfirmText}
            onDeleteAccount={handleDeleteAccount}
          />
        </div>
      </div>
    </div>
  );
}
