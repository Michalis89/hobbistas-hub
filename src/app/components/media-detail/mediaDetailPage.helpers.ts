import { unstable_cache } from 'next/cache';
import {
  isOpenLibraryWorkId,
  parseHardcoverExternalId,
  parseNlgExternalId,
} from '@/lib/books/identifiers';
import type { MediaCategory } from '@/app/components/backlog/types';
import type { MediaItem } from '@/lib/media/types';
import getSupabaseServer from '@/lib/supabase-server';

const MEDIA_REVALIDATE_SECONDS = 3600;

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  anime: 'Anime',
  manga: 'Manga',
  books: 'Books',
  movies: 'Movies',
  tv: 'TV',
  games: 'Games',
};

export const selectFields =
  'id,category,status,updated_at,title,original_title,title_english,title_romaji,title_native,description,summary,storyline,format,season_year,start_date,first_release_date,release_date,first_air_date,cover_image_id,cover_url_thumb,cover_url_big,cover_image_large,cover_image_medium,banner_image,genres,episodes,chapters,volumes,runtime,number_of_episodes,page_count,rating,rating_count,aggregated_rating,aggregated_rating_count,popularity,mal_id,tmdb_id,google_books_id,rawg_id,igdb_id,igdb_category,igdb_slug,platforms,developer,publisher,metacritic,esrb_rating,igdb_themes,igdb_game_modes,igdb_player_perspectives,igdb_artwork_image_ids,igdb_screenshot_image_ids,official_website,igdb_updated_at,websites';

export const resolveMediaTitle = (item: MediaItem) =>
  item.title || item.title_english || item.title_romaji || item.title_native || item.original_title;

export const resolveMediaDescription = (item: MediaItem) =>
  item.summary || item.description || item.storyline || 'Explore this media entry on Hobbistas.';

export const resolveMediaCover = (item: MediaItem) =>
  item.cover_url_big ||
  item.cover_image_large ||
  item.cover_image_medium ||
  item.cover_url_thumb ||
  item.banner_image ||
  undefined;

export const resolveMediaPublishedAt = (item: MediaItem) =>
  item.release_date || item.start_date || item.first_air_date || item.first_release_date || null;

export const isNumeric = (value: string) => /^\d+$/.test(value);
export const escapeLike = (value: string) => value.replace(/[%_]/g, match => `\\${match}`);

export const toCanonicalSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

export const foldPossessiveSlug = (value: string) =>
  value.replace(/([a-z0-9])-s-(?=[a-z0-9])/g, '$1s-');

export const buildSlugCandidates = (value: string): string[] => {
  const canonical = toCanonicalSlug(value);
  if (!canonical) {
    return [];
  }

  const folded = foldPossessiveSlug(canonical);
  return Array.from(new Set([canonical, folded].filter(Boolean)));
};

export const toLooseTitleLikePattern = (canonicalSlug: string) => {
  const tokens = canonicalSlug.split('-').filter(Boolean).map(escapeLike);
  return tokens.join('%');
};

export const collectCandidateSlugs = (item: MediaItem): string[] => {
  const candidates = [
    item.igdb_slug,
    item.title,
    item.original_title,
    item.title_english,
    item.title_romaji,
    item.title_native,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .flatMap(value => buildSlugCandidates(value))
    .filter(Boolean);

  return Array.from(new Set(candidates));
};

export const scoreSlugMatch = (target: string, item: MediaItem): number => {
  const slugs = collectCandidateSlugs(item);
  if (slugs.includes(target)) {
    return 1000;
  }

  const prefixVariant = slugs.some(
    slug => slug.startsWith(`${target}-`) || target.startsWith(`${slug}-`),
  );
  if (prefixVariant) {
    return 700;
  }

  const includesVariant = slugs.some(slug => slug.includes(target) || target.includes(slug));
  if (includesVariant) {
    return 500;
  }

  return 0;
};

export const resolveCanonicalSlug = (item: MediaItem, fallbackSlug: string) => {
  const titleCandidate =
    item.igdb_slug ||
    item.title ||
    item.title_english ||
    item.title_romaji ||
    item.title_native ||
    item.original_title ||
    fallbackSlug;

  return toCanonicalSlug(titleCandidate) || toCanonicalSlug(fallbackSlug) || fallbackSlug;
};

export const fetchPublishedMediaItemCached = unstable_cache(
  async (category: string, slug: string): Promise<MediaItem | null> => {
    try {
      const supabase = getSupabaseServer();

      const fetchById = async (id: number) => {
        let query = supabase.from('media_items').select(selectFields).eq('category', category);

        if (category !== 'anime' && category !== 'manga') {
          query = query.or('status.eq.published,status.is.null');
        }

        const { data, error } = await query.eq('id', id).maybeSingle();

        if (error) {
          throw error;
        }
        return data as MediaItem | null;
      };

      const fetchByExternalId = async (externalId: number | string) => {
        let query = supabase.from('media_items').select(selectFields).eq('category', category);

        if (category !== 'anime' && category !== 'manga') {
          query = query.or('status.eq.published,status.is.null');
        }

        if (category === 'anime' || category === 'manga') {
          const numericId = Number(externalId);
          if (!Number.isFinite(numericId)) {
            return null;
          }
          query = query.eq('mal_id', numericId);
        } else if (category === 'movies' || category === 'tv') {
          const numericId = Number(externalId);
          if (!Number.isFinite(numericId)) {
            return null;
          }
          query = query.eq('tmdb_id', numericId);
        } else if (category === 'games') {
          const numericId = Number(externalId);
          if (!Number.isFinite(numericId)) {
            return null;
          }
          query = query.eq('igdb_id', numericId);
        } else if (category === 'books') {
          // Books found only on Open Library are addressed by their work id (OL…W),
          // books found only in the NLG catalogue by NLG<biblionumber>, on Hardcover by HC<id>
          const bookId = String(externalId);
          const nlgId = parseNlgExternalId(bookId);
          const hardcoverId = parseHardcoverExternalId(bookId);
          if (nlgId) {
            query = query.eq('nlg_id', nlgId);
          } else if (hardcoverId) {
            query = query.eq('hardcover_id', hardcoverId);
          } else if (isOpenLibraryWorkId(bookId)) {
            query = query.eq('open_library_id', bookId);
          } else {
            query = query.eq('google_books_id', bookId);
          }
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
          throw error;
        }
        return data as MediaItem | null;
      };

      const fetchBySlug = async () => {
        const isGamesCategory = category === 'games';
        const slugCandidates = buildSlugCandidates(slug);
        const canonicalSlug = slugCandidates[0] ?? '';
        const slugText = escapeLike(slug.replace(/[-_]/g, ' ').trim());
        if (!canonicalSlug && !slugText) {
          return null;
        }

        if (isGamesCategory && slugCandidates.length > 0) {
          const { data: exactMatches, error: exactError } = await supabase
            .from('media_items')
            .select(selectFields)
            .eq('category', category)
            .or('status.eq.published,status.is.null')
            .in('igdb_slug', slugCandidates)
            .limit(10);

          if (exactError) {
            throw exactError;
          }
          const exactRows = Array.isArray(exactMatches)
            ? (exactMatches as unknown as MediaItem[])
            : [];
          if (exactRows.length > 0) {
            return (
              exactRows
                .map(item => ({ item, score: scoreSlugMatch(canonicalSlug, item) }))
                .sort((a, b) => b.score - a.score)[0]?.item ?? exactRows[0]
            );
          }
        }

        const looseSlugForLike = escapeLike(canonicalSlug.replace(/-/g, '%'));
        const foldedLooseSlugForLike = escapeLike(
          foldPossessiveSlug(canonicalSlug).replace(/-/g, '%'),
        );
        const looseTitleLike = toLooseTitleLikePattern(canonicalSlug);
        const foldedLooseTitleLike = toLooseTitleLikePattern(foldPossessiveSlug(canonicalSlug));
        const escapedCandidates = slugCandidates.map(candidate => escapeLike(candidate));
        const gamesSlugClauses = isGamesCategory
          ? [
              ...escapedCandidates.map(candidate => `igdb_slug.ilike.%${candidate}%`),
              `igdb_slug.ilike.%${looseSlugForLike}%`,
              `igdb_slug.ilike.%${foldedLooseSlugForLike}%`,
            ]
          : [];

        const { data, error } = await supabase
          .from('media_items')
          .select(selectFields)
          .eq('category', category)
          .or(
            [
              ...gamesSlugClauses,
              `title.ilike.%${slugText}%`,
              `title.ilike.%${looseTitleLike}%`,
              `title.ilike.%${foldedLooseTitleLike}%`,
              `original_title.ilike.%${slugText}%`,
              `original_title.ilike.%${looseTitleLike}%`,
              `original_title.ilike.%${foldedLooseTitleLike}%`,
              `title_english.ilike.%${slugText}%`,
              `title_english.ilike.%${looseTitleLike}%`,
              `title_english.ilike.%${foldedLooseTitleLike}%`,
              `title_romaji.ilike.%${slugText}%`,
              `title_romaji.ilike.%${looseTitleLike}%`,
              `title_romaji.ilike.%${foldedLooseTitleLike}%`,
              `title_native.ilike.%${slugText}%`,
              `title_native.ilike.%${looseTitleLike}%`,
              `title_native.ilike.%${foldedLooseTitleLike}%`,
            ].join(','),
          )
          .limit(25);

        if (error) {
          throw error;
        }
        const rows = Array.isArray(data) ? (data as unknown as MediaItem[]) : [];

        const filteredRows =
          category === 'anime' || category === 'manga'
            ? rows
            : rows.filter(row => row.status === 'published' || row.status === null);

        if (filteredRows.length === 0) {
          return null;
        }

        const ranked = filteredRows
          .map(item => ({ item, score: scoreSlugMatch(canonicalSlug, item) }))
          .sort((a, b) => b.score - a.score);

        return ranked[0]?.item ?? null;
      };

      if (isNumeric(slug)) {
        const numericId = Number(slug);
        const byId = await fetchById(numericId);
        if (byId) {
          return byId;
        }
        return fetchByExternalId(numericId);
      }

      const bySlug = await fetchBySlug();
      if (bySlug) {
        return bySlug;
      }
      return fetchByExternalId(slug);
    } catch (error) {
      console.error('Failed to fetch media item for detail page:', error);
      throw error;
    }
  },
  ['media-detail-by-category-slug'],
  { revalidate: MEDIA_REVALIDATE_SECONDS },
);

export async function fetchMediaItem(category: string, slug: string): Promise<MediaItem | null> {
  try {
    return await fetchPublishedMediaItemCached(category, slug);
  } catch {
    return null;
  }
}
