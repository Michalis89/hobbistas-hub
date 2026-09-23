const ENDPOINT = '/api/recommendations/events';

export type RecommendationClickInput = {
  serveId?: string;
  mediaId?: number;
};

/**
 * Reports a click on a recommendation card.
 *
 * Fire-and-forget by design, and never allowed to interfere with what the click was actually for.
 * `sendBeacon` is used first because most of these clicks are navigations: a normal fetch would be
 * cancelled when the page unloads, while a beacon is queued by the browser and survives it. The
 * `keepalive` fetch is the fallback for browsers or contexts where `sendBeacon` is unavailable or
 * refuses the payload.
 *
 * Sends media id rather than title — the server already knows what it served, and a title would be
 * user library data travelling for no reason.
 */
export function trackRecommendationClick(input: RecommendationClickInput): void {
  if (typeof window === 'undefined' || !input.serveId || !Number.isFinite(input.mediaId)) {
    return;
  }

  const body = JSON.stringify({
    serveId: input.serveId,
    mediaId: input.mediaId,
    eventType: 'click',
  });

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (queued) {
        return;
      }
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // Telemetry only. A dropped click event is not worth surfacing to the user.
    });
  } catch {
    // Same: never let instrumentation break a navigation.
  }
}
