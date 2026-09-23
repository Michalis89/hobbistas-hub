import { trackRecommendationClick } from '../client';

/** jsdom's Blob has no `.text()`, so read it the long way. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('trackRecommendationClick', () => {
  const originalBeacon = navigator.sendBeacon;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ status: 204 });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: originalBeacon,
      configurable: true,
      writable: true,
    });
  });

  function stubBeacon(implementation: unknown) {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: implementation,
      configurable: true,
      writable: true,
    });
  }

  it('prefers sendBeacon so the event survives the navigation', () => {
    const beacon = jest.fn().mockReturnValue(true);
    stubBeacon(beacon);

    trackRecommendationClick({ serveId: 'serve-1', mediaId: 42 });

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe('/api/recommendations/events');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the media id and no title', async () => {
    const beacon = jest.fn().mockReturnValue(true);
    stubBeacon(beacon);

    trackRecommendationClick({ serveId: 'serve-1', mediaId: 42 });

    const blob = beacon.mock.calls[0][1] as Blob;
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await readBlob(blob))).toEqual({
      serveId: 'serve-1',
      mediaId: 42,
      eventType: 'click',
    });
  });

  it('falls back to a keepalive fetch when sendBeacon refuses the payload', () => {
    stubBeacon(jest.fn().mockReturnValue(false));

    trackRecommendationClick({ serveId: 'serve-1', mediaId: 42 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true });
  });

  it('falls back to fetch when sendBeacon is unavailable', () => {
    stubBeacon(undefined);

    trackRecommendationClick({ serveId: 'serve-1', mediaId: 42 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a serve id or media id', () => {
    const beacon = jest.fn().mockReturnValue(true);
    stubBeacon(beacon);

    trackRecommendationClick({ mediaId: 42 });
    trackRecommendationClick({ serveId: 'serve-1' });
    trackRecommendationClick({});

    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when the transport blows up', () => {
    stubBeacon(() => {
      throw new Error('beacon exploded');
    });
    fetchMock.mockImplementation(() => {
      throw new Error('fetch exploded');
    });

    expect(() => trackRecommendationClick({ serveId: 'serve-1', mediaId: 42 })).not.toThrow();
  });

  it('never rejects when the fetch fallback fails', () => {
    stubBeacon(undefined);
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(() => trackRecommendationClick({ serveId: 'serve-1', mediaId: 42 })).not.toThrow();
  });
});
