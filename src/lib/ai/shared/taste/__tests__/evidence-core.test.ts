/**
 * The shared evidence primitives: the ladder, the aversion grader, the family merger, the bands.
 *
 * These are the pieces six categories now depend on, so the tests here are about the *rules* rather
 * than any category's numbers. The rule that matters most is the one separating a contradiction from
 * a failure to support: only the first may cost a whole generation.
 */

import {
  computeLadderWeight,
  computeSufficiency,
  mergeScore,
  type EvidenceWeightTable,
} from '../evidence-core';
import {
  classifyNegativeEvidence,
  gradeAversionEvidence,
  isSupportedNegativeSignal,
} from '../negative-evidence';
import { buildFamilyPrefixAliases, stripTrailingYear } from '../family';
import { calculateStrengthBand, calculateStrengthDiagnostics } from '../strength';
import type { TasteEvidenceEntryCore } from '../evidence-core';

const TABLE: EvidenceWeightTable = {
  completedFavoriteTopScore: 12,
  completedFavorite: 10,
  completedScore9: 9,
  completedScore8: 7,
  completedScore7: 5,
  completedScore5: 2.5,
  completedScore4OrLower: 1.5,
  completedUnrated: 4,
  currentDeep: 3,
  currentPartial: 1.5,
  currentEarly: 0.75,
  droppedLate: 1,
  droppedEarly: 0.4,
};

describe('computeLadderWeight', () => {
  it('puts a favourited top-rated finish at the top of the ladder', () => {
    expect(
      computeLadderWeight(
        { status: 'completed', score: 10, favorite: true, progressRatio: 1 },
        TABLE,
      ),
    ).toBe(TABLE.completedFavoriteTopScore);
  });

  it('ranks a favourite above any unfavourited score', () => {
    const favourite = computeLadderWeight(
      { status: 'completed', score: 7, favorite: true, progressRatio: 1 },
      TABLE,
    );
    const rated = computeLadderWeight(
      { status: 'completed', score: 9, favorite: false, progressRatio: 1 },
      TABLE,
    );
    expect(favourite).toBeGreaterThan(rated);
  });

  it('treats an unrated finish as mildly positive, not as nothing', () => {
    const unrated = computeLadderWeight(
      { status: 'completed', score: null, favorite: false, progressRatio: 1 },
      TABLE,
    );
    expect(unrated).toBe(TABLE.completedUnrated);
    expect(unrated).toBeGreaterThan(TABLE.completedScore5);
  });

  it('never returns a negative weight for an abandonment', () => {
    // A rejection travels on the aversion channel. Folding it into the weight as a negative number
    // would let two abandonments cancel out a favourite, which is not what abandoning means.
    for (const progressRatio of [null, 0, 0.1, 0.9]) {
      expect(
        computeLadderWeight({ status: 'dropped', score: 2, favorite: false, progressRatio }, TABLE),
      ).toBeGreaterThan(0);
    }
  });

  it('rewards depth for an in-progress entry', () => {
    const deep = computeLadderWeight(
      { status: 'current', score: null, favorite: false, progressRatio: 0.8 },
      TABLE,
    );
    const early = computeLadderWeight(
      { status: 'current', score: null, favorite: false, progressRatio: 0.05 },
      TABLE,
    );
    expect(deep).toBeGreaterThan(early);
  });

  it('treats unknown progress as early rather than deep', () => {
    expect(
      computeLadderWeight(
        { status: 'current', score: null, favorite: false, progressRatio: null },
        TABLE,
      ),
    ).toBe(TABLE.currentEarly);
  });
});

describe('classifyNegativeEvidence', () => {
  const base = { status: 'dropped' as const, score: null, favorite: false, nearlyFinished: false };

  it('treats a favourite as a contradiction, whatever else is true of it', () => {
    expect(classifyNegativeEvidence({ ...base, favorite: true })).toBe('contradictory');
    expect(
      classifyNegativeEvidence({ ...base, status: 'completed', score: 2, favorite: true }),
    ).toBe('contradictory');
  });

  it('treats a high rating as a contradiction', () => {
    expect(classifyNegativeEvidence({ ...base, score: 8 })).toBe('contradictory');
  });

  it('treats something still in progress as unusable, not contradictory', () => {
    // Nothing to cite yet is different from the opposite of what the user said, and only the second
    // may cost a whole generation.
    expect(classifyNegativeEvidence({ ...base, status: 'current' })).toBe('unusable');
  });

  it('treats a low rating as a clear dislike whether finished or abandoned', () => {
    expect(classifyNegativeEvidence({ ...base, score: 4 })).toBe('strong');
    expect(classifyNegativeEvidence({ ...base, status: 'completed', score: 4 })).toBe('strong');
  });

  it('treats a finished, unrated entry as saying nothing', () => {
    expect(classifyNegativeEvidence({ ...base, status: 'completed', score: null })).toBe('unusable');
  });

  it('treats a lukewarm finish as weak rather than nothing', () => {
    expect(classifyNegativeEvidence({ ...base, status: 'completed', score: 6 })).toBe('ambiguous');
  });

  it('reads an unrated abandonment by where it stopped', () => {
    expect(classifyNegativeEvidence({ ...base, nearlyFinished: false })).toBe('usable');
    expect(classifyNegativeEvidence({ ...base, nearlyFinished: true })).toBe('ambiguous');
  });

  it('treats unknown progress on an abandonment as an early one', () => {
    expect(classifyNegativeEvidence({ ...base, nearlyFinished: null })).toBe('usable');
  });
});

describe('gradeAversionEvidence', () => {
  it('collapses the five strengths into the three grades the model is shown', () => {
    const base = { status: 'dropped' as const, score: null, favorite: false, nearlyFinished: false };
    expect(gradeAversionEvidence(base)).toBe('clear');
    expect(gradeAversionEvidence({ ...base, score: 3 })).toBe('clear');
    expect(gradeAversionEvidence({ ...base, nearlyFinished: true })).toBe('weak');
    expect(gradeAversionEvidence({ ...base, status: 'current' })).toBe('none');
    expect(gradeAversionEvidence({ ...base, favorite: true })).toBe('none');
  });
});

describe('isSupportedNegativeSignal', () => {
  it('refuses an empty signal', () => {
    expect(isSupportedNegativeSignal([])).toBe(false);
  });

  it('refuses a signal containing a contradiction or an unusable citation', () => {
    expect(isSupportedNegativeSignal(['strong', 'contradictory'])).toBe(false);
    expect(isSupportedNegativeSignal(['strong', 'unusable'])).toBe(false);
  });

  it('refuses a signal carried entirely by weak citations', () => {
    expect(isSupportedNegativeSignal(['ambiguous', 'ambiguous'])).toBe(false);
  });

  it('accepts weak citations that corroborate a clear one', () => {
    expect(isSupportedNegativeSignal(['strong', 'ambiguous'])).toBe(true);
    expect(isSupportedNegativeSignal(['usable', 'usable', 'ambiguous'])).toBe(true);
  });

  it('refuses a signal where the weak citations outnumber the clear ones', () => {
    expect(isSupportedNegativeSignal(['strong', 'ambiguous', 'ambiguous'])).toBe(false);
  });
});

describe('computeSufficiency', () => {
  const floors = { minTitleCount: 7, richTitleCount: 15, richRatedRatio: 0.4 };

  it('calls a library sparse below its own floor', () => {
    expect(computeSufficiency({ titleCount: 6, ratedRatio: 1, ...floors })).toBe('sparse');
  });

  it('calls a library adequate at its floor', () => {
    expect(computeSufficiency({ titleCount: 7, ratedRatio: 0, ...floors })).toBe('adequate');
  });

  it('requires both size and rating coverage to be rich', () => {
    expect(computeSufficiency({ titleCount: 20, ratedRatio: 0.2, ...floors })).toBe('adequate');
    expect(computeSufficiency({ titleCount: 20, ratedRatio: 0.5, ...floors })).toBe('rich');
  });
});

describe('mergeScore', () => {
  it('keeps the better verdict on the same work', () => {
    expect(mergeScore(6, 9)).toBe(9);
    expect(mergeScore(null, 7)).toBe(7);
    expect(mergeScore(7, null)).toBe(7);
    expect(mergeScore(null, null)).toBeNull();
  });
});

describe('buildFamilyPrefixAliases', () => {
  it('merges a longer key into a shorter one present in the same library', () => {
    const aliases = buildFamilyPrefixAliases(['the-lord-of-the-rings', 'the-lord-of-the-rings-extras']);
    expect(aliases.get('the-lord-of-the-rings-extras')).toBe('the-lord-of-the-rings');
  });

  it('leaves a key alone when its root is not in the library', () => {
    const aliases = buildFamilyPrefixAliases(['the-lord-of-the-rings-extras']);
    expect(aliases.get('the-lord-of-the-rings-extras')).toBe('the-lord-of-the-rings-extras');
  });

  it('requires a separator, so a shared prefix of one word cannot swallow a title', () => {
    const aliases = buildFamilyPrefixAliases(['star-warships', 'star-warship-crews']);
    expect(aliases.get('star-warships')).toBe('star-warships');
  });

  it('refuses to merge on a prefix shorter than the minimum', () => {
    const aliases = buildFamilyPrefixAliases(['dune', 'dune-messiah']);
    expect(aliases.get('dune-messiah')).toBe('dune-messiah');
  });

  it('resolves a chain to one root in a single pass', () => {
    const aliases = buildFamilyPrefixAliases([
      'the-wheel-of-time',
      'the-wheel-of-time-new-spring',
      'the-wheel-of-time-new-spring-extras',
    ]);
    expect(aliases.get('the-wheel-of-time-new-spring-extras')).toBe('the-wheel-of-time');
  });
});

describe('stripTrailingYear', () => {
  it('strips a trailing year in any bracket style', () => {
    expect(stripTrailingYear('Dune (2021)')).toBe('Dune');
    expect(stripTrailingYear('Dune [1984]')).toBe('Dune');
    expect(stripTrailingYear('Dune 2021')).toBe('Dune');
  });

  it('leaves a leading year alone', () => {
    expect(stripTrailingYear('2001: A Space Odyssey')).toBe('2001: A Space Odyssey');
  });

  it('never reduces a title to nothing', () => {
    expect(stripTrailingYear('1984')).toBe('1984');
  });
});

describe('calculateStrengthBand', () => {
  function entry(title: string, familyKey: string, weight: number): TasteEvidenceEntryCore {
    return {
      identityKey: title.toLowerCase(),
      familyKey,
      representativeTitle: title,
      titles: [title],
      status: 'completed',
      score: 9,
      favorite: false,
      labels: [],
      aversionEvidence: 'none',
      weight,
    };
  }

  const entries = [
    entry('Alpha', 'a', 10),
    entry('Beta', 'b', 8),
    entry('Gamma', 'c', 6),
    entry('Delta', 'd', 4),
  ];

  it('bands a pillar that accounts for most of the reference mass as Defining', () => {
    expect(calculateStrengthBand(['Alpha', 'Beta'], { entries })).toBe('Defining');
  });

  it('bands a pillar built from the library tail low', () => {
    expect(calculateStrengthBand(['Gamma', 'Delta'], { entries })).toBe('Strong');
  });

  it('refuses to band a single citation above Emerging, however heavy', () => {
    // One resolved title is an anecdote, not a pattern.
    expect(calculateStrengthBand(['Alpha'], { entries })).toBe('Emerging');
  });

  it('returns Emerging when nothing resolves', () => {
    expect(calculateStrengthBand(['Nonexistent', 'Also Nonexistent'], { entries })).toBe('Emerging');
  });

  it('counts two citations that collapsed into one entry once', () => {
    const merged: TasteEvidenceEntryCore[] = [
      { ...entry('Alpha', 'a', 10), titles: ['Alpha', 'Alpha Extended Cut'] },
      entry('Beta', 'b', 8),
    ];
    const diagnostics = calculateStrengthDiagnostics(['Alpha', 'Alpha Extended Cut'], {
      entries: merged,
    });

    expect(diagnostics.matchedTitleCount).toBe(1);
    expect(diagnostics.evidenceMass).toBe(10);
  });

  it('reports how many distinct families a pillar drew on', () => {
    const diagnostics = calculateStrengthDiagnostics(['Alpha', 'Beta'], { entries });
    expect(diagnostics.familyCount).toBe(2);
  });

  it('honours a category damping hook', () => {
    const halved = calculateStrengthDiagnostics(['Alpha', 'Beta'], {
      entries,
      resolveCitedMass: item => item.weight / 2,
    });
    const plain = calculateStrengthDiagnostics(['Alpha', 'Beta'], { entries });

    expect(halved.evidenceMass).toBe(plain.evidenceMass / 2);
    // Share is unchanged: the denominator is damped the same way.
    expect(halved.share).toBeCloseTo(plain.share, 5);
  });
});
