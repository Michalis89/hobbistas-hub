/**
 * @jest-environment node
 *
 * Anime's kill switch, and its independence from the games one.
 *
 * The two flags must be separately operable in both directions: anime taste is new and may need
 * switching off without disturbing a feature that has been live for weeks, and a games incident
 * must not take anime down with it.
 */

jest.mock('server-only', () => ({}), { virtual: true });

import { getConfiguredGameTasteProvider } from '../../../games/taste/provider';
import {
  DEFAULT_GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS,
  getConfiguredAnimeTasteProvider,
  getGeminiAnimeTasteMaxOutputTokens,
} from '../provider';
import { DEFAULT_GEMINI_ANIME_TASTE_TIMEOUT_MS, getAnimeTasteTimeoutMs } from '../service';

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'GEMINI_API_KEY',
  'ANIME_AI_TASTE_ENABLED',
  'GAMING_AI_TASTE_ENABLED',
  'GEMINI_ANIME_TASTE_MODEL',
  'GEMINI_TASTE_MODEL',
  'GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS',
  'GEMINI_ANIME_TASTE_TIMEOUT_MS',
] as const;

const originalEnv: Partial<Record<(typeof AI_ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of AI_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of AI_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe('anime taste feature flag', () => {
  it('is off unless ANIME_AI_TASTE_ENABLED is exactly "true"', () => {
    process.env.GEMINI_API_KEY = 'key';
    for (const value of ['false', '1', 'TRUE', 'yes', '']) {
      process.env.ANIME_AI_TASTE_ENABLED = value;
      const configured = getConfiguredAnimeTasteProvider();
      expect(configured.enabled).toBe(false);
      expect(configured.provider).toBeNull();
    }
  });

  it('produces a provider when enabled with a key', () => {
    process.env.ANIME_AI_TASTE_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'key';
    const configured = getConfiguredAnimeTasteProvider();
    expect(configured.enabled).toBe(true);
    expect(configured.provider).not.toBeNull();
  });

  it('refuses to build a provider without a key, or for another provider name', () => {
    process.env.ANIME_AI_TASTE_ENABLED = 'true';
    expect(getConfiguredAnimeTasteProvider().provider).toBeNull();

    process.env.GEMINI_API_KEY = 'key';
    process.env.AI_PROVIDER = 'openai';
    expect(getConfiguredAnimeTasteProvider().provider).toBeNull();
  });

  it('is independent of the games flag in both directions', () => {
    process.env.GEMINI_API_KEY = 'key';

    process.env.ANIME_AI_TASTE_ENABLED = 'true';
    process.env.GAMING_AI_TASTE_ENABLED = 'false';
    expect(getConfiguredAnimeTasteProvider().enabled).toBe(true);
    expect(getConfiguredGameTasteProvider().enabled).toBe(false);

    process.env.ANIME_AI_TASTE_ENABLED = 'false';
    process.env.GAMING_AI_TASTE_ENABLED = 'true';
    expect(getConfiguredAnimeTasteProvider().enabled).toBe(false);
    expect(getConfiguredGameTasteProvider().enabled).toBe(true);
  });
});

describe('anime model resolution', () => {
  it('defaults to the shared stable Flash model', () => {
    expect(getConfiguredAnimeTasteProvider().model).toBe('gemini-3.6-flash');
  });

  it('prefers its own override over the shared taste model', () => {
    process.env.GEMINI_TASTE_MODEL = 'shared-model';
    process.env.GEMINI_ANIME_TASTE_MODEL = 'anime-model';
    expect(getConfiguredAnimeTasteProvider().model).toBe('anime-model');
  });

  it('falls back to the shared taste model when it has no override', () => {
    process.env.GEMINI_TASTE_MODEL = 'shared-model';
    expect(getConfiguredAnimeTasteProvider().model).toBe('shared-model');
  });

  it('strips a models/ prefix', () => {
    process.env.GEMINI_ANIME_TASTE_MODEL = 'models/gemini-3.6-flash';
    expect(getConfiguredAnimeTasteProvider().model).toBe('gemini-3.6-flash');
  });
});

describe('anime tunables', () => {
  it('leaves room for reasoning as well as the JSON', () => {
    expect(getGeminiAnimeTasteMaxOutputTokens()).toBe(
      DEFAULT_GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS,
    );
  });

  it('clamps a configured token budget into a workable range', () => {
    process.env.GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS = '100';
    expect(getGeminiAnimeTasteMaxOutputTokens()).toBe(2_500);

    process.env.GEMINI_ANIME_TASTE_MAX_OUTPUT_TOKENS = '99999';
    expect(getGeminiAnimeTasteMaxOutputTokens()).toBe(12_000);
  });

  it('clamps the timeout into a workable range', () => {
    expect(getAnimeTasteTimeoutMs()).toBe(DEFAULT_GEMINI_ANIME_TASTE_TIMEOUT_MS);

    process.env.GEMINI_ANIME_TASTE_TIMEOUT_MS = '100';
    expect(getAnimeTasteTimeoutMs()).toBe(5_000);

    process.env.GEMINI_ANIME_TASTE_TIMEOUT_MS = '999999';
    expect(getAnimeTasteTimeoutMs()).toBe(60_000);
  });
});
