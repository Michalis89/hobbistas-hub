import type { GameHistoryEntry } from '@/lib/recommendations/v3/games/games-types';

jest.mock('server-only', () => ({}), { virtual: true });

const mockLoadUserMediaHistory = jest.fn();
jest.mock('@/lib/recommendations/v3/games/games-recommender', () => ({
  loadUserMediaHistory: (...args: unknown[]) => mockLoadUserMediaHistory(...args),
}));

const mockReadCache = jest.fn();
const mockWriteCache = jest.fn();
jest.mock('../cache', () => ({
  readCachedGameAiTasteProfile: (...args: unknown[]) => mockReadCache(...args),
  writeCachedGameAiTasteProfile: (...args: unknown[]) => mockWriteCache(...args),
}));

import {
  DEFAULT_GEMINI_TASTE_TIMEOUT_MS,
  GAME_AI_TASTE_MAX_QUOTA_COOLDOWN_MS,
  GAME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS,
  generateGameAiTasteProfile,
  getGameTasteTimeoutMs,
  resetGameAiTasteRuntimeState,
} from '../service';
import { GeminiTasteProviderError } from '../provider';

// The service keeps process-local in-flight and cooldown maps; clear them so suites stay isolated.
beforeEach(() => {
  resetGameAiTasteRuntimeState();
});

function historyEntry(id: number, title: string): GameHistoryEntry {
  return {
    id,
    mediaId: id,
    status: 'completed',
    score: 9,
    progress: null,
    priority: null,
    isFavorite: id <= 2,
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

function adequateHistory(): GameHistoryEntry[] {
  return [
    historyEntry(1, 'Baldur’s Gate 3'),
    historyEntry(2, 'The Witcher 3'),
    historyEntry(3, 'Bloodborne'),
    historyEntry(4, 'Elden Ring'),
    historyEntry(5, 'Dragon Age Origins'),
    historyEntry(6, 'Mass Effect 2'),
  ];
}

function validProviderProfile() {
  return {
    schemaVersion: 1,
    identity: {
      label: 'Narrative Explorer',
      description: 'You favor authored RPG worlds with consequential progression.',
    },
    pillars: [
      {
        name: 'Story-rich RPGs',
        kind: 'content',
        description: 'Choice-heavy fantasy RPGs form the center.',
        evidenceTitles: ['Baldur’s Gate 3', 'The Witcher 3'],
      },
      {
        name: 'Atmospheric challenge',
        kind: 'content',
        description: 'Demanding atmospheric games appear as a supporting thread.',
        evidenceTitles: ['Bloodborne', 'Elden Ring'],
      },
    ],
    negativeSignals: [],
    summary: 'Your strongest signal is authored RPG depth with atmospheric challenge alongside it.',
    openQuestions: [],
  };
}

describe('generateGameAiTasteProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadUserMediaHistory.mockResolvedValue(adequateHistory());
    mockReadCache.mockResolvedValue(null);
    delete process.env.GEMINI_TASTE_TIMEOUT_MS;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.GEMINI_TASTE_TIMEOUT_MS;
  });

  it('returns cache hits without calling the provider', async () => {
    const cached = { source: 'ai', inputHash: 'hash', model: 'gemini-2.5-flash' };
    mockReadCache.mockResolvedValue(cached);
    const provider = { generateProfile: jest.fn() };

    const result = await generateGameAiTasteProfile({} as never, 'user-1', {
      enabled: true,
      model: 'gemini-2.5-flash',
      provider,
    });

    expect(result).toBe(cached);
    expect(provider.generateProfile).not.toHaveBeenCalled();
  });

  it('calls provider and writes cache on cache miss with valid output', async () => {
    const provider = { generateProfile: jest.fn().mockResolvedValue(validProviderProfile()) };

    const result = await generateGameAiTasteProfile({} as never, 'user-1', {
      enabled: true,
      model: 'gemini-2.5-flash',
      provider,
    });

    expect(provider.generateProfile).toHaveBeenCalledTimes(1);
    expect(mockWriteCache).toHaveBeenCalledTimes(1);
    expect(result?.source).toBe('ai');
    expect(result?.pillars[0].strengthBand).toBeDefined();
  });

  it('does not cache invalid provider output and falls back gracefully', async () => {
    const provider = {
      generateProfile: jest.fn().mockResolvedValue({
        ...validProviderProfile(),
        pillars: [
          {
            name: 'Fake',
            kind: 'content',
            description: 'Invalid title.',
            evidenceTitles: ['Imaginary Game', 'The Witcher 3'],
          },
          validProviderProfile().pillars[1],
        ],
      }),
    };

    const result = await generateGameAiTasteProfile({} as never, 'user-1', {
      enabled: true,
      model: 'gemini-2.5-flash',
      provider,
    });

    expect(result).toBeNull();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('does not call provider when disabled', async () => {
    const provider = { generateProfile: jest.fn() };

    const result = await generateGameAiTasteProfile({} as never, 'user-1', {
      enabled: false,
      model: 'gemini-2.5-flash',
      provider,
    });

    expect(result).toBeNull();
    expect(provider.generateProfile).not.toHaveBeenCalled();
  });

  it('does not call provider when key/provider is missing', async () => {
    const result = await generateGameAiTasteProfile({} as never, 'user-1', {
      enabled: true,
      model: 'gemini-2.5-flash',
      provider: null,
    });

    expect(result).toBeNull();
  });

  it('falls back gracefully when the provider times out', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider = {
      generateProfile: jest.fn(
        (_input: unknown) =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new DOMException('This operation was aborted', 'AbortError')), 1);
          }),
      ),
    };

    const resultPromise = generateGameAiTasteProfile({} as never, 'user-1', {
      enabled: true,
      model: 'gemini-3.6-flash',
      provider,
      timeoutMs: 1,
    });
    await jest.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toBeNull();
    expect(mockWriteCache).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[gaming-ai-taste] generation timed out after 1ms');
  });
});

describe('getGameTasteTimeoutMs', () => {
  afterEach(() => {
    delete process.env.GEMINI_TASTE_TIMEOUT_MS;
  });

  it('defaults to 20 seconds', () => {
    expect(getGameTasteTimeoutMs()).toBe(DEFAULT_GEMINI_TASTE_TIMEOUT_MS);
  });

  it('clamps configured values to a safe range', () => {
    process.env.GEMINI_TASTE_TIMEOUT_MS = '1';
    expect(getGameTasteTimeoutMs()).toBe(5_000);

    process.env.GEMINI_TASTE_TIMEOUT_MS = '120000';
    expect(getGameTasteTimeoutMs()).toBe(60_000);
  });
});

describe('provider call amplification', () => {
  const supabase = {} as never;

  function options(provider: { generateProfile: jest.Mock }) {
    return { provider, enabled: true, model: 'gemini-3.6-flash' };
  }

  beforeEach(() => {
    mockLoadUserMediaHistory.mockResolvedValue(adequateHistory());
    mockReadCache.mockResolvedValue(null);
    mockWriteCache.mockResolvedValue(undefined);
  });

  it('shares one provider call between concurrent requests for the same user', async () => {
    // React StrictMode mounts the dashboard section twice, firing two identical requests.
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    const generateProfile = jest.fn().mockReturnValue(gate);

    const first = generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }));
    const second = generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }));

    // Let both requests get past their history/cache awaits and reach the in-flight map.
    await new Promise(resolve => setTimeout(resolve, 0));
    release(validProviderProfile());
    const [a, b] = await Promise.all([first, second]);

    expect(generateProfile).toHaveBeenCalledTimes(1);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });

  it('does not share a generation across different users', async () => {
    const generateProfile = jest.fn().mockResolvedValue(validProviderProfile());

    await Promise.all([
      generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile })),
      generateGameAiTasteProfile(supabase, 'user-2', options({ generateProfile })),
    ]);

    expect(generateProfile).toHaveBeenCalledTimes(2);
  });

  it('backs off for the provider-supplied delay after a rate limit', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const generateProfile = jest
      .fn()
      .mockRejectedValue(new GeminiTasteProviderError(429, 'RESOURCE_EXHAUSTED', 30_000));

    expect(await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }))).toBeNull();
    // A reload inside the cooldown must not spend another request.
    expect(await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }))).toBeNull();

    expect(generateProfile).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('clamps an absent or extreme retry hint into a sane cooldown', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    const noHint = jest.fn().mockRejectedValue(new GeminiTasteProviderError(429, null, null));
    await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile: noHint }));
    await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile: noHint }));
    expect(noHint).toHaveBeenCalledTimes(1);

    resetGameAiTasteRuntimeState();

    const hugeHint = jest
      .fn()
      .mockRejectedValue(new GeminiTasteProviderError(429, null, 24 * 60 * 60_000));
    await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile: hugeHint }));

    // Advance past the ceiling; a day-long hint must not lock the feature out for a day.
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + GAME_AI_TASTE_MAX_QUOTA_COOLDOWN_MS + 1);
    await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile: hugeHint }));
    expect(hugeHint).toHaveBeenCalledTimes(2);

    expect(GAME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS).toBeLessThan(
      GAME_AI_TASTE_MAX_QUOTA_COOLDOWN_MS,
    );
    jest.restoreAllMocks();
    warn.mockRestore();
  });

  it('retries once the rate-limit cooldown has elapsed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    const generateProfile = jest
      .fn()
      .mockRejectedValueOnce(new GeminiTasteProviderError(429, 'RESOURCE_EXHAUSTED', 10_000))
      .mockResolvedValueOnce(validProviderProfile());

    expect(await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }))).toBeNull();

    // A 10s hint on a daily quota is not a real reset, so it is floored at the provider cooldown.
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + GAME_AI_TASTE_MIN_QUOTA_COOLDOWN_MS + 1);
    expect(
      await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile })),
    ).not.toBeNull();

    expect(generateProfile).toHaveBeenCalledTimes(2);
    jest.restoreAllMocks();
    warn.mockRestore();
  });

  it('does not re-attempt a generation that failed validation', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const generateProfile = jest.fn().mockResolvedValue({ schemaVersion: 1 });

    await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }));
    await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }));

    expect(generateProfile).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('still serves a cached profile while a cooldown is active', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const generateProfile = jest
      .fn()
      .mockRejectedValue(new GeminiTasteProviderError(429, null, 30_000));

    await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }));

    mockReadCache.mockResolvedValue({ identity: { label: 'Cached' }, source: 'ai' });
    const result = await generateGameAiTasteProfile(supabase, 'user-1', options({ generateProfile }));

    expect(result).toMatchObject({ identity: { label: 'Cached' } });
    expect(generateProfile).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
