/**
 * @jest-environment node
 *
 * The games kill switches, asserted as switches.
 *
 * Both features are gated by their own environment flag and both resolve to `provider: null` when
 * off — which is what the services check before spending anything. The two flags are separate on
 * purpose: taste and reranking must be independently disableable, so a rerank problem never
 * forces the identity card off with it.
 *
 * The `model` field is asserted while disabled too. It is recorded on every shadow observation and
 * folded into both cache keys, so it has to resolve identically whether or not the feature is on.
 */

jest.mock('server-only', () => ({}), { virtual: true });

import { getConfiguredGameRerankProvider } from '../rerank/provider';
import { getConfiguredGameTasteProvider } from '../taste/provider';

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'GEMINI_API_KEY',
  'GAMING_AI_TASTE_ENABLED',
  'GAMES_RERANK_SHADOW_ENABLED',
  'GEMINI_TASTE_MODEL',
  'GEMINI_RERANK_MODEL',
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

describe('games taste feature flag', () => {
  it('is off unless GAMING_AI_TASTE_ENABLED is exactly "true"', () => {
    process.env.GEMINI_API_KEY = 'key';
    for (const value of ['false', '1', 'TRUE', 'yes', '']) {
      process.env.GAMING_AI_TASTE_ENABLED = value;
      const configured = getConfiguredGameTasteProvider();
      expect(configured.enabled).toBe(false);
      expect(configured.provider).toBeNull();
    }
  });

  it('produces a provider when enabled with a key', () => {
    process.env.GAMING_AI_TASTE_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'key';
    const configured = getConfiguredGameTasteProvider();
    expect(configured.enabled).toBe(true);
    expect(configured.provider).not.toBeNull();
  });

  it('refuses to build a provider without a key, or for another provider name', () => {
    process.env.GAMING_AI_TASTE_ENABLED = 'true';
    expect(getConfiguredGameTasteProvider().provider).toBeNull();

    process.env.GEMINI_API_KEY = 'key';
    process.env.AI_PROVIDER = 'openai';
    expect(getConfiguredGameTasteProvider().provider).toBeNull();
  });

  it('resolves the same model whether enabled or not', () => {
    process.env.GEMINI_TASTE_MODEL = 'models/gemini-3.6-flash';
    process.env.GEMINI_API_KEY = 'key';

    process.env.GAMING_AI_TASTE_ENABLED = 'false';
    const off = getConfiguredGameTasteProvider().model;
    process.env.GAMING_AI_TASTE_ENABLED = 'true';
    const on = getConfiguredGameTasteProvider().model;

    expect(off).toBe('gemini-3.6-flash');
    expect(on).toBe(off);
  });
});

describe('games shadow rerank feature flag', () => {
  it('is off unless GAMES_RERANK_SHADOW_ENABLED is exactly "true"', () => {
    process.env.GEMINI_API_KEY = 'key';
    for (const value of ['false', '1', 'TRUE', 'yes', '']) {
      process.env.GAMES_RERANK_SHADOW_ENABLED = value;
      const configured = getConfiguredGameRerankProvider();
      expect(configured.enabled).toBe(false);
      expect(configured.provider).toBeNull();
    }
  });

  it('produces a provider when enabled with a key', () => {
    process.env.GAMES_RERANK_SHADOW_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'key';
    const configured = getConfiguredGameRerankProvider();
    expect(configured.enabled).toBe(true);
    expect(configured.provider).not.toBeNull();
  });

  it('is independent of the taste flag in both directions', () => {
    process.env.GEMINI_API_KEY = 'key';

    process.env.GAMING_AI_TASTE_ENABLED = 'true';
    process.env.GAMES_RERANK_SHADOW_ENABLED = 'false';
    expect(getConfiguredGameTasteProvider().enabled).toBe(true);
    expect(getConfiguredGameRerankProvider().enabled).toBe(false);

    process.env.GAMING_AI_TASTE_ENABLED = 'false';
    process.env.GAMES_RERANK_SHADOW_ENABLED = 'true';
    expect(getConfiguredGameTasteProvider().enabled).toBe(false);
    expect(getConfiguredGameRerankProvider().enabled).toBe(true);
  });

  it('resolves the same model whether enabled or not', () => {
    process.env.GEMINI_RERANK_MODEL = 'models/gemini-3.6-flash';
    process.env.GEMINI_API_KEY = 'key';

    process.env.GAMES_RERANK_SHADOW_ENABLED = 'false';
    const off = getConfiguredGameRerankProvider().model;
    process.env.GAMES_RERANK_SHADOW_ENABLED = 'true';
    const on = getConfiguredGameRerankProvider().model;

    expect(off).toBe('gemini-3.6-flash');
    expect(on).toBe(off);
  });
});
