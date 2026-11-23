import type { Database } from '@/lib/supabase/database.types';

// Additive schema types until the migration is applied in a development
// database and the project's Supabase type generator can be run.
type SeriesRow = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: 'draft' | 'published';
  owner_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};
type TranslationRow = {
  series_id: number;
  locale: string;
  title: string;
  description: string | null;
};
type ChapterRow = { series_id: number; article_id: number; position: number };
type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type SeriesDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Tables: Database['public']['Tables'] & {
      article_series: Table<
        SeriesRow,
        Pick<SeriesRow, 'slug' | 'title' | 'owner_id'> & Partial<SeriesRow>,
        Partial<SeriesRow>
      >;
      article_series_translations: Table<TranslationRow, TranslationRow, Partial<TranslationRow>>;
      article_series_chapters: Table<ChapterRow, ChapterRow, Partial<ChapterRow>>;
    };
    Functions: Database['public']['Functions'] & {
      replace_series_chapters: {
        Args: { p_series_id: number; p_version: number; p_article_ids: number[] };
        Returns: number;
      };
      public_series_sitemap: {
        Args: Record<string, never>;
        Returns: { slug: string; updated_at: string | null; has_greek: boolean }[];
      };
    };
  };
};
