/**
 * The anime shadow context, and the invariant that matters most about it.
 *
 * `selectAnimeDiscoveryPicks` was lifted out of the discovery fill loop so a blended ordering can
 * be replayed under the same rules the served picks went through. The risk in a lift like that is
 * not that the new function is wrong — it is that the *served* output changed while nobody was
 * looking. The last describe block is the one that would catch that.
 */

import {
  ANIME_DISCOVERY_SHORTLIST_LIMIT,
  buildAnimeRecommendations,
  collapseAnimeDiscoveryShortlist,
  selectAnimeDiscoveryPicks,
} from '../anime/anime-recommendation-engine';
import { getAnimeFranchiseKey } from '../anime/anime-normalizers';
import { buildAnimeTasteProfile } from '../anime/anime-taste-engine';
import type { ScoredAnimeCandidate } from '../anime/anime-types';
import type { MediaCandidate, MediaHistoryEntry } from '../types';

function candidate(id: number, title: string, genres: string[] = ['Action']): MediaCandidate {
  return {
    id,
    title,
    cover: '',
    slug: `anime-${id}`,
    category: 'anime',
    genres,
    themes: [],
    platforms: [],
    popularityScore: 0,
  };
}

function scored(id: number, title: string, score: number): ScoredAnimeCandidate {
  return { candidate: candidate(id, title), score, matchedSignals: [] };
}

function historyEntry(
  id: number,
  title: string,
  overrides: Partial<MediaHistoryEntry> = {},
): MediaHistoryEntry {
  return {
    id,
    mediaId: id,
    status: 'completed',
    score: 9,
    progress: 24,
    isFavorite: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    media: {
      id,
      title,
      category: 'anime',
      genres: ['Action', 'Drama'],
    },
    ...overrides,
  } as MediaHistoryEntry;
}

describe('collapseAnimeDiscoveryShortlist', () => {
  it('keeps the highest-scoring member of each franchise family', () => {
    const shortlist = collapseAnimeDiscoveryShortlist([
      scored(1, 'Attack on Titan Season 2', 90),
      scored(2, 'Attack on Titan Season 3', 88),
      scored(3, 'Mushishi', 70),
    ]);

    expect(shortlist.map(item => item.candidate.id)).toEqual([1, 3]);
    expect(shortlist[0].score).toBe(90);
  });

  it('assigns 1-based ranks over the collapsed list, not the input list', () => {
    const shortlist = collapseAnimeDiscoveryShortlist([
      scored(1, 'Attack on Titan Season 2', 90),
      scored(2, 'Attack on Titan Season 3', 88),
      scored(3, 'Mushishi', 70),
    ]);

    expect(shortlist.map(item => item.deterministicRank)).toEqual([1, 2]);
  });

  it('records the family key it collapsed on', () => {
    const shortlist = collapseAnimeDiscoveryShortlist([scored(1, 'Mushishi', 90)]);

    expect(shortlist[0].familyKey).toBe(getAnimeFranchiseKey('Mushishi'));
  });

  it('caps the shortlist at the documented limit', () => {
    const many = Array.from({ length: ANIME_DISCOVERY_SHORTLIST_LIMIT + 5 }, (_unused, index) =>
      scored(index + 1, `Distinct Series ${String.fromCharCode(65 + index)}`, 90 - index),
    );

    expect(collapseAnimeDiscoveryShortlist(many)).toHaveLength(ANIME_DISCOVERY_SHORTLIST_LIMIT);
  });
});

describe('selectAnimeDiscoveryPicks', () => {
  it('respects the remaining slot budget', () => {
    const picks = selectAnimeDiscoveryPicks(
      [scored(1, 'Monster', 90), scored(2, 'Mushishi', 85), scored(3, 'Pluto', 80)],
      new Set(),
      2,
    );

    expect(picks.map(item => item.candidate.id)).toEqual([1, 2]);
  });

  it('returns nothing when continuations consumed every slot', () => {
    expect(selectAnimeDiscoveryPicks([scored(1, 'Monster', 90)], new Set(), 0)).toEqual([]);
  });

  it('skips families a continuation already claimed', () => {
    const claimed = new Set([getAnimeFranchiseKey('Attack on Titan Season 3')]);
    const picks = selectAnimeDiscoveryPicks(
      [scored(1, 'Attack on Titan Season 2', 90), scored(2, 'Mushishi', 50)],
      claimed,
      2,
    );

    expect(picks.map(item => item.candidate.id)).toEqual([2]);
  });

  it('takes one entry per family even when the input was not collapsed', () => {
    const picks = selectAnimeDiscoveryPicks(
      [scored(1, 'Monster', 90), scored(2, 'Monster Part 2', 89), scored(3, 'Mushishi', 80)],
      new Set(),
      3,
    );

    expect(picks.map(item => item.candidate.id)).toEqual([1, 3]);
  });

  it('is pure: neither the candidate list nor the claimed-family set is mutated', () => {
    const candidates = [scored(1, 'Monster', 90), scored(2, 'Mushishi', 80)];
    const claimed = new Set<string>();

    selectAnimeDiscoveryPicks(candidates, claimed, 2);

    expect(candidates).toHaveLength(2);
    expect(claimed.size).toBe(0);
  });
});

describe('buildAnimeRecommendations', () => {
  const history = [
    historyEntry(101, 'Monster'),
    historyEntry(102, 'Mushishi'),
    historyEntry(103, 'Vinland Saga'),
    historyEntry(104, 'Steins;Gate'),
  ];
  const candidates = [
    candidate(201, 'Pluto'),
    candidate(202, 'Dorohedoro'),
    candidate(203, 'Kaiba'),
    candidate(204, 'Texhnolyze'),
    candidate(205, 'Shinsekai yori'),
  ];

  function build() {
    return buildAnimeRecommendations({
      history,
      backlog: [],
      databaseCandidates: candidates,
      taste: buildAnimeTasteProfile(history),
    });
  }

  it('reports a continuation context consistent with the picks it served', () => {
    const { possibleNext, shadowContext } = build();
    const continuations = possibleNext.filter(item => item.subtype === 'continuation');

    expect(shadowContext.continuationContext.continuationSlotsUsed).toBe(continuations.length);
    expect(shadowContext.continuationContext.remainingDiscoverySlots).toBe(
      shadowContext.continuationContext.possibleNextLimit - continuations.length,
    );
  });

  it('never carries more shortlist entries than the documented limit', () => {
    expect(build().shadowContext.discoveryShortlist.length).toBeLessThanOrEqual(
      ANIME_DISCOVERY_SHORTLIST_LIMIT,
    );
  });

  it('keeps the shortlist franchise-distinct', () => {
    const keys = build().shadowContext.discoveryShortlist.map(entry => entry.familyKey);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('serves discovery picks that replaying the shortlist reproduces exactly', () => {
    // The replay contract, asserted end to end: running the selection over the shortlist under the
    // reported continuation context must produce the discovery slots the user was actually shown.
    // If the two ever diverge, every shadow observation is comparing against the wrong baseline.
    const { possibleNext, shadowContext } = build();
    const servedDiscoveryIds = possibleNext
      .filter(item => item.subtype === 'discovery')
      .map(item => item.mediaId);

    const replayed = selectAnimeDiscoveryPicks(
      shadowContext.discoveryShortlist,
      new Set(shadowContext.continuationContext.chosenFamilyKeys),
      shadowContext.continuationContext.remainingDiscoverySlots,
    ).map(pick => pick.candidate.id);

    expect(replayed).toEqual(servedDiscoveryIds);
  });

  it('leaves the shadow context out of anything user-facing', () => {
    const { possibleNext, backlogPicks } = build();

    for (const item of [...possibleNext, ...backlogPicks]) {
      expect(item).not.toHaveProperty('familyKey');
      expect(item).not.toHaveProperty('deterministicRank');
    }
  });
});
