/**
 * The Gemini `responseSchema` and the Zod contract must stay in lockstep.
 *
 * When they drift, constrained decoding produces output Zod then rejects wholesale — the
 * `schema_validation_failed` class of failure. These tests assert the parity directly rather
 * than waiting for a live generation to trip over it.
 */
jest.mock('server-only', () => ({}), { virtual: true });

import { buildGamingTastePrompt, getGeminiTasteResponseSchema } from '../provider';
import {
  AiGamingTasteProfileSchema,
  GAME_AI_TASTE_LIST_LIMITS,
  GAME_AI_TASTE_SCHEMA_VERSION,
  GAME_AI_TASTE_TEXT_LIMITS,
} from '../types';
import {
  classifyNegativeEvidence,
  isSupportedNegativeSignal,
  summarizeSchemaIssues,
  validateAiGamingTasteProfile,
  type GameAiValidationFailure,
  type GameAiValidationSuccess,
} from '../validation';
import { buildGameAiEvidenceDocument } from '../evidence';
import type { GameHistoryEntry } from '@/lib/recommendations/v3/games/games-types';

type JsonSchema = {
  type?: string;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

const schema = getGeminiTasteResponseSchema() as unknown as JsonSchema;
const props = schema.properties ?? {};

function historyEntry(
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

const evidence = buildGameAiEvidenceDocument([
  historyEntry(1, 'Alpha Quest', 'completed', 10, true),
  historyEntry(2, 'Beta Saga', 'completed', 9, true),
  historyEntry(3, 'Gamma Trial', 'completed', 8),
  historyEntry(4, 'Delta Sim', 'dropped', 3),
]);

function validProfile() {
  return {
    schemaVersion: 1,
    identity: { label: 'Focused Fantasy Player', description: 'Prefers authored fantasy worlds.' },
    pillars: [
      {
        name: 'Authored Fantasy',
        kind: 'content' as const,
        description: 'Long authored campaigns.',
        evidenceTitles: ['Alpha Quest', 'Beta Saga'],
      },
      {
        name: 'Systemic Mastery',
        kind: 'behavior' as const,
        description: 'Sticks with demanding systems.',
        evidenceTitles: ['Beta Saga', 'Gamma Trial'],
      },
    ],
    negativeSignals: [
      { name: 'Idle Sims', description: 'Drops idle simulators.', evidenceTitles: ['Delta Sim'] },
    ],
    summary: 'Authored fantasy and systemic mastery, not idle simulation.',
    openQuestions: ['Does difficulty or narrative drive engagement more?'],
  };
}

describe('Gemini responseSchema mirrors the Zod contract', () => {
  it('declares the same top-level required fields', () => {
    expect(schema.required?.slice().sort()).toEqual(
      Object.keys(AiGamingTasteProfileSchema.shape).sort(),
    );
  });

  it('pins schemaVersion to the contract version', () => {
    expect(props.schemaVersion?.minimum).toBe(GAME_AI_TASTE_SCHEMA_VERSION);
    expect(props.schemaVersion?.maximum).toBe(GAME_AI_TASTE_SCHEMA_VERSION);
  });

  it('bounds pillar and evidence list sizes on both sides', () => {
    expect(props.pillars?.minItems).toBe(GAME_AI_TASTE_LIST_LIMITS.pillarsMin);
    expect(props.pillars?.maxItems).toBe(GAME_AI_TASTE_LIST_LIMITS.pillarsMax);

    const evidenceTitles = props.pillars?.items?.properties?.evidenceTitles;
    expect(evidenceTitles?.minItems).toBe(GAME_AI_TASTE_LIST_LIMITS.pillarEvidenceMin);
    expect(evidenceTitles?.maxItems).toBe(GAME_AI_TASTE_LIST_LIMITS.evidenceMax);

    const negativeEvidence = props.negativeSignals?.items?.properties?.evidenceTitles;
    expect(props.negativeSignals?.maxItems).toBe(GAME_AI_TASTE_LIST_LIMITS.negativeSignalsMax);
    expect(negativeEvidence?.minItems).toBe(GAME_AI_TASTE_LIST_LIMITS.negativeEvidenceMin);
    expect(negativeEvidence?.maxItems).toBe(GAME_AI_TASTE_LIST_LIMITS.evidenceMax);

    expect(props.openQuestions?.maxItems).toBe(GAME_AI_TASTE_LIST_LIMITS.openQuestionsMax);
  });

  it('carries every string length bound Zod enforces', () => {
    // These two were the live `schema_validation_failed` cause: bounded in Zod, unbounded here.
    expect(props.summary?.maxLength).toBe(GAME_AI_TASTE_TEXT_LIMITS.summary);
    expect(props.openQuestions?.items?.maxLength).toBe(GAME_AI_TASTE_TEXT_LIMITS.openQuestion);

    expect(props.identity?.properties?.label?.maxLength).toBe(
      GAME_AI_TASTE_TEXT_LIMITS.identityLabel,
    );
    expect(props.identity?.properties?.description?.maxLength).toBe(
      GAME_AI_TASTE_TEXT_LIMITS.description,
    );
    expect(props.pillars?.items?.properties?.name?.maxLength).toBe(GAME_AI_TASTE_TEXT_LIMITS.name);
    expect(props.pillars?.items?.properties?.description?.maxLength).toBe(
      GAME_AI_TASTE_TEXT_LIMITS.description,
    );
    expect(props.negativeSignals?.items?.properties?.name?.maxLength).toBe(
      GAME_AI_TASTE_TEXT_LIMITS.name,
    );
    expect(props.negativeSignals?.items?.properties?.description?.maxLength).toBe(
      GAME_AI_TASTE_TEXT_LIMITS.description,
    );
  });

  it('leaves no bounded Zod string unbounded in the provider schema', () => {
    const boundedStrings: JsonSchema[] = [
      props.identity?.properties?.label,
      props.identity?.properties?.description,
      props.pillars?.items?.properties?.name,
      props.pillars?.items?.properties?.description,
      props.negativeSignals?.items?.properties?.name,
      props.negativeSignals?.items?.properties?.description,
      props.summary,
      props.openQuestions?.items,
    ].filter((entry): entry is JsonSchema => Boolean(entry));

    expect(boundedStrings).toHaveLength(8);
    for (const entry of boundedStrings) {
      expect(entry.minLength).toBe(1);
      expect(typeof entry.maxLength).toBe('number');
    }
  });

  it('uses the same kind enum', () => {
    expect(props.pillars?.items?.properties?.kind?.enum).toEqual(['content', 'behavior']);
  });
});

describe('validation failure categories', () => {
  it('reports a structural miss as the schema stage', () => {
    const result = validateAiGamingTasteProfile(
      { ...validProfile(), summary: 'x'.repeat(GAME_AI_TASTE_TEXT_LIMITS.summary + 1) },
      evidence,
    ) as GameAiValidationFailure;

    expect(result.success).toBe(false);
    expect(result.category).toBe('schema');
    expect(result.reason).toBe('schema_validation_failed');
    expect(result.issues?.[0]).toEqual({
      path: 'summary',
      code: 'too_big',
      expected: `<=${GAME_AI_TASTE_TEXT_LIMITS.summary} characters`,
      receivedType: 'string',
      receivedCount: GAME_AI_TASTE_TEXT_LIMITS.summary + 1,
    });
  });

  it('reports an over-long identity label as the content stage', () => {
    const result = validateAiGamingTasteProfile(
      {
        ...validProfile(),
        identity: { label: 'One Two Three Four Five', description: 'Too many words.' },
      },
      evidence,
    ) as GameAiValidationFailure;

    expect(result.category).toBe('content');
    expect(result.reason).toBe('identity_label_too_long');
  });

  it('reports hallucinated titles as the evidence stage', () => {
    const profile = validProfile();
    profile.pillars[0].evidenceTitles = ['Alpha Quest', 'A Game Not In The Library'];
    const result = validateAiGamingTasteProfile(profile, evidence) as GameAiValidationFailure;

    expect(result.category).toBe('evidence');
    expect(result.reason).toBe('hallucinated_pillar_evidence');
  });

  it('reports a high-rated favorite used as aversion evidence as the evidence stage', () => {
    const profile = validProfile();
    profile.negativeSignals[0].evidenceTitles = ['Alpha Quest'];
    const result = validateAiGamingTasteProfile(profile, evidence) as GameAiValidationFailure;

    expect(result.category).toBe('evidence');
    expect(result.reason).toBe('invalid_negative_evidence');
  });

  it('still accepts a contract-compliant profile', () => {
    expect(validateAiGamingTasteProfile(validProfile(), evidence).success).toBe(true);
  });
});

describe('summarizeSchemaIssues redaction', () => {
  it('records paths, codes and sizes but never the offending text', () => {
    const secret = 'CONFIDENTIAL-SUMMARY-TEXT'.repeat(20);
    const parsed = AiGamingTasteProfileSchema.safeParse({
      ...validProfile(),
      summary: secret,
      openQuestions: ['q'.repeat(GAME_AI_TASTE_TEXT_LIMITS.openQuestion + 1)],
    });
    expect(parsed.success).toBe(false);

    const issues = summarizeSchemaIssues(
      (parsed as { error: Parameters<typeof summarizeSchemaIssues>[0] }).error,
      { ...validProfile(), summary: secret },
    );
    const serialized = JSON.stringify(issues);

    expect(serialized).not.toContain('CONFIDENTIAL');
    expect(issues.map(issue => issue.path)).toEqual(
      expect.arrayContaining(['summary', 'openQuestions.0']),
    );
    for (const issue of issues) {
      expect(Object.keys(issue).sort()).toEqual(
        expect.arrayContaining(['code', 'expected', 'path', 'receivedType']),
      );
    }
  });

  it('describes list-size violations with item counts', () => {
    const parsed = AiGamingTasteProfileSchema.safeParse({
      ...validProfile(),
      pillars: [validProfile().pillars[0]],
    });
    const issues = summarizeSchemaIssues(
      (parsed as { error: Parameters<typeof summarizeSchemaIssues>[0] }).error,
      { ...validProfile(), pillars: [validProfile().pillars[0]] },
    );

    expect(issues[0]).toEqual({
      path: 'pillars',
      code: 'too_small',
      expected: `>=${GAME_AI_TASTE_LIST_LIMITS.pillarsMin} items`,
      receivedType: 'array',
      receivedCount: 1,
    });
  });
});

describe('negative evidence grading', () => {
  function graded(
    status: GameHistoryEntry['status'],
    score: number | null,
    favorite = false,
  ) {
    const doc = buildGameAiEvidenceDocument([historyEntry(90, 'Graded Title', status, score, favorite)]);
    const entry = doc.entries[0];
    return entry ? classifyNegativeEvidence(entry) : 'invalid';
  }

  it('treats a clear low rating as strong evidence whether finished or abandoned', () => {
    expect(graded('dropped', 3)).toBe('strong');
    expect(graded('dropped', 5)).toBe('strong');
    // Coffee Talk / Unpacking in the real library: finished, rated 2.
    expect(graded('completed', 2)).toBe('strong');
  });

  it('treats an unrated abandonment as usable but weaker evidence', () => {
    // Skyrim / Valheim / DayZ / Cities: Skylines in the real library.
    expect(graded('dropped', null)).toBe('usable');
    expect(graded('dropped', 5.5)).toBe('usable');
  });

  it('treats a decently rated abandonment as ambiguous', () => {
    // Inside / Limbo / Little Nightmares (7) and Outlast (6.5) in the real library.
    expect(graded('dropped', 7)).toBe('ambiguous');
    expect(graded('dropped', 6.5)).toBe('ambiguous');
    expect(graded('dropped', 6)).toBe('ambiguous');
  });

  it('never lets a favorite or a well-rated title support an aversion', () => {
    expect(graded('dropped', 3, true)).toBe('invalid');
    expect(graded('completed', 10, true)).toBe('invalid');
    expect(graded('completed', 9)).toBe('invalid');
    expect(graded('dropped', 8)).toBe('invalid');
  });

  it('does not read a finished-and-fine or in-progress title as aversion', () => {
    expect(graded('completed', 7)).toBe('invalid');
    expect(graded('completed', null)).toBe('invalid');
    expect(graded('current', 3)).toBe('invalid');
  });

  it('requires ambiguous evidence to be corroborated, not to carry the group', () => {
    // The real "Disempowered Trial-and-Error" signal: four decently rated abandonments.
    expect(isSupportedNegativeSignal(['ambiguous', 'ambiguous', 'ambiguous', 'ambiguous'])).toBe(false);
    expect(isSupportedNegativeSignal(['ambiguous'])).toBe(false);
    expect(isSupportedNegativeSignal(['ambiguous', 'ambiguous', 'strong'])).toBe(false);

    // The real "Unstructured Sandbox Survival" signal: four unrated abandonments.
    expect(isSupportedNegativeSignal(['usable', 'usable', 'usable', 'usable'])).toBe(true);
    // The real "Passive Management Simulators" signal: three clear dislikes plus one unrated drop.
    expect(isSupportedNegativeSignal(['strong', 'strong', 'strong', 'usable'])).toBe(true);
    expect(isSupportedNegativeSignal(['strong', 'ambiguous'])).toBe(true);
    expect(isSupportedNegativeSignal([])).toBe(false);
  });
});

describe('negative signal filtering end to end', () => {
  const library = [
    historyEntry(1, 'Alpha Quest', 'completed', 10, true),
    historyEntry(2, 'Beta Saga', 'completed', 9, true),
    historyEntry(3, 'Gamma Trial', 'completed', 8),
    historyEntry(10, 'Cheap Sim', 'dropped', 3),
    historyEntry(11, 'Idle Tapper', 'completed', 2),
    historyEntry(12, 'Sandbox One', 'dropped', null),
    historyEntry(13, 'Sandbox Two', 'dropped', null),
    // The problem class: abandoned, but rated well.
    historyEntry(20, 'Moody Platformer', 'dropped', 7),
    historyEntry(21, 'Quiet Horror', 'dropped', 6.5),
    historyEntry(22, 'Slow Puzzler', 'dropped', 7),
  ];
  const richEvidence = buildGameAiEvidenceDocument(library);

  function profileWithNegatives(
    negativeSignals: Array<{ name: string; description: string; evidenceTitles: string[] }>,
  ) {
    return { ...validProfile(), negativeSignals };
  }

  it('keeps a signal built on clear dislikes and unrated abandonments', () => {
    const result = validateAiGamingTasteProfile(
      profileWithNegatives([
        {
          name: 'Idle Economy Loops',
          description: 'Abandons or dislikes unattended progression loops.',
          evidenceTitles: ['Cheap Sim', 'Idle Tapper'],
        },
        {
          name: 'Open-Ended Sandboxes',
          description: 'Leaves goalless sandboxes early.',
          evidenceTitles: ['Sandbox One', 'Sandbox Two'],
        },
      ]),
      richEvidence,
    ) as GameAiValidationSuccess;

    expect(result.success).toBe(true);
    expect(result.profile.negativeSignals.map(signal => signal.name)).toEqual([
      'Idle Economy Loops',
      'Open-Ended Sandboxes',
    ]);
    expect(result.droppedNegativeSignals).toEqual([]);
  });

  it('drops a signal built only from decently rated abandonments, keeping the rest', () => {
    const result = validateAiGamingTasteProfile(
      profileWithNegatives([
        {
          name: 'Idle Economy Loops',
          description: 'Abandons or dislikes unattended progression loops.',
          evidenceTitles: ['Cheap Sim', 'Idle Tapper'],
        },
        {
          name: 'Low-Agency Atmosphere',
          description: 'Abandons slow atmospheric games.',
          evidenceTitles: ['Moody Platformer', 'Quiet Horror', 'Slow Puzzler'],
        },
      ]),
      richEvidence,
    ) as GameAiValidationSuccess;

    expect(result.success).toBe(true);
    expect(result.profile.negativeSignals.map(signal => signal.name)).toEqual(['Idle Economy Loops']);
    expect(result.droppedNegativeSignals).toEqual(['Low-Agency Atmosphere']);
  });

  it('keeps the same titles when a clear dislike corroborates them', () => {
    const result = validateAiGamingTasteProfile(
      profileWithNegatives([
        {
          name: 'Low-Agency Atmosphere',
          description: 'Abandons slow atmospheric games.',
          evidenceTitles: ['Moody Platformer', 'Quiet Horror', 'Cheap Sim', 'Idle Tapper'],
        },
      ]),
      richEvidence,
    ) as GameAiValidationSuccess;

    expect(result.profile.negativeSignals).toHaveLength(1);
    expect(result.droppedNegativeSignals).toEqual([]);
  });

  it('still hard-fails when a favorite is cited as aversion evidence', () => {
    const result = validateAiGamingTasteProfile(
      profileWithNegatives([
        {
          name: 'Impossible Claim',
          description: 'Cites a favorite as a dislike.',
          evidenceTitles: ['Alpha Quest'],
        },
      ]),
      richEvidence,
    ) as GameAiValidationFailure;

    expect(result.success).toBe(false);
    expect(result.category).toBe('evidence');
    expect(result.reason).toBe('invalid_negative_evidence');
  });

  it('still hard-fails on a hallucinated negative title', () => {
    const result = validateAiGamingTasteProfile(
      profileWithNegatives([
        {
          name: 'Invented',
          description: 'Cites something not in the library.',
          evidenceTitles: ['A Game That Does Not Exist'],
        },
      ]),
      richEvidence,
    ) as GameAiValidationFailure;

    expect(result.reason).toBe('hallucinated_negative_evidence');
  });
});

describe('prompt guidance', () => {
  it('tells the model to label negative signals by the shared pattern across all cited titles', () => {
    const prompt = buildGamingTastePrompt(evidence);
    expect(prompt).toContain('every one of its cited titles actually shares');
    expect(prompt).toContain('returning fewer negative signals is better');
    expect(prompt).toContain('not evidence of aversion even if abandoned');
  });

  it('tells the model that open questions describe present ambiguity, not future taste', () => {
    const prompt = buildGamingTastePrompt(evidence);
    expect(prompt).toContain('genuine ambiguity in the supplied evidence');
    expect(prompt).toContain('Do not forecast');
  });
});
