/**
 * The shared pipeline's shadow context, and the replay contract that makes it worth recording.
 *
 * The pipeline narrows discovery candidates *twice* — once before composing and once inside the
 * composition — and a replay that applied the narrowing only once would report picks the user could
 * never have been shown. The `composePossibleNext` block below is what catches that, and it is the
 * reason `discoveryPreselectLimit` is carried on the context at all.
 */

import {
  buildPipelineDiscoveryShortlist,
  selectPipelineDiscoveryPicks,
  PIPELINE_DISCOVERY_SHORTLIST_LIMIT,
  type PipelineContinuationContext,
} from '../pipeline/shadow-context';
import { composePossibleNext } from '../recommender';
import type { ScoredItem } from '../types';

function item(id: number, rawScore: number, clusterMatch: string | null = null): ScoredItem {
  return {
    mediaDbId: id,
    title: `Title ${id}`,
    cover: '',
    slug: `slug-${id}`,
    genres: [],
    themes: [],
    platforms: [],
    source: 'discovery',
    rawScore,
    confidence: rawScore / 100,
    clusterMatch,
    toneMatch: null,
    franchiseKey: null,
    matchedSignals: [],
    reason: '',
  };
}

function continuation(id: number): ScoredItem {
  return { ...item(id, 90), source: 'continuation', franchiseKey: `family-${id}` };
}

const CONTEXT: PipelineContinuationContext = {
  continuationSlotsUsed: 2,
  remainingDiscoverySlots: 2,
  discoveryPreselectLimit: 4,
  possibleNextLimit: 4,
};

describe('buildPipelineDiscoveryShortlist', () => {
  it('preserves the score order it was given', () => {
    const shortlist = buildPipelineDiscoveryShortlist([item(1, 90), item(2, 80), item(3, 70)]);

    expect(shortlist.map(entry => entry.item.mediaDbId)).toEqual([1, 2, 3]);
    expect(shortlist.map(entry => entry.deterministicRank)).toEqual([1, 2, 3]);
  });

  it('does not collapse candidates that share a cluster', () => {
    // Unlike the bespoke engines, this pipeline applies its diversity rule at selection time. A
    // shortlist collapsed here would hand the reranker a field the deterministic path never saw.
    const shortlist = buildPipelineDiscoveryShortlist([
      item(1, 90, 'epic-fantasy'),
      item(2, 80, 'epic-fantasy'),
    ]);

    expect(shortlist).toHaveLength(2);
  });

  it('caps the shortlist at the documented limit', () => {
    const many = Array.from({ length: PIPELINE_DISCOVERY_SHORTLIST_LIMIT + 7 }, (_unused, index) =>
      item(index + 1, 100 - index),
    );

    expect(buildPipelineDiscoveryShortlist(many)).toHaveLength(
      PIPELINE_DISCOVERY_SHORTLIST_LIMIT,
    );
  });
});

describe('selectPipelineDiscoveryPicks', () => {
  it('returns nothing when continuations consumed every slot', () => {
    expect(
      selectPipelineDiscoveryPicks([item(1, 90)], { ...CONTEXT, remainingDiscoverySlots: 0 }),
    ).toEqual([]);
  });

  it('respects the remaining slot budget', () => {
    const picks = selectPipelineDiscoveryPicks(
      [item(1, 90), item(2, 80), item(3, 70), item(4, 60)],
      CONTEXT,
    );

    expect(picks).toHaveLength(2);
  });

  it('prefers one pick per cluster before taking a second from any cluster', () => {
    const picks = selectPipelineDiscoveryPicks(
      [item(1, 90, 'a'), item(2, 88, 'a'), item(3, 70, 'b')],
      CONTEXT,
    );

    expect(picks.map(pick => pick.mediaDbId)).toEqual([1, 3]);
  });

  it('falls back to a same-cluster candidate rather than leaving a slot empty', () => {
    const picks = selectPipelineDiscoveryPicks([item(1, 90, 'a'), item(2, 88, 'a')], CONTEXT);

    expect(picks.map(pick => pick.mediaDbId)).toEqual([1, 2]);
  });

  it('does not mutate the ordering it was handed', () => {
    const ordered = [item(1, 90, 'a'), item(2, 88, 'a'), item(3, 70, 'b')];
    const snapshot = ordered.map(entry => entry.mediaDbId);

    selectPipelineDiscoveryPicks(ordered, CONTEXT);

    expect(ordered.map(entry => entry.mediaDbId)).toEqual(snapshot);
  });
});

describe('the replay reproduces what composePossibleNext served', () => {
  const CONTINUATION_SLOTS = 2;
  const DISCOVERY_SLOTS = 2;
  const POSSIBLE_NEXT_LIMIT = 4;

  function servedDiscoveryIds(continuations: ScoredItem[], discovery: ScoredItem[]) {
    // Exactly how the recommender composes: narrow first, then compose.
    const composed = composePossibleNext(
      continuations,
      selectPipelineDiscoveryPicks(discovery, {
        continuationSlotsUsed: 0,
        remainingDiscoverySlots: DISCOVERY_SLOTS * 2,
        discoveryPreselectLimit: DISCOVERY_SLOTS * 2,
        possibleNextLimit: POSSIBLE_NEXT_LIMIT,
      }),
      POSSIBLE_NEXT_LIMIT,
      CONTINUATION_SLOTS,
      DISCOVERY_SLOTS,
    );
    return composed.filter(entry => entry.source !== 'continuation').map(entry => entry.mediaDbId);
  }

  it.each([
    ['no continuations', [] as ScoredItem[]],
    ['one continuation', [continuation(900)]],
    ['both continuation slots filled', [continuation(900), continuation(901)]],
    ['more continuations than slots', [continuation(900), continuation(901), continuation(902)]],
  ])('matches the served discovery slots with %s', (_label, continuations) => {
    const discovery = [
      item(1, 95, 'a'),
      item(2, 90, 'a'),
      item(3, 85, 'b'),
      item(4, 80, 'c'),
      item(5, 75, 'c'),
      item(6, 70, 'd'),
    ];

    const continuationSlotsUsed = Math.min(continuations.length, CONTINUATION_SLOTS);
    const context: PipelineContinuationContext = {
      continuationSlotsUsed,
      remainingDiscoverySlots: POSSIBLE_NEXT_LIMIT - continuationSlotsUsed,
      discoveryPreselectLimit: DISCOVERY_SLOTS * 2,
      possibleNextLimit: POSSIBLE_NEXT_LIMIT,
    };

    const shortlist = buildPipelineDiscoveryShortlist(discovery);
    const replayed = selectPipelineDiscoveryPicks(
      shortlist.map(entry => entry.item),
      context,
    ).map(pick => pick.mediaDbId);

    expect(replayed).toEqual(servedDiscoveryIds(continuations, discovery));
  });
});
