import { renderHook, waitFor } from '@testing-library/react';
import { useAiTasteProfile } from '../useAiTasteProfile';

const PROFILE = {
  identity: { label: 'Authored Drama', description: 'd' },
  pillars: [],
  negativeSignals: [],
  summary: 's',
  openQuestions: [],
  source: 'ai' as const,
};

describe('useAiTasteProfile', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: PROFILE }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('does not fetch while disabled', async () => {
    const { result } = renderHook(() => useAiTasteProfile('games', { enabled: false }));

    await waitFor(() => expect(result.current).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches once enabled and returns the profile', async () => {
    const { result } = renderHook(() => useAiTasteProfile('games', { enabled: true }));

    await waitFor(() => expect(result.current).toEqual(PROFILE));
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/ai-taste-profile?category=games', {
      cache: 'no-store',
      signal: expect.anything(),
    });
  });

  it('starts fetching when enabled flips from false to true', async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useAiTasteProfile('games', { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('keeps a delivered profile when a later response carries none', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useAiTasteProfile('games', { enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current).toEqual(PROFILE));

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ profile: null }) });
    rerender({ enabled: false });
    rerender({ enabled: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual(PROFILE);
  });

  it('renders nothing rather than throwing when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useAiTasteProfile('games', { enabled: true }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('ignores a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ profile: PROFILE }) });

    const { result } = renderHook(() => useAiTasteProfile('games', { enabled: true }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
