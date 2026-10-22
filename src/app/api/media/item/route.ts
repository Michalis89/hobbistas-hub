import { withApiRoute } from '@/lib/observability/withApiRoute';
import {
  isOpenLibraryWorkId,
  parseHardcoverExternalId,
  parseNlgExternalId,
} from '@/lib/books/identifiers';

import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { isMediaCategory } from '@/app/components/backlog/types';
import type { MediaItem } from '@/lib/media/types';

const selectFields =
  'id,category,title,original_title,title_english,title_romaji,title_native,description,summary,storyline,format,season_year,start_date,first_release_date,release_date,first_air_date,cover_image_id,cover_url_thumb,cover_url_big,cover_image_large,cover_image_medium,banner_image,genres,episodes,chapters,volumes,runtime,number_of_episodes,page_count,rating,rating_count,aggregated_rating,aggregated_rating_count,popularity,mal_id,tmdb_id,google_books_id,rawg_id,igdb_id,igdb_category,igdb_slug,platforms,developer,publisher,metacritic,esrb_rating,igdb_themes,igdb_game_modes,igdb_player_perspectives,igdb_artwork_image_ids,igdb_screenshot_image_ids,official_website,igdb_updated_at,websites';

const isNumeric = (value: string) => /^\d+$/.test(value);

const escapeLike = (value: string) => value.replace(/[%_]/g, match => `\\${match}`);

const toCanonicalSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

const foldPossessiveSlug = (value: string) => value.replace(/([a-z0-9])-s-(?=[a-z0-9])/g, '$1s-');

const buildSlugCandidates = (value: string): string[] => {
  const canonical = toCanonicalSlug(value);
  if (!canonical) {
    return [];
  }

  const folded = foldPossessiveSlug(canonical);
  return Array.from(new Set([canonical, folded].filter(Boolean)));
};

const toLooseTitleLikePattern = (canonicalSlug: string) => {
  const tokens = canonicalSlug.split('-').filter(Boolean).map(escapeLike);
  return tokens.join('%');
};

const collectCandidateSlugs = (item: MediaItem): string[] => {
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

const scoreSlugMatch = (target: string, item: MediaItem): number => {
  const slugs = collectCandidateSlugs(item);
  if (slugs.includes(target)) {
    return 1000;
  }

  // Prefer rows where one slug is a strict prefix/suffix variant
  // e.g. divinity-original-sin vs divinity-original-sin-enhanced-edition
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

async function fetchBySlug(category: string, slug: string) {
  const supabase = await createRouteHandlerClient();
  const isGamesCategory = category === 'games';
  const slugCandidates = buildSlugCandidates(slug);
  const canonicalSlug = slugCandidates[0] ?? '';
  const slugText = escapeLike(slug.replace(/[-_]/g, ' ').trim());
  if (!canonicalSlug && !slugText) {
    return null;
  }

  // Exact igdb_slug hit first (games only)
  if (isGamesCategory && slugCandidates.length > 0) {
    const { data: exactIgdbSlugMatches, error: exactIgdbSlugError } = await supabase
      .from('media_items')
      .select(selectFields)
      .eq('category', category)
      .in('igdb_slug', slugCandidates)
      .limit(10);

    if (exactIgdbSlugError) {
      throw exactIgdbSlugError;
    }
    const exactRows = Array.isArray(exactIgdbSlugMatches)
      ? (exactIgdbSlugMatches as unknown as MediaItem[])
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
  const foldedLooseSlugForLike = escapeLike(foldPossessiveSlug(canonicalSlug).replace(/-/g, '%'));
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
  if (rows.length === 0) {
    return null;
  }

  const ranked = rows
    .map(item => ({ item, score: scoreSlugMatch(canonicalSlug, item) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.item ?? null;
}

async function fetchById(category: string, id: number) {
  const supabase = await createRouteHandlerClient();
  const { data, error } = await supabase
    .from('media_items')
    .select(selectFields)
    .eq('category', category)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data as MediaItem | null;
}

async function fetchByExternalId(category: string, externalId: number | string) {
  const supabase = await createRouteHandlerClient();
  let query = supabase.from('media_items').select(selectFields).eq('category', category);

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
}

async function GETHandler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const slug = searchParams.get('slug');

    if (!category || !slug || !isMediaCategory(category)) {
      return NextResponse.json({ error: 'Invalid category or slug' }, { status: 400 });
    }

    let item: MediaItem | null = null;

    if (isNumeric(slug)) {
      const numericId = Number(slug);
      item = await fetchById(category, numericId);
      if (!item) {
        item = await fetchByExternalId(category, numericId);
      }
    } else {
      item = await fetchBySlug(category, slug);
      if (!item) {
        item = await fetchByExternalId(category, slug);
      }
    }

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Media item fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiRoute(GETHandler);
