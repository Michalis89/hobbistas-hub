/**
 * The Gemini `responseSchema` and the Zod contract must stay in lockstep.
 *
 * When they drift, constrained decoding produces output Zod then rejects wholesale — a whole
 * generation discarded over a bound one side enforced and the other did not. Asserted directly
 * rather than waiting for a live call to trip over it.
 */
jest.mock('server-only', () => ({}), { virtual: true });

import { buildGeminiRerankResponseSchema, buildRerankPrompt } from '../provider';
import {
  AiGameRerankResultSchema,
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_SCHEMA_VERSION,
  GAME_RERANK_TEXT_LIMITS,
  type GameRerankRequestPayload,
} from '../types';

const TOKENS = ['c01', 'c02', 'c03', 'c04'];
const schema = buildGeminiRerankResponseSchema(TOKENS);

describe('gemini rerank responseSchema parity', () => {
  it('pins schemaVersion to the same literal Zod requires', () => {
    expect(schema.properties.schemaVersion.minimum).toBe(GAME_RERANK_SCHEMA_VERSION);
    expect(schema.properties.schemaVersion.maximum).toBe(GAME_RERANK_SCHEMA_VERSION);
  });

  it('fixes the array length to the number of issued tokens', () => {
    expect(schema.properties.ranking.minItems).toBe(TOKENS.length);
    expect(schema.properties.ranking.maxItems).toBe(TOKENS.length);
  });

  it('restricts candidateId to exactly the issued tokens', () => {
    expect(schema.properties.ranking.items.properties.candidateId.enum).toEqual(TOKENS);
  });

  it('bounds rank to 1..N so an out-of-range rank cannot be decoded', () => {
    expect(schema.properties.ranking.items.properties.rank.minimum).toBe(1);
    expect(schema.properties.ranking.items.properties.rank.maximum).toBe(TOKENS.length);
  });

  it('applies the same rationale bounds as Zod', () => {
    expect(schema.properties.ranking.items.properties.rationale.minLength).toBe(1);
    expect(schema.properties.ranking.items.properties.rationale.maxLength).toBe(
      GAME_RERANK_TEXT_LIMITS.rationale,
    );
  });

  it('requires every field the Zod object requires', () => {
    expect([...schema.required].sort()).toEqual(['ranking', 'schemaVersion']);
    expect([...schema.properties.ranking.items.required].sort()).toEqual([
      'candidateId',
      'rank',
      'rationale',
    ]);
  });

  it('declares propertyOrdering at every object level', () => {
    expect(schema.propertyOrdering).toEqual(['schemaVersion', 'ranking']);
    expect(schema.properties.ranking.items.propertyOrdering).toEqual([
      'candidateId',
      'rank',
      'rationale',
    ]);
  });

  it('accepts, under Zod, an object the provider schema would allow', () => {
    const decoded = {
      schemaVersion: 1,
      ranking: TOKENS.map((token, index) => ({
        candidateId: token,
        rank: index + 1,
        rationale: 'x'.repeat(GAME_RERANK_TEXT_LIMITS.rationale),
      })),
    };

    expect(AiGameRerankResultSchema.safeParse(decoded).success).toBe(true);
  });

  it('rejects, under Zod, a rationale one character past the shared bound', () => {
    const decoded = {
      schemaVersion: 1,
      ranking: TOKENS.map((token, index) => ({
        candidateId: token,
        rank: index + 1,
        rationale: 'x'.repeat(GAME_RERANK_TEXT_LIMITS.rationale + 1),
      })),
    };

    expect(AiGameRerankResultSchema.safeParse(decoded).success).toBe(false);
  });
});

describe('rerank prompt', () => {
  const payload: GameRerankRequestPayload = {
    payloadVersion: GAME_RERANK_PAYLOAD_VERSION,
    taste: {
      identity: { label: 'Authored Drama', description: 'd' },
      pillars: [],
      negativeSignals: [],
      summary: 's',
      sufficiency: 'rich',
    },
    candidates: [],
  };

  const prompt = buildRerankPrompt(payload);

  it('forbids changing the candidate set', () => {
    expect(prompt).toMatch(/only reorder the supplied list/i);
    expect(prompt).toMatch(/do not add, remove, merge, rename or invent/i);
  });

  it('demands a full permutation', () => {
    expect(prompt).toMatch(/exactly once/i);
    expect(prompt).toMatch(/permutation of 1\.\.N/i);
  });

  it('steers away from genre-label matching', () => {
    expect(prompt).toMatch(/do not rank by genre-label overlap/i);
  });

  it('makes negative signals demote rather than exclude', () => {
    expect(prompt).toMatch(/demotion criterion, not an exclusion/i);
  });

  it('forbids numeric confidence in rationale text', () => {
    expect(prompt).toMatch(/percentages, scores, star ratings or any numeric confidence/i);
  });

  it('pins the schema version', () => {
    expect(prompt).toContain('schemaVersion exactly 1');
  });
});
