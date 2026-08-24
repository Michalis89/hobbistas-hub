import 'server-only';

import { isAiRerankShadowCategory } from '@/lib/ai/capabilities';
import type { GamesRerankShadowInput } from '@/lib/ai/categories/games/rerank/service';

/**
 * Routes a shadow rerank to the category that owns it.
 *
 * The composition root for Phase 2, and the only module that knows which categories have a
 * reranker. Kept out of `shared/` for the same reason as the taste dispatcher: shared
 * infrastructure that imports a category is no longer shared.
 *
 * The per-category context is deliberately *not* generalised into one "media shortlist" shape.
 * Games sends a scored discovery shortlist plus the continuation families the served response
 * already claimed, because that is what makes its observation comparable to what the user saw. A
 * category with a different selection model will need a different context, and the mapped type
 * below lets it declare one without games having to bend.
 */
export type RerankShadowContexts = {
  games: GamesRerankShadowInput;
};

export type RerankShadowCategory = keyof RerankShadowContexts;

const SHADOW_RUNNERS: {
  [C in RerankShadowCategory]: () => Promise<(context: RerankShadowContexts[C]) => Promise<void>>;
} = {
  games: async () => {
    const { runGamesRerankShadow } = await import('@/lib/ai/categories/games/rerank/service');
    return context => runGamesRerankShadow(context);
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
