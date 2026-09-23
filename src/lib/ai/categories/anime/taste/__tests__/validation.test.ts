/** @jest-environment node */

jest.mock('server-only', () => ({}), { virtual: true });

import { ANIME_FIXTURE_HISTORY, animeEntry } from '../../__fixtures__/anime-history.fixture';
import { buildAnimeAiEvidenceDocument } from '../evidence';
import { getGeminiAnimeTasteResponseSchema } from '../provider';
import {
  AiAnimeTasteProfileSchema,
  ANIME_AI_TASTE_LIST_LIMITS,
  ANIME_AI_TASTE_TEXT_LIMITS,
  type AiAnimeTasteProfile,
} from '../types';
import {
  calculateAnimeStrengthBand,
  calculateAnimeStrengthDiagnostics,
  classifyAnimeNegativeEvidence,
  enrichAiAnimeTasteProfile,
  isSupportedAnimeNegativeSignal,
  validateAiAnimeTasteProfile,
} from '../validation';

const evidence = buildAnimeAiEvidenceDocument(ANIME_FIXTURE_HISTORY);

function profile(overrides: Partial<AiAnimeTasteProfile> = {}): AiAnimeTasteProfile {
  return {
    schemaVersion: 1,
    identity: { label: 'Bleak Historical Drama', description: 'Prefers weight over spectacle.' },
    pillars: [
      {
        name: 'Consequence-driven violence',
        kind: 'content',
        description: 'Violence that costs the characters something.',
        evidenceTitles: ['Vinland Saga', 'Attack on Titan'],
      },
      {
        name: 'Long-form serialisation',
        kind: 'form',
        description: 'Follows arcs that build across dozens of episodes.',
        evidenceTitles: ['Monster', 'Steins;Gate'],
      },
    ],
    negativeSignals: [],
    summary: 'Follows long, sombre stories where violence carries consequence.',
    openQuestions: [],
    ...overrides,
  };
}

describe('schema contract parity', () => {
  /**
   * A bound Zod enforces but the provider schema omits is a bound the decoder never applies, so
   * the model overruns it and the whole generation is discarded. These assertions are what stop
   * the two sides drifting.
   */
  const schema = getGeminiAnimeTasteResponseSchema();

  it('accepts a well-formed anime profile', () => {
    expect(AiAnimeTasteProfileSchema.safeParse(profile()).success).toBe(true);
  });

  it('pins the same character bounds on both sides', () => {
    expect(schema.properties.identity.properties.label.maxLength).toBe(
      ANIME_AI_TASTE_TEXT_LIMITS.identityLabel,
    );
    expect(schema.properties.summary.maxLength).toBe(ANIME_AI_TASTE_TEXT_LIMITS.summary);
    expect(schema.properties.pillars.items.properties.description.maxLength).toBe(
      ANIME_AI_TASTE_TEXT_LIMITS.description,
    );
    expect(schema.properties.openQuestions.items.maxLength).toBe(
      ANIME_AI_TASTE_TEXT_LIMITS.openQuestion,
    );
  });

  it('pins the same list bounds on both sides', () => {
    expect(schema.properties.pillars.minItems).toBe(ANIME_AI_TASTE_LIST_LIMITS.pillarsMin);
    expect(schema.properties.pillars.maxItems).toBe(ANIME_AI_TASTE_LIST_LIMITS.pillarsMax);
    expect(schema.properties.pillars.items.properties.evidenceTitles.minItems).toBe(
      ANIME_AI_TASTE_LIST_LIMITS.pillarEvidenceMin,
    );
    expect(schema.properties.negativeSignals.maxItems).toBe(
      ANIME_AI_TASTE_LIST_LIMITS.negativeSignalsMax,
    );
  });

  it('uses the anime pillar vocabulary, not the games one', () => {
    // `form`, not `behavior`: a viewer has no play behaviour, and forcing structural observations
    // about pacing or serialisation under "behaviour" would mislabel them.
    expect(schema.properties.pillars.items.properties.kind.enum).toEqual(['content', 'form']);
    expect(AiAnimeTasteProfileSchema.safeParse(
      profile({
        pillars: [
          { ...profile().pillars[0], kind: 'behavior' as unknown as 'content' },
          profile().pillars[1],
        ],
      }),
    ).success).toBe(false);
  });

  it('rejects a summary that overruns the shared bound', () => {
    const result = validateAiAnimeTasteProfile(
      profile({ summary: 'x'.repeat(ANIME_AI_TASTE_TEXT_LIMITS.summary + 1) }),
      evidence,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.category).toBe('schema');
  });
});

describe('evidence grounding', () => {
  it('accepts a profile whose citations all exist in the library', () => {
    expect(validateAiAnimeTasteProfile(profile(), evidence).success).toBe(true);
  });

  it('resolves a cited season back to its collapsed family entry', () => {
    const result = validateAiAnimeTasteProfile(
      profile({
        pillars: [
          {
            ...profile().pillars[0],
            evidenceTitles: ['Attack on Titan Season 2', 'Vinland Saga'],
          },
          profile().pillars[1],
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(true);
  });

  it('rejects a hallucinated title', () => {
    const result = validateAiAnimeTasteProfile(
      profile({
        pillars: [
          { ...profile().pillars[0], evidenceTitles: ['Vinland Saga', 'A Show That Does Not Exist'] },
          profile().pillars[1],
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.reason).toBe('hallucinated_pillar_evidence');
  });

  it('rejects a pillar built entirely from one franchise', () => {
    // Two citations, both Attack on Titan seasons: that describes a series, not a pattern.
    const result = validateAiAnimeTasteProfile(
      profile({
        pillars: [
          {
            ...profile().pillars[0],
            evidenceTitles: ['Attack on Titan', 'Attack on Titan Season 2'],
          },
          profile().pillars[1],
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.reason).toBe('single_franchise_pillar');
  });

  it('rejects an identity label longer than four words', () => {
    const result = validateAiAnimeTasteProfile(
      profile({
        identity: { label: 'One Two Three Four Five', description: 'Too many words.' },
      }),
      evidence,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.category).toBe('content');
  });
});

describe('negative signal grading', () => {
  const entryFor = (title: string) => {
    const found = evidence.entries.find(entry => entry.titles.includes(title));
    if (!found) {
      throw new Error(`fixture missing ${title}`);
    }
    return found;
  };

  it('treats an early unrated bail as usable aversion evidence', () => {
    expect(classifyAnimeNegativeEvidence(entryFor('Sword Art Online'))).toBe('usable');
    expect(entryFor('Sword Art Online').aversionEvidence).toBe('clear');
  });

  it('treats a nearly-finished unrated drop as ambiguous, not aversion', () => {
    // 300 of 366 episodes watched. That is a stall, not a verdict.
    expect(classifyAnimeNegativeEvidence(entryFor('Bleach'))).toBe('ambiguous');
  });

  it('treats a favourite as a contradiction, not a mere over-claim', () => {
    expect(classifyAnimeNegativeEvidence(entryFor('Attack on Titan'))).toBe('contradictory');
    expect(entryFor('Attack on Titan').aversionEvidence).toBe('none');
  });

  it('treats a highly rated title as a contradiction', () => {
    expect(classifyAnimeNegativeEvidence(entryFor('Steins;Gate'))).toBe('contradictory');
    expect(entryFor('Steins;Gate').aversionEvidence).toBe('none');
  });

  it('treats an in-progress series as unusable rather than contradictory', () => {
    // Nothing has been decided yet. Citing it is a reach, not a contradiction, so it must not
    // cost the whole profile.
    expect(classifyAnimeNegativeEvidence(entryFor('Frieren'))).toBe('unusable');
    expect(entryFor('Frieren').aversionEvidence).toBe('none');
  });

  it('treats a completion with no rating as unusable', () => {
    expect(classifyAnimeNegativeEvidence(entryFor('Mushishi'))).toBe('unusable');
    expect(entryFor('Mushishi').aversionEvidence).toBe('none');
  });

  it('fails the whole generation when a signal cites a favourite', () => {
    const result = validateAiAnimeTasteProfile(
      profile({
        negativeSignals: [
          {
            name: 'Grim war stories',
            description: 'Avoids sustained battlefield misery.',
            evidenceTitles: ['Attack on Titan'],
          },
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.reason).toContain('contradicted_negative_evidence');
    // The diagnostic names the rule and the count, and nothing else.
    expect(result.success === false && result.reason).toContain('contradictory=1/1');
    expect(result.success === false && result.reason).not.toContain('Attack on Titan');
  });

  it('keeps the profile when a signal cites an in-progress series', () => {
    // The live regression: one reached-for citation used to discard the pillars as well.
    const result = validateAiAnimeTasteProfile(
      profile({
        negativeSignals: [
          {
            name: 'Slow fantasy travelogues',
            description: 'Loses patience with episodic wandering.',
            evidenceTitles: ['Frieren'],
          },
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.profile.pillars).toHaveLength(2);
      expect(result.profile.negativeSignals).toHaveLength(0);
      expect(result.droppedNegativeSignals[0]).toContain('Slow fantasy travelogues');
      expect(result.droppedNegativeSignals[0]).toContain('unusable:1');
    }
  });

  it('keeps the profile when a signal cites an unrated completion', () => {
    const result = validateAiAnimeTasteProfile(
      profile({
        negativeSignals: [
          {
            name: 'Quiet episodic fantasy',
            description: 'Prefers momentum to atmosphere.',
            evidenceTitles: ['Mushishi'],
          },
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.profile.negativeSignals).toHaveLength(0);
    }
  });

  it('drops an over-claimed signal without discarding the profile', () => {
    const result = validateAiAnimeTasteProfile(
      profile({
        negativeSignals: [
          {
            name: 'Long shonen arcs',
            description: 'Loses patience with extended tournament arcs.',
            evidenceTitles: ['Bleach'],
          },
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.profile.negativeSignals).toHaveLength(0);
      expect(result.droppedNegativeSignals[0]).toContain('Long shonen arcs');
      // The grade breakdown rides along so a live drop says why, without naming a title.
      expect(result.droppedNegativeSignals[0]).toContain('ambiguous:1');
    }
  });

  it('requires corroboration to outweigh ambiguity within one signal', () => {
    expect(isSupportedAnimeNegativeSignal(['usable', 'usable'])).toBe(true);
    expect(isSupportedAnimeNegativeSignal(['usable', 'ambiguous'])).toBe(true);
    expect(isSupportedAnimeNegativeSignal(['ambiguous', 'ambiguous'])).toBe(false);
    expect(isSupportedAnimeNegativeSignal(['strong', 'unusable'])).toBe(false);
    expect(isSupportedAnimeNegativeSignal(['strong', 'contradictory'])).toBe(false);
    expect(isSupportedAnimeNegativeSignal([])).toBe(false);
  });

  it('grades every entry so the model need not infer eligibility', () => {
    const expectedFor: Record<string, string> = {
      strong: 'clear',
      usable: 'clear',
      ambiguous: 'weak',
      unusable: 'none',
      contradictory: 'none',
    };
    for (const entry of evidence.entries) {
      expect(entry.aversionEvidence).toBe(expectedFor[classifyAnimeNegativeEvidence(entry)]);
    }
  });

  it('counts how many entries could carry a signal at all', () => {
    const clear = evidence.entries.filter(e => e.aversionEvidence === 'clear').length;
    expect(evidence.dataQuality.clearAversionCount).toBe(clear);
  });

  it('reports zero carrying evidence for a library with no drops and no low scores', () => {
    // The real-library case: nothing dropped, nothing rated below 7. Rich in preference, empty of
    // aversion — and the prompt turns that count into "claim no rejection anywhere".
    const noAversion = buildAnimeAiEvidenceDocument(
      ANIME_FIXTURE_HISTORY.filter(e => e.status !== 'dropped'),
    );
    expect(noAversion.dataQuality.clearAversionCount).toBe(0);
    expect(noAversion.dataQuality.sufficiency).not.toBe('sparse');
  });
});

describe('deterministic strength bands', () => {
  it('attaches a band to every pillar, and no model-supplied number', () => {
    const enriched = enrichAiAnimeTasteProfile(profile(), evidence, 'model-x', 'hash-x');
    for (const pillar of enriched.pillars) {
      expect(['Defining', 'Strong', 'Present', 'Emerging']).toContain(pillar.strengthBand);
    }
    expect(enriched.source).toBe('ai');
    expect(enriched.model).toBe('model-x');
    expect(enriched.inputHash).toBe('hash-x');
    expect(enriched.dataQuality).toEqual(evidence.dataQuality);
  });

  it('bands a single-title citation as Emerging, whatever its weight', () => {
    expect(calculateAnimeStrengthBand(['Attack on Titan'], evidence)).toBe('Emerging');
  });

  /**
   * Reachability, asserted rather than assumed. A denominator that puts the top band out of reach
   * would make the whole scale decorative, so this pins that the heaviest evidence in a real
   * library can actually reach `Defining`.
   */
  it('keeps every band reachable', () => {
    const heaviest = evidence.entries
      .filter(entry => entry.weight > 0)
      .slice(0, 5)
      .map(entry => entry.representativeTitle);
    const band = calculateAnimeStrengthBand(heaviest, evidence);
    expect(['Defining', 'Strong']).toContain(band);

    const diagnostics = calculateAnimeStrengthDiagnostics(heaviest, evidence);
    expect(diagnostics.referenceMass).toBeGreaterThan(0);
    expect(diagnostics.share).toBeGreaterThan(0);
    expect(diagnostics.share).toBeLessThanOrEqual(1);
  });

  it('bands weak evidence below strong evidence', () => {
    const strong = calculateAnimeStrengthDiagnostics(
      ['Attack on Titan', 'Vinland Saga'],
      evidence,
    );
    const weak = calculateAnimeStrengthDiagnostics(['Mushishi', 'Frieren'], evidence);
    expect(strong.evidenceMass).toBeGreaterThan(weak.evidenceMass);
  });

  it('reports how many franchises a citation set actually spans', () => {
    expect(
      calculateAnimeStrengthDiagnostics(
        ['Attack on Titan', 'Attack on Titan Season 2'],
        evidence,
      ).franchiseCount,
    ).toBe(1);
    expect(
      calculateAnimeStrengthDiagnostics(['Attack on Titan', 'Monster'], evidence).franchiseCount,
    ).toBe(2);
  });
});

describe('unknown episode data', () => {
  it('still produces a usable profile when no episode totals exist at all', () => {
    const noTotals = ANIME_FIXTURE_HISTORY.map(entry => ({
      ...entry,
      media: { ...entry.media, episodes: null },
    }));
    const document = buildAnimeAiEvidenceDocument(noTotals);
    expect(document.dataQuality.episodeDataRatio).toBe(0);
    expect(document.dataQuality.sufficiency).not.toBe('sparse');
    expect(validateAiAnimeTasteProfile(profile(), document).success).toBe(true);
  });

  it('does not invent a progress band for an entry with neither count nor total', () => {
    const document = buildAnimeAiEvidenceDocument([
      animeEntry({ id: 1, title: 'Nothing Recorded', status: 'dropped', media: { episodes: null } }),
    ]);
    expect(document.entries[0].progressBand).toBe('unknown');
    expect(document.entries[0].totalEpisodes).toBeNull();
    expect(document.entries[0].episodesWatched).toBeNull();
  });
});
