/** @jest-environment node */

jest.mock('server-only', () => ({}), { virtual: true });

const mockLoadHistory = jest.fn();
jest.mock('../history', () => ({
  __esModule: true,
  loadMangaHistory: (...args: unknown[]) => mockLoadHistory(...args),
}));

const mockReadCache = jest.fn();
const mockWriteCache = jest.fn();
jest.mock('../cache', () => ({
  __esModule: true,
  readCachedMangaAiTasteProfile: (...args: unknown[]) => mockReadCache(...args),
  writeCachedMangaAiTasteProfile: (...args: unknown[]) => mockWriteCache(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { MANGA_FIXTURE_HISTORY, mangaEntry } from '../../__fixtures__/manga-history.fixture';
import { generateMangaAiTasteProfile, resetMangaAiTasteRuntimeState } from '../service';
import {
  GeminiMangaTasteProviderError,
  type MangaTasteAiProvider,
  type MangaTasteProviderInput,
} from '../provider';
import { MANGA_AI_TASTE_PROMPT_VERSION, MANGA_AI_TASTE_SCHEMA_VERSION } from '../types';

const supabase = {} as SupabaseClient<Database>;

const VALID_PROFILE = {
  schemaVersion: 1,
  identity: { label: 'Bleak Historical Epics', description: 'Prefers weight over spectacle.' },
  pillars: [
    {
      name: 'Consequence-driven violence',
      kind: 'content',
      description: 'Violence that costs the characters something.',
      evidenceTitles: ['Vinland Saga', 'Berserk'],
    },
    {
      name: 'Long-form serialisation',
      kind: 'form',
      description: 'Follows arcs that build across hundreds of chapters.',
      evidenceTitles: ['Monster', '20th Century Boys'],
    },
  ],
  negativeSignals: [],
  summary: 'Returns to long, sombre stories where violence carries consequence.',
  openQuestions: [],
};

/**
 * A provider double whose mock records calls under the real input type.
 *
 * The generic is what lets a test read `mock.calls[0][0]` and get a typed evidence document. A
 * bare `jest.fn(impl)` over a zero-argument `impl` infers an empty argument tuple, so indexing
 * into a recorded call is a type error even though the call really did carry an argument.
 */
function provider(impl: () => Promise<unknown>): MangaTasteAiProvider & {
  generateProfile: jest.Mock<Promise<unknown>, [MangaTasteProviderInput]>;
} {
  return { generateProfile: jest.fn<Promise<unknown>, [MangaTasteProviderInput]>(impl) };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMangaAiTasteRuntimeState();
  mockLoadHistory.mockResolvedValue(MANGA_FIXTURE_HISTORY);
  mockReadCache.mockResolvedValue(null);
  mockWriteCache.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cache behaviour', () => {
  it('returns a cached profile without calling the provider', async () => {
    mockReadCache.mockResolvedValue({ ...VALID_PROFILE, pillars: [], dataQuality: {}, source: 'ai' });
    const ai = provider(async () => VALID_PROFILE);

    const result = await generateMangaAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: true,
      model: 'test-model',
    });

    expect(result).not.toBeNull();
    expect(ai.generateProfile).not.toHaveBeenCalled();
  });

  it('reads the cache under the manga category versions', async () => {
    await generateMangaAiTasteProfile(supabase, 'user-1', {
      provider: provider(async () => VALID_PROFILE),
      enabled: true,
      model: 'test-model',
    });

    expect(mockReadCache).toHaveBeenCalledWith(
      supabase,
      'user-1',
      expect.any(String),
      'test-model',
      MANGA_AI_TASTE_PROMPT_VERSION,
      MANGA_AI_TASTE_SCHEMA_VERSION,
    );
  });

  it('asks the cache for the same hash when the history has not changed', async () => {
    const ai = provider(async () => VALID_PROFILE);
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true, model: 'm' });
    resetMangaAiTasteRuntimeState();
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true, model: 'm' });

    const [firstHash] = mockReadCache.mock.calls[0].slice(2);
    const [secondHash] = mockReadCache.mock.calls[1].slice(2);
    expect(secondHash).toBe(firstHash);
  });

  it('asks for a different hash once the library changes', async () => {
    const ai = provider(async () => VALID_PROFILE);
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true, model: 'm' });

    mockLoadHistory.mockResolvedValue([
      ...MANGA_FIXTURE_HISTORY,
      mangaEntry({ id: 99, title: 'Blame!', status: 'completed', score: 9 }),
    ]);
    resetMangaAiTasteRuntimeState();
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true, model: 'm' });

    const [firstHash] = mockReadCache.mock.calls[0].slice(2);
    const [secondHash] = mockReadCache.mock.calls[1].slice(2);
    expect(secondHash).not.toBe(firstHash);
  });

  it('writes a successful generation to the cache', async () => {
    await generateMangaAiTasteProfile(supabase, 'user-1', {
      provider: provider(async () => VALID_PROFILE),
      enabled: true,
      model: 'test-model',
    });

    expect(mockWriteCache).toHaveBeenCalledWith(
      supabase,
      'user-1',
      expect.objectContaining({ source: 'ai', model: 'test-model' }),
      MANGA_AI_TASTE_PROMPT_VERSION,
      MANGA_AI_TASTE_SCHEMA_VERSION,
    );
  });
});

describe('refusals that cost nothing', () => {
  it('does not call the provider when the feature is disabled', async () => {
    const ai = provider(async () => VALID_PROFILE);
    const result = await generateMangaAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: false,
    });

    expect(result).toBeNull();
    expect(ai.generateProfile).not.toHaveBeenCalled();
  });

  it('does not call the provider for a sparse library', async () => {
    mockLoadHistory.mockResolvedValue([
      mangaEntry({ id: 1, title: 'Berserk', status: 'completed', score: 9 }),
      mangaEntry({ id: 2, title: 'Monster', status: 'completed', score: 9 }),
    ]);
    const ai = provider(async () => VALID_PROFILE);

    const result = await generateMangaAiTasteProfile(supabase, 'user-1', {
      provider: ai,
      enabled: true,
    });

    expect(result).toBeNull();
    expect(ai.generateProfile).not.toHaveBeenCalled();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });
});

describe('failure handling', () => {
  it('returns null and writes nothing when validation rejects the output', async () => {
    const result = await generateMangaAiTasteProfile(supabase, 'user-1', {
      provider: provider(async () => ({ schemaVersion: 2 })),
      enabled: true,
    });

    expect(result).toBeNull();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('refuses to re-ask while a validation cooldown is running', async () => {
    const ai = provider(async () => ({ schemaVersion: 2 }));
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true });
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true });

    expect(ai.generateProfile).toHaveBeenCalledTimes(1);
  });

  it('returns null rather than throwing when the provider errors', async () => {
    const result = await generateMangaAiTasteProfile(supabase, 'user-1', {
      provider: provider(async () => {
        throw new GeminiMangaTasteProviderError(500, 'boom', null);
      }),
      enabled: true,
    });

    expect(result).toBeNull();
  });

  it('backs off after a quota refusal', async () => {
    const ai = provider(async () => {
      throw new GeminiMangaTasteProviderError(429, 'quota', 1_000);
    });
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true });
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true });

    expect(ai.generateProfile).toHaveBeenCalledTimes(1);
  });

  it('returns null when the history load fails and produces nothing', async () => {
    mockLoadHistory.mockResolvedValue([]);
    const ai = provider(async () => VALID_PROFILE);

    expect(
      await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true }),
    ).toBeNull();
    expect(ai.generateProfile).not.toHaveBeenCalled();
  });
});

describe('concurrency', () => {
  it('shares one generation between concurrent callers', async () => {
    const ai = provider(
      () => new Promise(resolve => setTimeout(() => resolve(VALID_PROFILE), 10)),
    );

    const [first, second] = await Promise.all([
      generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true }),
      generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true }),
    ]);

    expect(ai.generateProfile).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});

describe('what the provider is given', () => {
  it('sends a manga evidence document and a deadline', async () => {
    const ai = provider(async () => VALID_PROFILE);
    await generateMangaAiTasteProfile(supabase, 'user-1', { provider: ai, enabled: true });

    const [input] = ai.generateProfile.mock.calls[0];
    expect(input.evidence.category).toBe('manga');
    expect(input.evidence.entries.length).toBeGreaterThan(0);
    expect(typeof input.deadlineAt).toBe('number');
  });
});
