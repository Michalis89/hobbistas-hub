import type { Database } from '@/lib/supabase/database.types';
import type { ArticleLocale } from '@/lib/articles/locales';
import type { CategoryProfiles } from '@/lib/validation/profile';

export type UserRole = 'user' | 'author' | 'reviewer' | 'moderator' | 'admin' | 'owner';
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'deleted';
export type ProfileVisibility = 'public' | 'friends' | 'private';

export interface PrivacySettings {
  profile_visibility: ProfileVisibility;
  show_email: boolean;
  show_stats: boolean;
  show_psn_id: boolean;
  show_age?: boolean;
  show_full_name?: boolean;
  show_social_links?: boolean;
  show_location?: boolean;
}

export interface SocialLinks {
  twitter?: string;
  twitch?: string;
  youtube?: string;
  discord?: string;
  instagram?: string;
  reddit?: string;
  website?: string;
  // location_city moved to users.location_city (dedicated column)
}

type UserRow = Database['public']['Tables']['users']['Row'];

export type User = Omit<
  UserRow,
  | 'privacy_settings'
  // The users.notification_settings JSON column still exists but nothing reads
  // it; notification preferences live in `user_settings`.
  | 'notification_settings'
  // Re-typed below: the column is free text in the database but only ever
  // holds a reading language the app knows about.
  | 'language_preference'
  | 'social_links'
  | 'favorite_genres'
  | 'categories'
> & {
  privacy_settings: PrivacySettings | null;
  social_links: SocialLinks | null;
  /** Reading language for articles and reviews. */
  language_preference: ArticleLocale | null;
  favorite_genres: string[] | null;
  categories: string[] | null;
  roles: UserRole[] | null;
  // New fields from refactor (returned by /api/me)
  location_city?: string | null;
  category_profile?: CategoryProfiles | null;
  genre_affinity?: Record<string, string[]>;
};

export interface PublicUserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  roles: UserRole[];
  bio: string | null;
  country: string | null;
  favorite_platform: string | null;
  favorite_genres: string[] | null;
  gaming_since: number | null;
  social_links: SocialLinks;
  total_games_completed: number;
  total_hours_played: number;
  total_platinums: number;
  created_at: string;
}

export interface UserProfileUpdate {
  full_name?: string | null;
  display_name?: string | null;
  bio?: string | null;
  date_of_birth?: string | null;
  country?: string | null;
  timezone?: string | null;
  language_preference?: ArticleLocale | null;
  psn_id?: string | null;
  xbox_gamertag?: string | null;
  steam_id?: string | null;
  nintendo_id?: string | null;
  favorite_platform?: string | null;
  favorite_genres?: string[] | null;
  gaming_since?: number | null;
  categories?: string[] | null;
  privacy_settings?: Partial<PrivacySettings>;
  social_links?: Partial<SocialLinks>;
}

export interface UserWithStats extends User {
  guides_count?: number;
  comments_count?: number;
  likes_received?: number;
}
