/**
 * The anime rerank switches, and the two contracts that must not drift.
 *
 * Anime reranking gets its own flag, its own model variable and its own token budget. The tests
 * that matter here are the negative ones: anime taste being live must not enable anime reranking,
 * and the games flag must not either.
 */

jest.mock('server-only', () => ({}), { virtual: true });

import {
  ANIME_RERANK_MAX_OUTPUT_TOKENS_ENV,
  ANIME_RERANK_THINKING_BUDGET_ENV,
  buildGeminiAnimeRerankResponseSchema,
  getConfiguredAnimeRerankProvider,
  getGeminiAnimeRerankMaxOutputTokens,
  getGeminiAnimeRerankThinkingBudget,
} from '../provider';
import { buildAnimeRerankPrompt } from '../prompt';
import {
  getAnimeRerankShortlistSize,
  getAnimeRerankTimeoutMs,
  getConfiguredAnimeSampleRate,
  DEFAULT_GEMINI_ANIME_RERANK_TIMEOUT_MS,
} from '../adapter';
import {
  AiAnimeRerankResultSchema,
  ANIME_RERANK_MAX_SHORTLIST,
  ANIME_RERANK_MIN_SHORTLIST,
  ANIME_RERANK_TEXT_LIMITS,
  type AnimeRerankRequestPayload,
} from '../types';

const MANAGED_ENV = [
  'ANIME_RERANK_SHADOW_ENABLED',
  'GAMES_RERANK_SHADOW_ENABLED',
  'ANIME_AI_TASTE_ENABLED',
  'GEMINI_ANIME_RERANK_MODEL',
  'GEMINI_RERANK_MODEL',
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'ANIME_RERANK_SHORTLIST_SIZE',
  'ANIME_RERANK_SHADOW_SAMPLE',
  'GEMINI_ANIME_RERANK_TIMEOUT_MS',
  ANIME_RERANK_MAX_OUTPUT_TOKENS_ENV,
  ANIME_RERANK_THINKING_BUDGET_ENV,
] as const;

describe('getConfiguredAnimeRerankProvider', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of MANAGED_ENV) {
      original[name] = process.env[name];
      delete process.env[name];
    }
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    for (const name of MANAGED_ENV) {
      if (original[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = original[name];
      }
    }
  });

  it('is off unless ANIME_RERANK_SHADOW_ENABLED is exactly "true"', () => {
    for (const value of ['', '1', 'yes', 'TRUE', 'false']) {
      process.env.ANIME_RERANK_SHADOW_ENABLED = value;
      expect(getConfiguredAnimeRerankProvider().enabled).toBe(false);
      expect(getConfiguredAnimeRerankProvider().provider).toBeNull();
    }
  });

  it('is off when the flag is unset entirely', () => {
    expect(getConfiguredAnimeRerankProvider().enabled).toBe(false);
  });

  it('does not turn on because anime taste is on', () => {
    process.env.ANIME_AI_TASTE_ENABLED = 'true';

    expect(getConfiguredAnimeRerankProvider().enabled).toBe(false);
  });

  it('does not turn on because games reranking is on', () => {
    process.env.GAMES_RERANK_SHADOW_ENABLED = 'true';

    expect(getConfiguredAnimeRerankProvider().enabled).toBe(false);
  });

  it('yields no provider when the flag is on but no API key is configured', () => {
    process.env.ANIME_RERANK_SHADOW_ENABLED = 'true';
    delete process.env.GEMINI_API_KEY;

    const configured = getConfiguredAnimeRerankProvider();
    expect(configured.enabled).toBe(true);
    expect(configured.provider).toBeNull();
  });

  it('builds a provider when the flag and the key are both present', () => {
    process.env.ANIME_RERANK_SHADOW_ENABLED = 'true';

    expect(getConfiguredAnimeRerankProvider().provider).not.toBeNull();
  });

  it('reports the configured model without falling back silently', () => {
    process.env.ANIME_RERANK_SHADOW_ENABLED = 'true';
    process.env.GEMINI_ANIME_RERANK_MODEL = 'gemini-some-other';

    expect(getConfiguredAnimeRerankProvider().model).toContain('gemini-some-other');
  });

  it('does not read the games model variable', () => {
    process.env.ANIME_RERANK_SHADOW_ENABLED = 'true';
    process.env.GEMINI_RERANK_MODEL = 'games-only-model';

    expect(getConfiguredAnimeRerankProvider().model).not.toContain('games-only-model');
  });
});

describe('the clamped knobs', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of MANAGED_ENV) {
      original[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of MANAGED_ENV) {
      if (original[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = original[name];
      }
    }
  });

  it('never lets the timeout exceed the after() budget the route is sized for', () => {
    process.env.GEMINI_ANIME_RERANK_TIMEOUT_MS = '600000';

    expect(getAnimeRerankTimeoutMs()).toBe(DEFAULT_GEMINI_ANIME_RERANK_TIMEOUT_MS);
  });

  it('falls back on a nonsense timeout rather than disabling the timeout', () => {
    process.env.GEMINI_ANIME_RERANK_TIMEOUT_MS = 'soon';

    expect(getAnimeRerankTimeoutMs()).toBe(DEFAULT_GEMINI_ANIME_RERANK_TIMEOUT_MS);
  });

  it('clamps the shortlist size into the contract bounds', () => {
    process.env.ANIME_RERANK_SHORTLIST_SIZE = '999';
    expect(getAnimeRerankShortlistSize()).toBe(ANIME_RERANK_MAX_SHORTLIST);

    process.env.ANIME_RERANK_SHORTLIST_SIZE = '1';
    expect(getAnimeRerankShortlistSize()).toBe(ANIME_RERANK_MIN_SHORTLIST);
  });

  it('treats a sample rate of zero as meaningful, not as unset', () => {
    process.env.ANIME_RERANK_SHADOW_SAMPLE = '0';

    expect(getConfiguredAnimeSampleRate()).toBe(0);
  });

  it('samples everything by default', () => {
    expect(getConfiguredAnimeSampleRate()).toBe(1);
  });

  it('asks for no reasoning budget by default, and honours "off" as omission', () => {
    expect(getGeminiAnimeRerankThinkingBudget()).toBe(0);

    process.env[ANIME_RERANK_THINKING_BUDGET_ENV] = 'off';
    expect(getGeminiAnimeRerankThinkingBudget()).toBeNull();
  });

  it('sizes the output budget to cover reasoning as well as the JSON', () => {
    expect(getGeminiAnimeRerankMaxOutputTokens()).toBeGreaterThanOrEqual(6_000);

    process.env[ANIME_RERANK_MAX_OUTPUT_TOKENS_ENV] = '10';
    expect(getGeminiAnimeRerankMaxOutputTokens()).toBeGreaterThanOrEqual(1_500);
  });
});

describe('the Zod contract and the Gemini responseSchema stay in lockstep', () => {
  const tokens = ['c01', 'c02', 'c03', 'c04'];
  const schema = buildGeminiAnimeRerankResponseSchema(tokens);

  it('pins candidateId to exactly the tokens issued this run', () => {
    expect(schema.properties.ranking.items.properties.candidateId.enum).toEqual(tokens);
  });

  it('requires one entry per candidate, no more and no fewer', () => {
    expect(schema.properties.ranking.minItems).toBe(tokens.length);
    expect(schema.properties.ranking.maxItems).toBe(tokens.length);
  });

  it('caps the rationale at the same length Zod enforces', () => {
    expect(schema.properties.ranking.items.properties.rationale.maxLength).toBe(
      ANIME_RERANK_TEXT_LIMITS.rationale,
    );

    const overLong = 'x'.repeat(ANIME_RERANK_TEXT_LIMITS.rationale + 1);
    const parsed = AiAnimeRerankResultSchema.safeParse({
      schemaVersion: 1,
      ranking: tokens.map((candidateId, index) => ({
        candidateId,
        rank: index + 1,
        rationale: overLong,
      })),
    });

    expect(parsed.success).toBe(false);
  });

  it('bounds rank to the candidate count on both sides of the contract', () => {
    expect(schema.properties.ranking.items.properties.rank.maximum).toBe(tokens.length);
  });

  it('accepts a well-formed ranking', () => {
    const parsed = AiAnimeRerankResultSchema.safeParse({
      schemaVersion: 1,
      ranking: tokens.map((candidateId, index) => ({
        candidateId,
        rank: index + 1,
        rationale: 'Closer to the introspective pillar.',
      })),
    });

    expect(parsed.success).toBe(true);
  });
});

describe('buildAnimeRerankPrompt', () => {
  const payload: AnimeRerankRequestPayload = {
    payloadVersion: 'anime-rerank-payload-v1',
    taste: {
      identity: { label: 'L', description: 'D' },
      pillars: [],
      negativeSignals: [],
      summary: 'S',
      sufficiency: 'rich',
    },
    candidates: [],
  };

  it('forbids changing the candidate set', () => {
    const prompt = buildAnimeRerankPrompt(payload);

    expect(prompt).toContain('Do not add, remove, merge, rename or invent entries');
    expect(prompt).toContain('exactly once');
  });

  it('pushes the comparison away from genre-label overlap', () => {
    expect(buildAnimeRerankPrompt(payload)).toContain('Do not rank by genre-label overlap');
  });

  it('asks about commitment shape, which is the anime-specific axis', () => {
    const prompt = buildAnimeRerankPrompt(payload);

    expect(prompt).toContain('format and episodes');
    expect(prompt).toMatch(/cour/);
  });

  it('demotes on negative signals rather than excluding', () => {
    expect(buildAnimeRerankPrompt(payload)).toContain('demotion criterion, not an exclusion');
  });

  it('forbids numeric confidence in the rationale', () => {
    expect(buildAnimeRerankPrompt(payload)).toContain('Do not output percentages');
  });
});
