import type { ProfileVisibility, User } from '@/types/user';

/**
 * Every privacy flag the app actually reads. `profile_visibility` gates the
 * shared `/u/[username]` pages and `/api/public/library`; the `show_*` flags
 * gate individual blocks on the profile. They all used to be consumed with no
 * way to set them.
 */
export type ProfilePrivacyState = {
  profile_visibility: ProfileVisibility;
  show_full_name: boolean;
  show_age: boolean;
  show_location: boolean;
  show_email: boolean;
  show_social_links: boolean;
  show_stats: boolean;
  show_psn_id: boolean;
};

export const DEFAULT_PROFILE_PRIVACY: ProfilePrivacyState = {
  profile_visibility: 'public',
  show_full_name: false,
  show_age: false,
  show_location: true,
  show_email: false,
  show_social_links: true,
  show_stats: true,
  show_psn_id: true,
};

export type CategoryNotes = Record<string, unknown>;

export type ProfileFormData = Partial<User> & {
  categories?: string[];
  category_notes?: CategoryNotes;
  // Legacy fields for UI state (mapped to category_profile in the backend)
  // Game fields (now in profiles.games.*)
  psn_id?: string;
  xbox_gamertag?: string;
  steam_id?: string;
  nintendo_id?: string;
  favorite_platform?: string;
  gaming_since?: number | null;
  // Genre fields (now in profiles.{category}.genres)
  favorite_anime_genres?: string[];
  favorite_movie_genres?: string[];
  favorite_book_genres?: string[];
  // Other category fields
  favorite_languages?: string[];
  pet_types?: string[];
  vape_device?: string;
  vape_flavor?: string;
};

export const EMPTY_CATEGORY_NOTES: CategoryNotes = {};
