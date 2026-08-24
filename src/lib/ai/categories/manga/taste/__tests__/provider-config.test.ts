/**
 * @jest-environment node
 *
 * The provider schema and the Zod contract are two descriptions of the same shape, maintained by
 * hand in two files. A bound present in one and missing from the other is silent and expensive:
 * constrained decoding never applies it, the model overruns it, and Zod throws the whole
 * generation away. These tests are the parity check that makes the drift loud instead.
 */

jest.mock('server-only', () => ({}), { virtual: true });

import {
  getGeminiMangaTasteMaxOutputTokens,
  getGeminiMangaTasteResponseSchema,
  getConfiguredMangaTasteProvider,
  DEFAULT_GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS,
} from '../provider';
import {
  MANGA_AI_TASTE_LIST_LIMITS,
  MANGA_AI_TASTE_SCHEMA_VERSION,
  MANGA_AI_TASTE_TEXT_LIMITS,
} from '../types';

const schema = getGeminiMangaTasteResponseSchema();

describe('provider schema mirrors the Zod contract', () => {
  it('pins the schema version by range, since Gemini enums are string-only', () => {
    expect(schema.properties.schemaVersion.minimum).toBe(MANGA_AI_TASTE_SCHEMA_VERSION);
    expect(schema.properties.schemaVersion.maximum).toBe(MANGA_AI_TASTE_SCHEMA_VERSION);
  });

  it('carries the same text bounds', () => {
    expect(schema.properties.identity.properties.label.maxLength).toBe(
      MANGA_AI_TASTE_TEXT_LIMITS.identityLabel,
    );
    expect(schema.properties.identity.properties.description.maxLength).toBe(
      MANGA_AI_TASTE_TEXT_LIMITS.description,
    );
    expect(schema.properties.pillars.items.properties.name.maxLength).toBe(
      MANGA_AI_TASTE_TEXT_LIMITS.name,
    );
    expect(schema.properties.summary.maxLength).toBe(MANGA_AI_TASTE_TEXT_LIMITS.summary);
    expect(schema.properties.openQuestions.items.maxLength).toBe(
      MANGA_AI_TASTE_TEXT_LIMITS.openQuestion,
    );
  });

  it('carries the same list bounds', () => {
    expect(schema.properties.pillars.minItems).toBe(MANGA_AI_TASTE_LIST_LIMITS.pillarsMin);
    expect(schema.properties.pillars.maxItems).toBe(MANGA_AI_TASTE_LIST_LIMITS.pillarsMax);
    expect(schema.properties.pillars.items.properties.evidenceTitles.minItems).toBe(
      MANGA_AI_TASTE_LIST_LIMITS.pillarEvidenceMin,
    );
    expect(schema.properties.negativeSignals.maxItems).toBe(
      MANGA_AI_TASTE_LIST_LIMITS.negativeSignalsMax,
    );
    expect(schema.properties.openQuestions.maxItems).toBe(
      MANGA_AI_TASTE_LIST_LIMITS.openQuestionsMax,
    );
  });

  it('uses content | form, not the games behaviour enum', () => {
    // "Behaviour" is a player concept. A reader has no equivalent, and offering the field would
    // invite the model to describe reading habits as though they were taste.
    expect(schema.properties.pillars.items.properties.kind.enum).toEqual(['content', 'form']);
  });

  it('allows an empty negativeSignals array', () => {
    // The single most important bound here: a reader with no aversion evidence must be able to
    // produce a valid profile that claims none.
    expect(schema.properties.negativeSignals.minItems).toBe(0);
  });
});

describe('provider configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MANGA_AI_TASTE_ENABLED;
    delete process.env.GEMINI_MANGA_TASTE_MODEL;
    delete process.env.GEMINI_TASTE_MODEL;
    delete process.env.GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled unless its own flag is set', () => {
    // Manga taste must be switchable without touching two features that are already live.
    expect(getConfiguredMangaTasteProvider().enabled).toBe(false);
    expect(getConfiguredMangaTasteProvider().provider).toBeNull();
  });

  it('stays disabled when the flag is set but no API key exists', () => {
    process.env.MANGA_AI_TASTE_ENABLED = 'true';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    expect(getConfiguredMangaTasteProvider().provider).toBeNull();
  });

  it('is not enabled by the anime or games flags', () => {
    process.env.ANIME_AI_TASTE_ENABLED = 'true';
    process.env.GAMES_AI_TASTE_ENABLED = 'true';
    expect(getConfiguredMangaTasteProvider().enabled).toBe(false);
  });

  it('clamps the output token budget', () => {
    process.env.GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS = '999999';
    expect(getGeminiMangaTasteMaxOutputTokens()).toBeLessThanOrEqual(12_000);
    process.env.GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS = '1';
    expect(getGeminiMangaTasteMaxOutputTokens()).toBeGreaterThanOrEqual(2_500);
    delete process.env.GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS;
    expect(getGeminiMangaTasteMaxOutputTokens()).toBe(
      DEFAULT_GEMINI_MANGA_TASTE_MAX_OUTPUT_TOKENS,
    );
  });
});
