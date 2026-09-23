/**
 * The Zod contract and the Gemini `responseSchema` must agree, for every category.
 *
 * When they drift, constrained decoding produces output Zod then rejects wholesale — a whole
 * generation discarded over a bound one side enforced and the other did not. That failure cost a
 * live anime run its first profile, so it is asserted structurally here rather than per category:
 * both schemas come from one config, and this proves the two builders read it the same way.
 */

import {
  buildGeminiTasteResponseSchema,
  buildTasteProfileSchema,
  type TasteProfileContractConfig,
} from '../profile-contract';

const CONFIG: TasteProfileContractConfig = {
  schemaVersion: 1,
  pillarKinds: ['content', 'form'],
  textLimits: {
    identityLabel: 48,
    name: 80,
    description: 360,
    summary: 320,
    openQuestion: 140,
  },
  listLimits: {
    pillarsMin: 2,
    pillarsMax: 4,
    pillarEvidenceMin: 2,
    negativeEvidenceMin: 1,
    evidenceMax: 5,
    negativeSignalsMax: 3,
    openQuestionsMax: 2,
  },
};

const schema = buildTasteProfileSchema(CONFIG);
const responseSchema = buildGeminiTasteResponseSchema(CONFIG);

function validProfile(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    identity: { label: 'Quiet Character Study', description: 'Prefers restraint to spectacle.' },
    pillars: [
      {
        name: 'Episodic introspection',
        kind: 'content',
        description: 'Standalone stories that resolve emotionally.',
        evidenceTitles: ['Alpha', 'Beta'],
      },
      {
        name: 'Withheld exposition',
        kind: 'form',
        description: 'Trusts the audience to assemble the world.',
        evidenceTitles: ['Gamma', 'Delta'],
      },
    ],
    negativeSignals: [
      { name: 'Escalating stakes', description: 'Abandons power ladders.', evidenceTitles: ['Eps'] },
    ],
    summary: 'Watches for atmosphere.',
    openQuestions: ['Unclear whether long runs are avoided or untried.'],
    ...overrides,
  };
}

describe('the two schemas describe the same document', () => {
  it('requires the same top-level fields', () => {
    expect([...responseSchema.required].sort()).toEqual([
      'identity',
      'negativeSignals',
      'openQuestions',
      'pillars',
      'schemaVersion',
      'summary',
    ]);
  });

  it('pins the schema version on both sides', () => {
    expect(responseSchema.properties.schemaVersion.minimum).toBe(1);
    expect(responseSchema.properties.schemaVersion.maximum).toBe(1);
    expect(schema.safeParse(validProfile({ schemaVersion: 2 })).success).toBe(false);
  });

  it('carries the same pillar kinds, which are not shared between categories', () => {
    expect(responseSchema.properties.pillars.items.properties.kind.enum).toEqual([
      'content',
      'form',
    ]);
    // `behavior` is a games concept; a viewer does not do anything. See the contract's own note.
    expect(
      schema.safeParse(
        validProfile({
          pillars: [
            { ...validProfile().pillars[0], kind: 'behavior' },
            validProfile().pillars[1],
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('applies the same text bounds on both sides', () => {
    const { textLimits } = CONFIG;
    expect(responseSchema.properties.identity.properties.label.maxLength).toBe(
      textLimits.identityLabel,
    );
    expect(responseSchema.properties.summary.maxLength).toBe(textLimits.summary);
    expect(responseSchema.properties.pillars.items.properties.name.maxLength).toBe(textLimits.name);
    expect(responseSchema.properties.openQuestions.items.maxLength).toBe(textLimits.openQuestion);

    expect(
      schema.safeParse(validProfile({ summary: 'x'.repeat(textLimits.summary + 1) })).success,
    ).toBe(false);
  });

  it('applies the same list bounds on both sides', () => {
    const { listLimits } = CONFIG;
    expect(responseSchema.properties.pillars.minItems).toBe(listLimits.pillarsMin);
    expect(responseSchema.properties.pillars.maxItems).toBe(listLimits.pillarsMax);
    expect(responseSchema.properties.pillars.items.properties.evidenceTitles.minItems).toBe(
      listLimits.pillarEvidenceMin,
    );
    expect(responseSchema.properties.negativeSignals.maxItems).toBe(listLimits.negativeSignalsMax);
    expect(responseSchema.properties.openQuestions.maxItems).toBe(listLimits.openQuestionsMax);

    expect(schema.safeParse(validProfile({ pillars: [validProfile().pillars[0]] })).success).toBe(
      false,
    );
  });

  it('allows an empty negative-signal list and an empty open-question list', () => {
    // Both must be expressible: a library with no aversion evidence is required to return neither.
    expect(responseSchema.properties.negativeSignals.minItems).toBe(0);
    expect(responseSchema.properties.openQuestions.minItems).toBe(0);
    expect(
      schema.safeParse(validProfile({ negativeSignals: [], openQuestions: [] })).success,
    ).toBe(true);
  });

  it('accepts a well-formed profile', () => {
    expect(schema.safeParse(validProfile()).success).toBe(true);
  });

  it('rejects a pillar citing fewer titles than the contract requires', () => {
    expect(
      schema.safeParse(
        validProfile({
          pillars: [
            { ...validProfile().pillars[0], evidenceTitles: ['Only One'] },
            validProfile().pillars[1],
          ],
        }),
      ).success,
    ).toBe(false);
  });
});
