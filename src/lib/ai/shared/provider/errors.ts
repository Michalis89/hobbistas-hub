/**
 * Provider failure classification.
 *
 * The only thing callers actually need from a failed provider call is how long to stay away, and
 * that is decided by three questions: did we cut it off, did the provider refuse us, or is the
 * integration broken? Everything here exists to keep those three distinguishable.
 */

/**
 * A non-2xx response from the provider, carrying enough detail to decide a backoff.
 *
 * A 429 recovers on its own schedule and should not be treated like a broken integration.
 */
export class AiProviderHttpError extends Error {
  readonly status: number;
  /** Server-suggested wait, in ms; null when the response did not offer one. */
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null) {
    super(message);
    this.name = 'AiProviderHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Whether an error is our own timeout firing.
 *
 * Checked structurally rather than with `instanceof DOMException` alone because the abort reason
 * that reaches us differs between the runtime, undici and the test environment.
 */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException ||
      (typeof error === 'object' && error !== null && 'name' in error)) &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
