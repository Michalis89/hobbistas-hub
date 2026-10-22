import type { ExternalIdValue, MediaPayload } from '../types';
import { MEDIA_CATEGORY_CONFIGS } from '../config';
import { EXTERNAL_API_REVALIDATE_SECONDS } from '@/lib/constants/cache';
import { cachedExternalFetch } from '@/lib/api-cache/external';
import { searchGoogleBooks } from '@/lib/books/googleBooks';
import {
  fetchOpenLibraryWork,
  openLibraryCoverUrl,
  searchOpenLibrary,
} from '@/lib/books/openLibrary';
import { fetchNlgRecord, searchNlg } from '@/lib/books/nlg';
import { coverExists, isUnverifiedCover } from '@/lib/books/covers';
import { isGreekIsbn, pickEditionIsbn } from '@/lib/books/isbn';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

/**
 * Fetches additional details from TMDB API for movies/TV shows
 * Enriches payload with runtime, genres, and image URLs
 *
 * @param category - 'movies' or 'tv'
 * @param tmdbId - TMDB ID
 * @returns Partial payload with enriched data
 *
 * Extracted from movies/add/route.ts (lines 39-79)
 */
export async function fetchTmdbDetails(
  category: string,
  tmdbId: number,
): Promise<Partial<MediaPayload>> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return {};
  }

  const base = category === 'movies' ? 'movie' : 'tv';
  const url = new URL(`https://api.themoviedb.org/3/${base}/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);

  try {
    const data = await cachedExternalFetch<{
      runtime?: number | null;
      episode_run_time?: number[] | null;
      number_of_seasons?: number | null;
      number_of_episodes?: number | null;
      genres?: { id: number; name: string }[] | null;
      poster_path?: string | null;
      backdrop_path?: string | null;
    }>({
      apiName: `tmdb-details-${category}`,
      endpoint: url.toString(),
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
    });

    const runtime =
      category === 'movies'
        ? (data.runtime ?? null)
        : Array.isArray(data.episode_run_time) && data.episode_run_time.length > 0
          ? (data.episode_run_time[0] ?? null)
          : null;

    return {
      runtime,
      number_of_seasons: data.number_of_seasons ?? null,
      number_of_episodes: data.number_of_episodes ?? null,
      genres: data.genres?.map(item => item.name) ?? [],
      cover_image_large: data.poster_path ? `${TMDB_IMAGE_BASE}w780${data.poster_path}` : null,
      cover_image_medium: data.poster_path ? `${TMDB_IMAGE_BASE}w342${data.poster_path}` : null,
      banner_image: data.backdrop_path ? `${TMDB_IMAGE_BASE}w1280${data.backdrop_path}` : null,
    };
  } catch (error) {
    console.error('TMDB fetch error:', error);
    return {};
  }
}

/**
 * Maps game payload with category-specific fields
 * Ensures all game-specific fields are properly mapped to media_items schema
 *
 * @param payload - Raw game payload from IGDB API
 * @returns Mapped payload ready for database insert
 *
 * Extracted from games/add/route.ts (lines 112-131)
 */
export function mapGamePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    category: 'games',
    source: 'igdb',
    title: payload.title,
    title_english: payload.title_english ?? payload.title,
    description: payload.description,
    summary: payload.summary,
    storyline: payload.storyline,
    cover_image_id: payload.cover_image_id,
    cover_url_thumb: payload.cover_url_thumb,
    cover_url_big: payload.cover_url_big,
    cover_image_large: payload.cover_image_large ?? payload.cover_url_big,
    cover_image_medium: payload.cover_image_medium ?? payload.cover_url_thumb,
    season_year: payload.season_year,
    first_release_date: payload.first_release_date,
    release_date: payload.release_date,
    rating: payload.rating,
    rating_count: payload.rating_count,
    aggregated_rating: payload.aggregated_rating,
    aggregated_rating_count: payload.aggregated_rating_count,
    igdb_themes: payload.igdb_themes,
    igdb_game_modes: payload.igdb_game_modes,
    igdb_player_perspectives: payload.igdb_player_perspectives,
    igdb_artwork_image_ids: payload.igdb_artwork_image_ids,
    igdb_screenshot_image_ids: payload.igdb_screenshot_image_ids,
    official_website: payload.official_website,
    genres: payload.genres,
    // Game-specific fields
    igdb_id: payload.igdb_id,
    igdb_category: payload.igdb_category,
    igdb_slug: payload.igdb_slug,
    igdb_updated_at: new Date().toISOString(),
    platforms: payload.platforms,
    developer: payload.developer,
    publisher: payload.publisher,
    runtime: payload.runtime,
  };
}

const isEmptyValue = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

/**
 * Enriches a new book before it is inserted into media_items, mixing what
 * each provider is good at into one row:
 *
 * 1. NLG catalogue record (Greek books): page count, publisher, subjects and
 *    ISBN from the full MARC record; the search result only had a summary.
 *    A Greek-ISBN book from another provider is matched to its record first.
 *    A cover URL built from an ISBN (NLG, Open Library by ISBN — used for
 *    Hardcover-only books) is kept only if the image really exists.
 * 2. Open Library work: description and subjects, which its search endpoint
 *    does not return.
 * 3. Google Books by ISBN: description and cover for the same edition, for a
 *    book that came from another provider. Google volumes are editions, so
 *    its id is stored too.
 * 4. Open Library by ISBN: a description, as a last resort. Its work id is
 *    not stored: an Open Library work groups every edition and language, and
 *    a Greek edition must not be folded into the English work's row.
 *
 * Only fills fields still empty; never overwrites. A provider that fails or
 * has nothing contributes nothing.
 */
export async function enrichBookPayload(
  _category: string,
  _externalId: ExternalIdValue,
  payload: MediaPayload,
): Promise<Partial<MediaPayload>> {
  const current: Record<string, unknown> = { ...payload };
  const result: Record<string, unknown> = {};
  const has = (field: string) => !isEmptyValue(current[field]);
  const set = (field: string, value: unknown) => {
    current[field] = value;
    result[field] = value;
  };
  const fill = (field: string, value: unknown) => {
    if (!has(field) && !isEmptyValue(value)) {
      set(field, value);
    }
  };
  const isbn13 = () => (typeof current.isbn_13 === 'string' ? current.isbn_13 : null);

  // 1. NLG record. A Greek book found through Google or Open Library is
  // looked up in the catalogue by ISBN first.
  let nlgId = typeof payload.nlg_id === 'number' ? payload.nlg_id : null;
  const initialIsbn = isbn13();
  if (!nlgId && initialIsbn && isGreekIsbn(initialIsbn)) {
    const [entry] = await searchNlg('', { limit: 1, isbn: initialIsbn });
    if (entry?.nlgId) {
      nlgId = entry.nlgId;
      set('nlg_id', entry.nlgId);
      fill('publisher', entry.publisher);
      fill('page_count', entry.pageCount);
    }
  }
  if (nlgId) {
    const record = await fetchNlgRecord(nlgId);
    if (record) {
      fill('isbn_13', pickEditionIsbn(record.isbns));
      fill('page_count', record.pageCount);
      fill('publisher', record.publisher);
      fill('description', record.summary);
      fill('genres', record.genres);
    }
  }
  // Covers built from an ISBN (NLG, Open Library by ISBN) may not exist
  if (isUnverifiedCover(current.cover_image_large)) {
    if (!(await coverExists(current.cover_image_large))) {
      set('cover_image_large', null);
      set('cover_image_medium', null);
    }
  }

  // 2. Open Library work
  const openLibraryId =
    typeof payload.open_library_id === 'string' ? payload.open_library_id : null;
  if (openLibraryId && (!has('description') || !has('genres') || !has('cover_image_large'))) {
    const work = await fetchOpenLibraryWork(openLibraryId);
    fill('description', work.description);
    fill('genres', work.subjects);
    if (work.coverId) {
      fill('cover_image_large', openLibraryCoverUrl(work.coverId, 'L'));
      fill('cover_image_medium', openLibraryCoverUrl(work.coverId, 'M'));
    }
  }

  // 3. Google Books, same edition
  const isbn = isbn13();
  if (isbn && !has('google_books_id') && (!has('description') || !has('cover_image_large'))) {
    const [edition] = await searchGoogleBooks('', { limit: 1, isbn });
    if (edition?.googleBooksId && edition.isbns.includes(isbn)) {
      fill('google_books_id', edition.googleBooksId);
      fill('description', edition.description);
      fill('cover_image_large', edition.coverLarge);
      fill('cover_image_medium', edition.coverSmall);
      fill('genres', edition.categories);
      fill('page_count', edition.pageCount);
    }
  }

  // 4. Open Library by ISBN, description only
  if (isbn && !has('description') && !openLibraryId) {
    const [work] = await searchOpenLibrary('', { limit: 1, isbn });
    if (work?.openLibraryId) {
      const details = await fetchOpenLibraryWork(work.openLibraryId);
      fill('description', details.description);
      fill('genres', details.subjects);
    }
  }

  return result as Partial<MediaPayload>;
}

/**
 * Initialize enrichers in category configs
 * Called automatically when this module is imported
 */
MEDIA_CATEGORY_CONFIGS.movies.enricher = (category, tmdbId) =>
  typeof tmdbId === 'number' ? fetchTmdbDetails(category, tmdbId) : Promise.resolve({});
MEDIA_CATEGORY_CONFIGS.books.enricher = enrichBookPayload;
MEDIA_CATEGORY_CONFIGS.games.payloadMapper = mapGamePayload;
