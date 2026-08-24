/**
 * Shares one running operation between identical concurrent callers.
 *
 * The dashboard mounts AI sections twice under React StrictMode, so two identical requests arrive
 * concurrently and each would otherwise spend its own provider call. Sharing the promise halves
 * consumption without any client change.
 *
 * Process-local, and therefore best-effort: it is a spend limiter, not a distributed lock.
 */
export class InFlightRegistry<T> {
  private readonly pending = new Map<string, Promise<T>>();

  get(key: string): Promise<T> | undefined {
    return this.pending.get(key);
  }

  /** Starts `factory` under `key`, or joins the run already under it. */
  run(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      return existing;
    }

    const started = factory().finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, started);
    return started;
  }

  /** Test seam; also stops entries leaking between suites. */
  clear(): void {
    this.pending.clear();
  }
}
