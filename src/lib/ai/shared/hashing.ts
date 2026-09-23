import { createHash } from 'node:crypto';

/**
 * Stable serialisation and digests for AI cache keys.
 *
 * Two stringifiers, and the difference matters. Both existed independently before this module and
 * both are load-bearing for a live cache key, so neither can be quietly replaced by the other:
 *
 *   - key order differs. `stableStringify` sorts by code point; `localeStableStringify` sorts with
 *     `localeCompare`, which orders `"a"` before `"B"` where code points do the reverse.
 *   - undefined differs. `stableStringify` drops keys whose value is undefined;
 *     `localeStableStringify` emits them as the literal `undefined`, producing invalid JSON that
 *     is nevertheless a perfectly stable digest input.
 *
 * New categories should use `stableStringify`. `localeStableStringify` exists because the games
 * taste evidence hash was computed with it against live cache rows, and changing it would
 * invalidate every stored profile for no gain.
 */

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Key order must not affect a digest, so object keys are emitted sorted by code point. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

/**
 * Locale-ordered variant. Pinned for hash compatibility — see the module comment.
 *
 * Do not "fix" this to match `stableStringify`: the two produce different bytes for the same
 * object, and this one is what every stored games taste profile was keyed with.
 */
export function localeStableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(localeStableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${localeStableStringify(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Short, non-reversible handle for logs. Never log the full hash alongside user context. */
export function hashPrefix(hash: string): string {
  return hash.slice(0, 8);
}
