/**
 * The Gemini `responseSchema` and the Zod contract must stay in lockstep.
 *
 * When they drift, constrained decoding produces output Zod then rejects wholesale — a whole
 * generation discarded over a bound one side enforced and the other did not. Asserted directly
 * rather than waiting for a live call to trip over it.
 */
jest.mock('server-only', () => ({}), { virtual: true });

import {
  buildGeminiRerankResponseSchema,
  buildRerankPrompt,
  DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS,
} from '../provider';
import { getRerankTimeoutMs } from '../service';
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

/**
 * Output generation dominates this call's latency: twenty entries under constrained decoding with
 * a per-item enum overran a 12s budget on the first live run at a 160-character rationale bound.
 * These are the numbers that keep it inside the budget, pinned so a later edit has to notice.
 */
describe('latency budget', () => {
  it('keeps the rationale bound short enough for a 20-item ranking', () => {
    expect(GAME_RERANK_TEXT_LIMITS.rationale).toBeLessThanOrEqual(80);
  });

  it('keeps the estimated output well inside the token ceiling', () => {
    const perItem = Math.ceil((GAME_RERANK_TEXT_LIMITS.rationale + 20) / 4) + 8;
    expect(perItem * 20).toBeLessThan(DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS);
  });

  it('never lets the provider timeout exceed the documented cap', () => {
    const original = process.env.GEMINI_RERANK_TIMEOUT_MS;
    process.env.GEMINI_RERANK_TIMEOUT_MS = '60000';
    expect(getRerankTimeoutMs()).toBeLessThanOrEqual(12_000);
    process.env.GEMINI_RERANK_TIMEOUT_MS = original;
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
