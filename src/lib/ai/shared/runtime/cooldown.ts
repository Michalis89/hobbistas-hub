/**
 * Backoff after a failed AI operation.
 *
 * Without this, every dashboard load re-attempts a generation that just failed. Process-local and
 * therefore best-effort — a spend limiter, not a correctness guarantee.
 */
export class CooldownRegistry {
  private readonly until = new Map<string, number>();

  /**
   * Milliseconds left on `key`'s cooldown, or null if it is clear.
   *
   * Expired entries are dropped as a side effect, so the map does not grow without bound across
   * a long-lived process.
   */
  remainingMs(key: string, now = Date.now()): number | null {
    const expiry = this.until.get(key);
    if (expiry === undefined) {
      return null;
    }
    if (expiry > now) {
      return expiry - now;
    }
    this.until.delete(key);
    return null;
  }

  start(key: string, cooldownMs: number, now = Date.now()): void {
    this.until.set(key, now + cooldownMs);
  }

  /** A success supersedes any earlier failure for the same input. */
  clearKey(key: string): void {
    this.until.delete(key);
  }

  /** Test seam; also stops entries leaking between suites. */
  clear(): void {
    this.until.clear();
  }
}

/**
 * Turns a provider's retry hint into a backoff we are willing to honour.
 *
 * Gemini's `retryDelay` on a *daily* free-tier quota reports tens of seconds, which is not a real
 * reset — honouring it literally would re-ask every minute for the rest of the day. The ceiling
 * exists so an extreme server hint cannot disable the feature for hours.
 */
export function clampQuotaCooldown(
  retryAfterMs: number | null,
  { min, max }: { min: number; max: number },
): number {
  if (retryAfterMs === null) {
    return min;
  }
  return Math.min(Math.max(retryAfterMs, min), max);
}
