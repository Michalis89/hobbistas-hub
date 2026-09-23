import { selectDiscoveryPicks } from '../games/games-recommendation-engine';
import { normalizeFranchiseFamilyKey } from '../games/games-normalizers';
import type { GameCandidate, ScoredGameCandidate } from '../games/games-types';

function scored(id: number, title: string, score: number): ScoredGameCandidate {
  const candidate: GameCandidate = {
    id,
    title,
    slug: `game-${id}`,
    genres: ['Role-playing (RPG)'],
    themes: [],
    platforms: ['PlayStation 5'],
    cover: '',
    popularityScore: 50,
  };

  return {
    candidate,
    score,
    confidence: Math.min(1, score / 100),
    matchedSignals: [],
    debug: {},
  };
}

describe('selectDiscoveryPicks', () => {
  it('takes candidates in the order given, up to the slot budget', () => {
    const picks = selectDiscoveryPicks(
      [
        scored(1, 'Kingdom Come: Deliverance II', 90),
        scored(2, 'Pathfinder: Wrath of the Righteous', 80),
        scored(3, 'Disco Elysium', 70),
      ],
      new Set(),
      2,
    );

    expect(picks.map(item => item.candidate.id)).toEqual([1, 2]);
  });

  it('keeps only the first candidate of each franchise family', () => {
    const picks = selectDiscoveryPicks(
      [
        scored(1, 'Mass Effect 2', 90),
        scored(2, 'Mass Effect 3', 88),
        scored(3, 'Pathfinder: Wrath of the Righteous', 70),
      ],
      new Set(),
      4,
    );

    expect(picks.map(item => item.candidate.id)).toEqual([1, 3]);
  });

  it('skips families already claimed by continuation picks', () => {
    const claimed = new Set([normalizeFranchiseFamilyKey('Mass Effect 2')]);
    const picks = selectDiscoveryPicks(
      [scored(1, 'Mass Effect 3', 90), scored(2, 'Kingdom Come: Deliverance II', 70)],
      claimed,
      4,
    );

    expect(picks.map(item => item.candidate.id)).toEqual([2]);
  });

  it('never mutates the caller-supplied family set', () => {
    const claimed = new Set(['already-claimed']);
    selectDiscoveryPicks([scored(1, 'Kingdom Come: Deliverance II', 70)], claimed, 4);

    expect(Array.from(claimed)).toEqual(['already-claimed']);
  });

  it('returns nothing when continuations already filled the slot budget', () => {
    expect(selectDiscoveryPicks([scored(1, 'Disco Elysium', 90)], new Set(), 0)).toEqual([]);
    expect(selectDiscoveryPicks([scored(1, 'Disco Elysium', 90)], new Set(), -1)).toEqual([]);
  });

  it('does not collapse candidates whose title yields no family key', () => {
    expect(normalizeFranchiseFamilyKey('???')).toBe('');

    const picks = selectDiscoveryPicks([scored(1, '???', 90), scored(2, '!!!', 80)], new Set(), 4);

    expect(picks).toHaveLength(2);
  });

  it('returns the same candidate objects it was given', () => {
    const first = scored(1, 'Disco Elysium', 90);
    const picks = selectDiscoveryPicks([first], new Set(), 1);

    expect(picks[0]).toBe(first);
  });
});
