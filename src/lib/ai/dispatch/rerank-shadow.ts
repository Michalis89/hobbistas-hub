import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { isAiRerankShadowCategory } from '@/lib/ai/capabilities';
import type { RecommendationShadowContext } from '@/lib/recommendations/v3/recommender';
import type { GamesRerankShadowInput } from '@/lib/ai/categories/games/rerank/service';
import type { AnimeRerankShadowInput } from '@/lib/ai/categories/anime/rerank/service';
import type { MangaRerankShadowInput } from '@/lib/ai/categories/manga/rerank/service';

/**
 * Routes a shadow rerank to the category that owns it.
 *
 * The composition root for Phase 2, and the only module that knows which categories have a
 * reranker. Kept out of `shared/` for the same reason as the taste dispatcher: shared
 * infrastructure that imports a category is no longer shared.
 *
 * The per-category context is deliberately *not* generalised into one "media shortlist" shape.
 * Each category sends the scored discovery shortlist its own engine produced plus the continuation
 * families the served response already claimed, because that is what makes its observation
 * comparable to what the user saw. A category with a different selection model will need a
 * different context, and the mapped type below lets it declare one without games having to bend.
 */
export type RerankShadowContexts = {
  games: GamesRerankShadowInput;
  anime: AnimeRerankShadowInput;
  manga: MangaRerankShadowInput;
};

export type RerankShadowCategory = keyof RerankShadowContexts;

const SHADOW_RUNNERS: {
  [C in RerankShadowCategory]: () => Promise<(context: RerankShadowContexts[C]) => Promise<void>>;
} = {
  games: async () => {
    const { runGamesRerankShadow } = await import('@/lib/ai/categories/games/rerank/service');
    return context => runGamesRerankShadow(context);
  },
  anime: async () => {
    const { runAnimeRerankShadow } = await import('@/lib/ai/categories/anime/rerank/service');
    return context => runAnimeRerankShadow(context);
  },
  manga: async () => {
    const { runMangaRerankShadow } = await import('@/lib/ai/categories/manga/rerank/service');
    return context => runMangaRerankShadow(context);
  },
};

/**
 * Runs one shadow rerank, if the category has one.
 *
 * Performs no provider call, no cache read, no cache write and no observation write for a
 * category the registry does not mark as shadow-enabled — the check happens before the runner is
 * even imported, so an unsupported category cannot reach provider code at all.
 *
 * Never throws and never returns anything the caller could act on. It runs after the user's
 * response has been flushed; its only outputs are a cache row and an observation.
 */
export async function dispatchRerankShadow<C extends RerankShadowCategory>(
  category: C | string,
  context: RerankShadowContexts[C],
): Promise<void> {
  if (!isAiRerankShadowCategory(category)) {
    return;
  }

  const load = SHADOW_RUNNERS[category as RerankShadowCategory];
  if (!load) {
    console.warn(`[ai-dispatch] no shadow reranker registered for category "${category}"`);
    return;
  }

  const run = (await load()) as (context: RerankShadowContexts[C]) => Promise<void>;
  await run(context);
}

export type RerankShadowServeRequest = {
  supabase: SupabaseClient<Database>;
  userId: string;
  /** Discovery media ids the user was actually shown, in slot order. */
  servedDiscoveryIds: readonly number[];
  /** What the engine reported about how it filled the discovery slots. */
  shadow: RecommendationShadowContext;
};

/**
 * Assembles a shadow input from a served recommendation response, then dispatches it.
 *
 * The switch lives here rather than in the route for two reasons. It is category knowledge, and
 * this module is where category knowledge is allowed to accumulate. And it is the only way to keep
 * the mapped-type registry honest: narrowing the tagged context inside a `case` is what lets the
 * compiler check each category's shortlist against that category's declared input, instead of
 * widening both into a union that would typecheck even when the pairing is wrong.
 */
export async function dispatchRerankShadowForServe({
  supabase,
  userId,
  servedDiscoveryIds,
  shadow,
}: RerankShadowServeRequest): Promise<void> {
  const base = { supabase, userId, servedDiscoveryIds };

  switch (shadow.category) {
    case 'games':
      await dispatchRerankShadow('games', {
        ...base,
        shortlist: shadow.context.discoveryShortlist,
        continuationContext: shadow.context.continuationContext,
      });
      return;
    case 'anime':
      await dispatchRerankShadow('anime', {
        ...base,
        shortlist: shadow.context.discoveryShortlist,
        continuationContext: shadow.context.continuationContext,
      });
      return;
    case 'manga':
      await dispatchRerankShadow('manga', {
        ...base,
        shortlist: shadow.context.discoveryShortlist,
        continuationContext: shadow.context.continuationContext,
      });
      return;
    default:
      // A pipeline category with no reranker registered yet — movies, tv, books. The capability
      // registry would refuse them anyway; falling through here means no module is even loaded.
      return;
  }
}
