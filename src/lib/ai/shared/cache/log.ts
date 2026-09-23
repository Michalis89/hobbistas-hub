/**
 * Cache logging that survives a missing table.
 *
 * Every AI table is optional at runtime: the feature must keep working against a database where
 * the migration has not been applied, degrading to "uncached" rather than throwing. A missing
 * table is therefore warned about at most once per process — repeating it on every request turns
 * one configuration fact into a log flood.
 */

const missingTablesLogged = new Set<string>();

export type CacheErrorLike = { code?: string; message?: string };

/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = '42P01';

export function isMissingTableError(error: CacheErrorLike): boolean {
  return error.code === UNDEFINED_TABLE;
}

export type CacheFailureLog = {
  /** Log prefix, e.g. `gaming-ai-taste`. */
  scope: string;
  /** What failed, e.g. `cache read`. Rendered as `[scope] <label> failed:`. */
  label: string;
  error: CacheErrorLike;
  /**
   * One-time notice when the table is absent, already including what the caller degrades to.
   *
   * `null` stays silent — appropriate where an absent table simply means the feature upstream was
   * never set up, and the caller has nothing useful to say about it.
   */
  missingTable: { key: string; message: string } | null;
};

export function logCacheFailure({ scope, label, error, missingTable }: CacheFailureLog): void {
  if (isMissingTableError(error)) {
    if (!missingTable) {
      return;
    }
    const key = `${scope}:${missingTable.key}`;
    if (!missingTablesLogged.has(key)) {
      missingTablesLogged.add(key);
      console.warn(`[${scope}] ${missingTable.message}`);
    }
    return;
  }
  console.warn(`[${scope}] ${label} failed:`, error.message ?? error);
}

/** Test seam. */
export function resetCacheLogState(): void {
  missingTablesLogged.clear();
}
