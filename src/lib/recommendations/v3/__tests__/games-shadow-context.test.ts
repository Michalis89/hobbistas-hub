import {
  buildGamesRecommendations,
  collapseDiscoveryShortlist,
  selectDiscoveryPicks,
  DISCOVERY_SHORTLIST_LIMIT,
} from '../games/games-recommendation-engine';
import { normalizeFranchiseFamilyKey, normalizeGameIdentityKey } from '../games/games-normalizers';
import { buildBaselineInput } from '../__fixtures__/games-baseline';
import type { GameCandidate, ScoredGameCandidate } from '../games/games-types';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

function scored(id: number, title: string, score: number): ScoredGameCandidate {
  const candidate: GameCandidate = {
    id,
    title,
    slug: `game-${id}`,
    genres: [],
    themes: [],
    platforms: [],
    cover: '',
    popularityScore: 0,
  };
  return { candidate, score, confidence: score / 100, matchedSignals: [], debug: {} };
}

describe('collapseDiscoveryShortlist', () => {
  it('keeps the highest-scoring member of each franchise family', () => {
    const shortlist = collapseDiscoveryShortlist([
      scored(1, 'Mass Effect 2', 90),
      scored(2, 'Mass Effect 3', 88),
      scored(3, 'Disco Elysium', 70),
    ]);

    expect(shortlist.map(item => item.candidate.id)).toEqual([1, 3]);
    expect(shortlist[0].score).toBe(90);
  });

  it('assigns 1-based ranks over the collapsed list, not the input list', () => {
    const shortlist = collapseDiscoveryShortlist([
      scored(1, 'Mass Effect 2', 90),
      scored(2, 'Mass Effect 3', 88),
      scored(3, 'Disco Elysium', 70),
    ]);

    expect(shortlist.map(item => item.deterministicRank)).toEqual([1, 2]);
  });

  it('records the family key it collapsed on', () => {
    const shortlist = collapseDiscoveryShortlist([scored(1, 'Mass Effect 2', 90)]);

    expect(shortlist[0].familyKey).toBe(normalizeFranchiseFamilyKey('Mass Effect 2'));
  });

  it('keeps every candidate that yields no family key', () => {
    const shortlist = collapseDiscoveryShortlist([scored(1, '???', 90), scored(2, '!!!', 80)]);

    expect(shortlist).toHaveLength(2);
    expect(shortlist.every(item => item.familyKey === '')).toBe(true);
  });

  it('caps the shortlist at the configured limit', () => {
    // Trailing digits read as sequel numbers and collapse into one family, so the titles have to
    // differ by word, not by index.
    const many = Array.from({ length: 40 }, (_, index) =>
      scored(index + 1, `${LETTERS[index % LETTERS.length]}${'x'.repeat(1 + index)}`, 100 - index),
    );

    const shortlist = collapseDiscoveryShortlist(many);

    expect(new Set(shortlist.map(entry => entry.familyKey)).size).toBe(shortlist.length);
    expect(shortlist).toHaveLength(DISCOVERY_SHORTLIST_LIMIT);
  });
});

describe('games shadow context', () => {
  const input = buildBaselineInput();
  const result = buildGamesRecommendations(input);
  const { discoveryShortlist, continuationContext } = result.shadowContext;

  it('excludes every continuation from the shortlist', () => {
    const continuationIds = new Set(
      result.possibleNext.filter(item => item.subtype === 'continuation').map(item => item.mediaId),
    );

    expect(continuationIds.size).toBeGreaterThan(0);
    for (const entry of discoveryShortlist) {
      expect(continuationIds.has(entry.candidate.id)).toBe(false);
    }
  });

  it('excludes owned titles and edition variants of them', () => {
    const ownedIdentities = new Set(
      input.history.map(item => normalizeGameIdentityKey(item.media.title)).filter(Boolean),
    );

    for (const entry of discoveryShortlist) {
      const identity = normalizeGameIdentityKey(entry.candidate.title || entry.candidate.slug);
      expect(ownedIdentities.has(identity)).toBe(false);
    }
  });

  it('excludes planned/backlog titles', () => {
    const backlogIds = new Set(input.backlog.map(item => item.mediaId));

    for (const entry of discoveryShortlist) {
      expect(backlogIds.has(entry.candidate.id)).toBe(false);
    }
  });

  it('only contains candidates at or above the discovery floor, in descending score order', () => {
    expect(discoveryShortlist.length).toBeGreaterThan(0);

    for (const entry of discoveryShortlist) {
      expect(entry.score).toBeGreaterThanOrEqual(58);
    }

    const scores = discoveryShortlist.map(entry => entry.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('holds one entry per franchise family', () => {
    const families = discoveryShortlist.map(entry => entry.familyKey).filter(Boolean);

    expect(new Set(families).size).toBe(families.length);
  });

  it('reports the continuation slots and families the discovery fill had to respect', () => {
    const continuationPicks = result.possibleNext.filter(item => item.subtype === 'continuation');

    expect(continuationContext.continuationSlotsUsed).toBe(continuationPicks.length);
    expect(continuationContext.possibleNextLimit).toBe(4);
    expect(continuationContext.remainingDiscoverySlots).toBe(4 - continuationPicks.length);
    expect(continuationContext.chosenFamilyKeys).toEqual(
      continuationPicks.map(item => normalizeFranchiseFamilyKey(item.title)),
    );
  });

  it('reproduces the served discovery picks by replaying selectDiscoveryPicks on the shortlist', () => {
    const replayed = selectDiscoveryPicks(
      discoveryShortlist,
      new Set(continuationContext.chosenFamilyKeys),
      continuationContext.remainingDiscoverySlots,
    );

    const servedDiscoveryIds = result.possibleNext
      .filter(item => item.subtype === 'discovery')
      .map(item => item.mediaId);

    expect(replayed.map(item => item.candidate.id)).toEqual(servedDiscoveryIds);
  });
});
