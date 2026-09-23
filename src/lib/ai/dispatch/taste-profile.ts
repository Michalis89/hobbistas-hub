import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { isAiTasteSupportedCategory } from '@/lib/ai/capabilities';

/**
 * Routes a taste-profile request to the category that owns it.
 *
 * The composition root, deliberately not part of `shared/`: this is the one module allowed to
 * know which categories exist and how to reach their implementations. Everything under `shared/`
 * stays free of category imports so it cannot accumulate a hidden dependency on games.
 *
 * The generator is imported lazily. A category's taste module pulls in its evidence builder, its
 * Zod contract and its provider — none of which should load on a request for a different
 * category, or on a request that will be refused.
 */

/**
 * A generated profile, shaped only as far as the API layer cares about.
 *
 * Deliberately opaque: the API serialises it and the client renders whatever it was given, so
 * imposing a cross-category profile type here would force categories that reason differently to
 * pretend they reason like games. Each category owns its own enriched-profile type.
 */
export type AiTasteProfileResult = unknown;

const TASTE_GENERATORS: Record<
  string,
  () => Promise<
    (
      supabase: SupabaseClient<Database>,
      userId: string,
    ) => Promise<AiTasteProfileResult | null>
  >
> = {
  games: async () => {
    const { generateGameAiTasteProfile } = await import(
      '@/lib/ai/categories/games/taste/service'
    );
    return (supabase, userId) => generateGameAiTasteProfile(supabase, userId);
  },
  anime: async () => {
    const { generateAnimeAiTasteProfile } = await import(
      '@/lib/ai/categories/anime/taste/service'
    );
    return (supabase, userId) => generateAnimeAiTasteProfile(supabase, userId);
  },
  manga: async () => {
    const { generateMangaAiTasteProfile } = await import(
      '@/lib/ai/categories/manga/taste/service'
    );
    return (supabase, userId) => generateMangaAiTasteProfile(supabase, userId);
  },
  movies: async () => {
    const { generateMoviesAiTasteProfile } = await import(
      '@/lib/ai/categories/movies/taste/service'
    );
    return (supabase, userId) => generateMoviesAiTasteProfile(supabase, userId);
  },
  tv: async () => {
    const { generateTvAiTasteProfile } = await import('@/lib/ai/categories/tv/taste/service');
    return (supabase, userId) => generateTvAiTasteProfile(supabase, userId);
  },
  books: async () => {
    const { generateBooksAiTasteProfile } = await import(
      '@/lib/ai/categories/books/taste/service'
    );
    return (supabase, userId) => generateBooksAiTasteProfile(supabase, userId);
  },
};

/**
 * Generates (or returns the cached) taste profile for a category.
 *
 * Returns null without touching a provider, a cache or the network for any category the registry
 * does not mark as taste-supported. The registry check comes first and is not merely belt and
 * braces: it is what guarantees an unregistered category performs zero AI work even if a caller
 * forgets to gate its own request.
 */
export async function generateAiTasteProfileForCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
): Promise<AiTasteProfileResult | null> {
  if (!isAiTasteSupportedCategory(category)) {
    return null;
  }

  const load = TASTE_GENERATORS[category];
  if (!load) {
    // A category registered as supported with no generator behind it is a wiring mistake, not a
    // user-facing condition. Fail quietly rather than 500 — the dashboard degrades to no card.
    console.warn(`[ai-dispatch] no taste generator registered for category "${category}"`);
    return null;
  }

  const generate = await load();
  return generate(supabase, userId);
}
