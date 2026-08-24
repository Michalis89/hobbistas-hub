import { buildGameAiEvidenceDocument } from '../evidence';
import {
  calculateStrengthBand,
  calculateStrengthDiagnostics,
  validateAiGamingTasteProfile,
} from '../validation';
import type { AiGamingTasteProfile } from '../types';
import type { GameHistoryEntry } from '@/lib/recommendations/v3/games/games-types';

function entry(
  id: number,
  title: string,
  status: GameHistoryEntry['status'],
  score: number | null,
  favorite = false,
): GameHistoryEntry {
  return {
    id,
    mediaId: id,
    status,
    score,
    progress: null,
    priority: null,
    isFavorite: favorite,
    pinnedRank: null,
    updatedAt: '2026-08-22T00:00:00.000Z',
    selectedPlatform: 'PC',
    media: {
      id,
      title,
      genres: ['Role-playing (RPG)'],
      themes: ['Fantasy'],
      studios: ['Studio'],
      platforms: ['PC'],
      coverImageLarge: '',
      coverImageMedium: '',
    },
  };
}

function validProfile(overrides: Partial<AiGamingTasteProfile> = {}): AiGamingTasteProfile {
  return {
    schemaVersion: 1,
    identity: {
      label: 'Narrative Explorer',
      description: 'You gravitate toward authored worlds with mechanical depth.',
    },
    pillars: [
      {
        name: 'Story-rich RPGs',
        kind: 'content',
        description: 'Dense worlds and consequential character progression stand out.',
        evidenceTitles: ['Baldur’s Gate 3', 'The Witcher 3'],
      },
      {
        name: 'Atmospheric challenge',
        kind: 'content',
        description: 'Demanding dark fantasy appears as a secondary thread.',
        evidenceTitles: ['Bloodborne', 'Elden Ring'],
      },
    ],
    negativeSignals: [
      {
        name: 'Low patience for weak loops',
        description: 'Dropped evidence points away from low-fit progression loops.',
        evidenceTitles: ['Dropped Game'],
      },
    ],
    summary: 'Your strongest signal is authored RPG depth, with atmospheric challenge close behind.',
    openQuestions: [],
    ...overrides,
  };
}

describe('validateAiGamingTasteProfile', () => {
  const evidence = buildGameAiEvidenceDocument([
    entry(1, 'Baldur’s Gate 3', 'completed', 10, true),
    entry(2, 'The Witcher 3', 'completed', 9, true),
    entry(3, 'Bloodborne', 'completed', 9),
    entry(4, 'Elden Ring', 'completed', 8),
    entry(5, 'Dropped Game', 'dropped', 4),
  ]);

  it('rejects hallucinated evidence titles', () => {
    const result = validateAiGamingTasteProfile(
      validProfile({
        pillars: [
          {
            name: 'Invented',
            kind: 'content',
            description: 'Invalid citation.',
            evidenceTitles: ['Imaginary Game', 'The Witcher 3'],
          },
          validProfile().pillars[1],
        ],
      }),
      evidence,
    );

    expect(result.success).toBe(false);
  });

  it('rejects invalid negative evidence from high-rated favorites', () => {
    const result = validateAiGamingTasteProfile(
      validProfile({
        negativeSignals: [
          {
            name: 'Wrong negative',
            description: 'This should not be negative evidence.',
            evidenceTitles: ['Baldur’s Gate 3'],
          },
        ],
      }),
      evidence,
    );

    expect(result.success).toBe(false);
  });

  it('accepts valid structured output with real evidence titles', () => {
    const result = validateAiGamingTasteProfile(validProfile(), evidence);

    expect(result.success).toBe(true);
  });
});

describe('calculateStrengthBand', () => {
  it('keeps single-title pillars emerging and computes deterministic bands from mass', () => {
    const evidence = buildGameAiEvidenceDocument([
      entry(1, 'Baldur’s Gate 3', 'completed', 10, true),
      entry(2, 'The Witcher 3', 'completed', 9, true),
      entry(3, 'Bloodborne', 'completed', 8),
      entry(4, 'Small Signal', 'completed', 5),
    ]);

    expect(calculateStrengthBand(['Baldur’s Gate 3'], evidence)).toBe('Emerging');
    expect(calculateStrengthBand(['Baldur’s Gate 3', 'The Witcher 3'], evidence)).toBe(
      'Defining',
    );
    expect(calculateStrengthBand(['Bloodborne', 'Small Signal'], evidence)).toBe('Present');
  });

  it('deduplicates titles that map to the same collapsed evidence entry', () => {
    const evidence = buildGameAiEvidenceDocument([
      entry(1, 'Dark Souls', 'completed', 9),
      entry(2, 'Dark Souls Remastered', 'completed', 10),
      entry(3, 'Elden Ring', 'completed', 8),
      entry(4, 'Large Signal', 'completed', 10, true),
    ]);

    const diagnostics = calculateStrengthDiagnostics(['Dark Souls', 'Dark Souls Remastered'], evidence);

    expect(diagnostics.evidenceWeights).toEqual([
      expect.objectContaining({ title: 'Dark Souls', weight: 7 }),
      expect.objectContaining({ title: 'Dark Souls Remastered', weight: 7 }),
    ]);
    // Both titles collapse into the one `dark-souls` family, so the family is counted once:
    // representative 7 plus half of the 7 surplus the collapse would otherwise have discarded.
    expect(diagnostics.matchedTitleCount).toBe(2);
    expect(diagnostics.evidenceMass).toBe(10.5);
  });
});

describe('calculateStrengthDiagnostics denominator scale', () => {
  /**
   * Filler with alphabetic, non-numeric titles. A trailing number is stripped by
   * `normalizeFranchiseFamilyKey`, so numbered filler would collapse into one family.
   */
  function fillerTitle(index: number): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const first = alphabet[Math.floor(index / (26 * 26)) % 26];
    const second = alphabet[Math.floor(index / 26) % 26];
    const third = alphabet[index % 26];
    return `Filler ${first}${second}${third}`;
  }

  function filler(startId: number, count: number, score: number): GameHistoryEntry[] {
    return Array.from({ length: count }, (_, index) =>
      entry(startId + index, fillerTitle(startId + index), 'completed', score),
    );
  }

  function largeLibrary(): GameHistoryEntry[] {
    return [
      entry(1, 'Baldurs Gate 3', 'completed', 10, true),
      entry(2, 'The Witcher 3', 'completed', 10, true),
      entry(3, 'Red Dead Redemption 2', 'completed', 9.5, true),
      entry(4, 'Final Fantasy X', 'completed', 9, true),
      entry(5, 'Bloodborne', 'completed', 9.5, true),
      entry(6, 'Elden Ring', 'completed', 9),
      entry(7, 'Demons Souls', 'completed', 9),
      entry(8, 'Sekiro', 'completed', 9),
      // ~110 further entries, the shape that used to bury every pillar under the denominator.
      ...filler(100, 30, 8),
      ...filler(200, 40, 7),
      ...filler(300, 40, 5),
    ];
  }

  it('lets a four-favorite pillar reach Strong in a large library', () => {
    const evidence = buildGameAiEvidenceDocument(largeLibrary());
    expect(evidence.dataQuality.titleCount).toBeGreaterThan(110);

    const pillar = ['Baldurs Gate 3', 'The Witcher 3', 'Red Dead Redemption 2', 'Final Fantasy X'];
    const diagnostics = calculateStrengthDiagnostics(pillar, evidence);

    // Four favorites at weight 10 against a denominator drawn from the 12 strongest entries.
    expect(diagnostics.evidenceMass).toBe(40);
    expect(diagnostics.referenceEntryCount).toBe(12);
    expect(diagnostics.share).toBeGreaterThanOrEqual(0.35);
    expect(calculateStrengthBand(pillar, evidence)).toBe('Strong');
  });

  it('does not degrade a pillar when many weak positive entries are added', () => {
    const core = largeLibrary();
    const pillar = ['Bloodborne', 'Elden Ring', 'Demons Souls', 'Sekiro'];

    const baseEvidence = buildGameAiEvidenceDocument(core);
    const paddedEvidence = buildGameAiEvidenceDocument([...core, ...filler(9000, 200, 7)]);
    expect(paddedEvidence.dataQuality.titleCount).toBeGreaterThan(
      baseEvidence.dataQuality.titleCount + 190,
    );

    const before = calculateStrengthDiagnostics(pillar, baseEvidence);
    const after = calculateStrengthDiagnostics(pillar, paddedEvidence);

    expect(after.referenceMass).toBe(before.referenceMass);
    expect(after.share).toBe(before.share);
    expect(calculateStrengthBand(pillar, paddedEvidence)).toBe(
      calculateStrengthBand(pillar, baseEvidence),
    );
  });

  it('caps the denominator at the twelve strongest positive entries', () => {
    const evidence = buildGameAiEvidenceDocument(largeLibrary());
    const libraryPositiveMass = evidence.entries
      .filter(item => item.weight > 0)
      .reduce((sum, item) => sum + item.weight, 0);
    const diagnostics = calculateStrengthDiagnostics(['Bloodborne', 'Elden Ring'], evidence);

    expect(diagnostics.referenceEntryCount).toBe(12);
    // Five favorites at 10, three 9-scored completions at 7, then four 8-scored fillers at 5.
    expect(diagnostics.referenceMass).toBe(91);
    // The old denominator was every positive entry in the library, here nearly four times larger.
    expect(libraryPositiveMass).toBeGreaterThan(diagnostics.referenceMass * 3);
  });

  it('credits repeated franchise completions sublinearly from franchise positiveMass', () => {
    const evidence = buildGameAiEvidenceDocument([
      entry(1, 'The Last of Us Part I', 'completed', 9.5, true),
      entry(2, 'The Last of Us Part II', 'completed', 9, true),
      entry(3, 'Unrelated Game', 'completed', 8),
    ]);

    const franchise = evidence.franchises.find(item => item.franchiseKey === 'last-us');
    expect(franchise?.positiveMass).toBe(20);
    // Collapse keeps one entry at weight 10; the family's other favorite is not discarded.
    expect(evidence.entries.find(item => item.franchiseKey === 'last-us')?.weight).toBe(10);

    const diagnostics = calculateStrengthDiagnostics(['The Last of Us Part I'], evidence);
    // Sublinear: above the collapsed 10, below the linear 20.
    expect(diagnostics.evidenceMass).toBe(15);
    expect(diagnostics.evidenceWeights[0]).toEqual(
      expect.objectContaining({ weight: 10, citedMass: 15 }),
    );
  });

  it('leaves single-entry franchises at their representative weight', () => {
    const evidence = buildGameAiEvidenceDocument([
      entry(1, 'Solo Title', 'completed', 9, true),
      entry(2, 'Another Title', 'completed', 8),
    ]);

    const diagnostics = calculateStrengthDiagnostics(['Solo Title'], evidence);

    expect(diagnostics.evidenceWeights[0]).toEqual(
      expect.objectContaining({ weight: 10, citedMass: 10 }),
    );
  });

  it('keeps small libraries on the full positive mass', () => {
    const evidence = buildGameAiEvidenceDocument([
      entry(1, 'Baldurs Gate 3', 'completed', 10, true),
      entry(2, 'The Witcher 3', 'completed', 9, true),
      entry(3, 'Bloodborne', 'completed', 8),
      entry(4, 'Small Signal', 'completed', 5),
    ]);

    const diagnostics = calculateStrengthDiagnostics(['Bloodborne', 'Small Signal'], evidence);

    // Fewer than twelve positive entries, so nothing is trimmed: 10 + 10 + 5 + 0.5.
    expect(diagnostics.referenceEntryCount).toBe(4);
    expect(diagnostics.referenceMass).toBe(25.5);
    expect(calculateStrengthBand(['Bloodborne', 'Small Signal'], evidence)).toBe('Present');
  });

  it('returns Emerging when no positive evidence exists', () => {
    const evidence = buildGameAiEvidenceDocument([
      entry(1, 'Dropped One', 'dropped', 3),
      entry(2, 'Dropped Two', 'dropped', 2),
    ]);

    expect(
      calculateStrengthDiagnostics(['Dropped One', 'Dropped Two'], evidence).referenceMass,
    ).toBe(0);
    expect(calculateStrengthBand(['Dropped One', 'Dropped Two'], evidence)).toBe('Emerging');
  });
});
