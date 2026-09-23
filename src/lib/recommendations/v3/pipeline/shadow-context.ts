import type { ScoredItem } from '../types';
import { selectDiverseDiscovery } from './discovery-scorer';

/**
 * The shared pipeline's account of how it filled the discovery slots.
 *
 * One context for every adapter-driven category — manga, movies, tv, books — rather than one per
 * category, because unlike games and anime they genuinely do share a selection model: the same
 * cluster-diversity pass, the same slot arithmetic, the same double narrowing. A per-category copy
 * would be four identical files waiting to drift apart.
 *
 * Note the diversity rule here is *cluster* based, not franchise based. The bespoke engines dedupe
 * by franchise family; this one caps how many picks may come from the same taste cluster. That is
 * why this context carries no family keys and why replaying it means re-running
 * `selectDiverseDiscovery`, not a franchise loop.
 */

/**
 * How many score-sorted discovery candidates are carried on the shadow context.
 *
 * Twenty, matching games and anime. It is comfortably more than the selection can consume — the
 * pipeline narrows to four and then serves at most two — so replaying over the shortlist gives the
 * same answer as replaying over the full candidate list, while keeping the payload bounded.
 */
export const PIPELINE_DISCOVERY_SHORTLIST_LIMIT = 20;

export type PipelineDiscoveryShortlistEntry = {
  item: ScoredItem;
  deterministicRank: number;
};

/**
 * What the continuation half of `possibleNext` consumed, plus the pipeline's own narrowing.
 *
 * `discoveryPreselectLimit` is not decoration. The pipeline applies `selectDiverseDiscovery` twice
 * — once to narrow the field before composing, once again inside the composition — and a replay
 * that applied it only once would report picks the user could never have been shown.
 */
export type PipelineContinuationContext = {
  continuationSlotsUsed: number;
  remainingDiscoverySlots: number;
  discoveryPreselectLimit: number;
  possibleNextLimit: number;
};

export type PipelineShadowContext = {
  discoveryShortlist: PipelineDiscoveryShortlistEntry[];
  continuationContext: PipelineContinuationContext;
};

/**
 * Takes the head of the score-sorted discovery list.
 *
 * No collapsing, deliberately. The bespoke engines collapse by franchise family because their
 * selection loops do; this pipeline's only diversity rule is applied at selection time, so
 * collapsing here would hand the reranker a field the deterministic path never considered.
 */
export function buildPipelineDiscoveryShortlist(
  sortedCandidates: readonly ScoredItem[],
  limit: number = PIPELINE_DISCOVERY_SHORTLIST_LIMIT,
): PipelineDiscoveryShortlistEntry[] {
  return sortedCandidates
    .slice(0, limit)
    .map((item, index) => ({ item, deterministicRank: index + 1 }));
}

/**
 * Replays the pipeline's discovery selection over an arbitrary ordering of the same candidates.
 *
 * Mirrors `composePossibleNext` exactly: narrow to `discoveryPreselectLimit`, then fill
 * `remainingDiscoverySlots` from what survived. Pure and synchronous by contract — nothing here may
 * reach outside its arguments, which is what keeps an alternative ordering from ever influencing
 * the deterministic path.
 */
export function selectPipelineDiscoveryPicks(
  orderedCandidates: readonly ScoredItem[],
  continuationContext: PipelineContinuationContext,
): ScoredItem[] {
  if (continuationContext.remainingDiscoverySlots <= 0) {
    return [];
  }

  const narrowed = selectDiverseDiscovery(
    [...orderedCandidates],
    continuationContext.discoveryPreselectLimit,
  );

  return selectDiverseDiscovery(narrowed, continuationContext.remainingDiscoverySlots);
}
