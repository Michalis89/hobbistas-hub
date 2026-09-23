/** @jest-environment node */

jest.mock('server-only', () => ({}), { virtual: true });

const mockLoadHistory = jest.fn();
jest.mock('../history', () => ({
  __esModule: true,
  loadAnimeHistory: (...args: unknown[]) => mockLoadHistory(...args),
}));

const mockReadCache = jest.fn();
const mockWriteCache = jest.fn();
jest.mock('../cache', () => ({
  __esModule: true,
  readCachedAnimeAiTasteProfile: (...args: unknown[]) => mockReadCache(...args),
  writeCachedAnimeAiTasteProfile: (...args: unknown[]) => mockWriteCache(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { ANIME_FIXTURE_HISTORY, animeEntry } from '../../__fixtures__/anime-history.fixture';
import {
  generateAnimeAiTasteProfile,
  resetAnimeAiTasteRuntimeState,
} from '../service';
import { GeminiAnimeTasteProviderError } from '../provider';
import { ANIME_AI_TASTE_PROMPT_VERSION, ANIME_AI_TASTE_SCHEMA_VERSION } from '../types';

const supabase = {} as SupabaseClient<Database>;

const VALID_PROFILE = {
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
};

function provider(impl: () => Promise<unknown>) {
  return { generateProfile: jest.fn(impl) };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAnimeAiTasteRuntimeState();
  mockLoadHistory.mockResolvedValue(ANIME_FIXTURE_HISTORY);
  mockReadCache.mockResolvedValue(null);
  mockWriteCache.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cache behaviour', () => {
  it('returns a cached profile without calling the provider', async () => {
    const cached = { ...VALID_PROFILE, pillars: [], dataQuality: {}, source: 'ai' };
    mockReadCache.mockResolvedValue(cached);
    const ai = provider(async () => VALID_PROFILE);

    const result = await generateAnimeAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: true,
      model: 'test-model',
    });

    expect(result).toBe(cached);
    expect(ai.generateProfile).not.toHaveBeenCalled();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('reads the cache with the anime prompt and schema versions', async () => {
    await generateAnimeAiTasteProfile(supabase, 'user-1', {
      provider: provider(async () => VALID_PROFILE),
      enabled: true,
      model: 'test-model',
    });

    expect(mockReadCache).toHaveBeenCalledWith(
      supabase,
      'user-1',
      expect.any(String),
      'test-model',
      ANIME_AI_TASTE_PROMPT_VERSION,
      ANIME_AI_TASTE_SCHEMA_VERSION,
    );
  });

  it('asks the cache for the same hash when the library is unchanged', async () => {
    const options = { provider: provider(async () => VALID_PROFILE), enabled: true, model: 'm' };
    await generateAnimeAiTasteProfile(supabase, 'user-1', options);
    await generateAnimeAiTasteProfile(supabase, 'user-1', options);

    const [firstHash] = [mockReadCache.mock.calls[0][2]];
    const [secondHash] = [mockReadCache.mock.calls[1][2]];
    expect(secondHash).toBe(firstHash);
  });

  it('asks for a different hash once the library changes', async () => {
    const options = { provider: provider(async () => VALID_PROFILE), enabled: true, model: 'm' };
    await generateAnimeAiTasteProfile(supabase, 'user-1', options);

    mockLoadHistory.mockResolvedValue([
      ...ANIME_FIXTURE_HISTORY,
      animeEntry({ id: 99, title: 'Ping Pong the Animation', status: 'completed', score: 10 }),
    ]);
    resetAnimeAiTasteRuntimeState();
    await generateAnimeAiTasteProfile(supabase, 'user-1', options);

    expect(mockReadCache.mock.calls[1][2]).not.toBe(mockReadCache.mock.calls[0][2]);
  });

  it('writes a validated profile back to the cache', async () => {
    await generateAnimeAiTasteProfile(supabase, 'user-1', {
      provider: provider(async () => VALID_PROFILE),
      enabled: true,
      model: 'test-model',
    });

    expect(mockWriteCache).toHaveBeenCalledTimes(1);
    const [, , written] = mockWriteCache.mock.calls[0];
    expect(written.source).toBe('ai');
    expect(written.model).toBe('test-model');
    expect(written.pillars[0].strengthBand).toBeDefined();
  });
});

describe('spend gates', () => {
  it('refuses a sparse library without calling the provider', async () => {
    mockLoadHistory.mockResolvedValue(ANIME_FIXTURE_HISTORY.slice(0, 3));
    const ai = provider(async () => VALID_PROFILE);

    const result = await generateAnimeAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: true,
    });

    expect(result).toBeNull();
    expect(ai.generateProfile).not.toHaveBeenCalled();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('does nothing when the feature flag is off', async () => {
    const ai = provider(async () => VALID_PROFILE);
    const result = await generateAnimeAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: false,
    });

    expect(result).toBeNull();
    expect(ai.generateProfile).not.toHaveBeenCalled();
  });

  it('shares one provider call between concurrent identical requests', async () => {
    // The StrictMode double mount: two requests arrive together and must not spend twice.
    const ai = provider(
      () => new Promise(resolve => setTimeout(() => resolve(VALID_PROFILE), 10)),
    );
    const options = { provider: ai, enabled: true, model: 'm' };

    await Promise.all([
      generateAnimeAiTasteProfile(supabase, 'user-1', options),
      generateAnimeAiTasteProfile(supabase, 'user-1', options),
    ]);

    expect(ai.generateProfile).toHaveBeenCalledTimes(1);
  });

  it('backs off after a provider failure instead of re-asking every load', async () => {
    const ai = provider(async () => {
      throw new GeminiAnimeTasteProviderError(500, 'boom', null);
    });
    const options = { provider: ai, enabled: true, model: 'm' };

    await generateAnimeAiTasteProfile(supabase, 'user-1', options);
    await generateAnimeAiTasteProfile(supabase, 'user-1', options);

    expect(ai.generateProfile).toHaveBeenCalledTimes(1);
  });

  it('backs off after a quota refusal', async () => {
    const ai = provider(async () => {
      throw new GeminiAnimeTasteProviderError(429, 'quota', 1_000);
    });
    const options = { provider: ai, enabled: true, model: 'm' };

    await generateAnimeAiTasteProfile(supabase, 'user-1', options);
    await generateAnimeAiTasteProfile(supabase, 'user-1', options);

    expect(ai.generateProfile).toHaveBeenCalledTimes(1);
  });

  it('never writes a cache row for output that fails validation', async () => {
    const ai = provider(async () => ({
      ...VALID_PROFILE,
      pillars: [
        { ...VALID_PROFILE.pillars[0], evidenceTitles: ['Not A Real Show', 'Nor This One'] },
        VALID_PROFILE.pillars[1],
      ],
    }));

    const result = await generateAnimeAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: true,
    });

    expect(result).toBeNull();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('gives up quietly when the provider times out', async () => {
    const ai = provider(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });

    const result = await generateAnimeAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: true,
      timeoutMs: 5_000,
    });

    expect(result).toBeNull();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });
});
