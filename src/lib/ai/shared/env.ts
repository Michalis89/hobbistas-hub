/**
 * Clamped numeric environment readers.
 *
 * Every AI tunable is read this way rather than trusted: a typo in a deploy variable should
 * degrade to the documented default, not disable a timeout or ask for a million output tokens.
 * The two shapes differ in one deliberate way — see `readClampedFloatEnv`.
 */

export type ClampedEnvOptions = {
  fallback: number;
  min: number;
  max: number;
};

/**
 * Reads a positive integer setting: timeouts, token budgets, list sizes.
 *
 * Zero and negatives fall back rather than clamping to `min`, because for these settings a
 * non-positive value means "unset or wrong", never "the smallest allowed".
 */
export function readClampedIntEnv(name: string, { fallback, min, max }: ClampedEnvOptions): number {
  const configured = Number(process.env[name]);
  if (!Number.isFinite(configured) || configured <= 0) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.floor(configured), max));
}

/**
 * Reads a fractional setting: sample rates, blend weights.
 *
 * Unlike the integer reader, zero is a meaningful value here — a sample rate of 0 switches
 * sampling off — so only a non-numeric value falls back.
 */
export function readClampedFloatEnv(
  name: string,
  { fallback, min, max }: ClampedEnvOptions,
): number {
  const configured = Number(process.env[name]);
  if (!Number.isFinite(configured)) {
    return fallback;
  }
  return Math.max(min, Math.min(configured, max));
}
