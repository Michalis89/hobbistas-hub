import type { Database } from '@/lib/supabase/database.types';

/**
 * Base payload type that all media payloads extend
 */
export type BaseMediaPayload = {
  category: string;
  source?: string | null;
  description?: string | null;
  cover_image_large?: string | null;
  cover_image_medium?: string | null;
  genres?: string[] | null;
};

/**
 * External ID can be number or string depending on the category
 */
export type ExternalIdValue = number | string;

/**
 * Generic media payload with external ID field
 * The actual external ID field name (mal_id, google_books_id, etc.) is dynamic
 */
export type MediaPayload = BaseMediaPayload & Record<string, unknown>;

/**
 * Request body for adding media to user's library
 */
export type AddMediaRequestBody = {
  source: 'local' | 'external';
  mediaId?: number;
  payload?: MediaPayload;
  status?: 'planned' | 'current' | 'completed' | 'dropped';
  progress?: number;
  score?: number;
  notes?: string | null;
  is_favorite?: boolean;
  selected_platform?: string | null;
};

/**
 * Request body for updating library entry
 */
export type UpdateLibraryRequestBody = {
  mediaId: number;
  entryId?: number;
  clientUpdatedAt?: string;
  status?: 'planned' | 'current' | 'completed' | 'dropped';
  is_favorite?: boolean | null;
  selected_platform?: string | null;
  priority?: number | null;
  score?: number | null;
  progress?: number | null;
  notes?: string | null;
};

/**
 * Generic library row type (used in mappers)
 */
export type LibraryRow = {
  id: number;
  status: string;
  updated_at?: string | null;
  is_favorite: boolean | null;
  import_source?: string | null;
  selected_platform?: string | null;
  priority: number | null;
  score: number | null;
  progress: number | null;
  notes: string | null;
  media_items: Record<string, unknown> | null;
};

/**
 * User media entry data for upsert operations
 */
export type UserMediaEntryData = Database['public']['Tables']['user_media_entries']['Insert'];

/**
 * Media item insert data
 */
export type MediaItemInsert = Database['public']['Tables']['media_items']['Insert'];

/**
 * Type for title field names in media_items table
 */
export type TitleField =
  | 'title'
  | 'title_english'
  | 'title_romaji'
  | 'title_native'
  | 'original_title';

/**
 * Priority array for title resolution
 */
export type TitlePriority = TitleField[];

/**
 * External ID configuration
 */
export type ExternalIdConfig = {
  field: 'mal_id' | 'google_books_id' | 'rawg_id' | 'igdb_id' | 'tmdb_id';
  type: 'number' | 'string';
  /**
   * Further identifier columns, checked in order after `field` when looking
   * for an existing row. Books use this: a book may be known only by its
   * Open Library id or ISBN.
   */
  alternateFields?: ('open_library_id' | 'nlg_id' | 'hardcover_id' | 'isbn_13')[];
};

/**
 * User profile data for activity logging
 */
export type UserProfile = {
  username?: string;
  display_name?: string;
  avatar_url?: string;
};
