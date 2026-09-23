import type { TasteEvidenceEntryCore, TasteStrengthBand } from './evidence-core';
import { buildEvidenceTitleMap, mapEvidenceTitles } from './validation';

/**
 * How much of the user's strongest evidence a pillar accounts for.
 *
 * The denominator is the sum of the heaviest `referenceEntryCount` positive entries rather than the
 * whole library's mass. Dividing by everything would make the share shrink as a library grew,
 * putting the top bands out of reach for exactly the users with the most evidence — the opposite of
 * what a strength band should say.
 *
 * Deterministic, and that is the point: the model produces prose and citations, never a number.
 * Every figure on a rendered profile is computed here or in the evidence builder.
 */

/** How many of the heaviest entries form the reference mass. */
export const DEFAULT_STRENGTH_REFERENCE_ENTRY_COUNT = 12;

export type StrengthDiagnostics = {
  evidenceMass: number;
  referenceMass: number;
  /** How many entries the reference mass was drawn from (fewer for small libraries). */
  referenceEntryCount: number;
  share: number;
  matchedTitleCount: number;
  /** Distinct families among the cited titles. */
  familyCount: number;
};

export type StrengthInput<TEntry extends TasteEvidenceEntryCore> = {
  entries: readonly TEntry[];
  /**
   * How much one cited entry is worth.
   *
   * A hook rather than `entry.weight` because a category may damp repeats within a family — a
   * five-season series should not count like five independent shows. Categories with no such
   * concern pass the weight straight through.
   */
  resolveCitedMass?: (entry: TEntry) => number;
  referenceEntryCount?: number;
};

export function calculateStrengthDiagnostics<TEntry extends TasteEvidenceEntryCore>(
  evidenceTitles: readonly string[],
  { entries, resolveCitedMass, referenceEntryCount }: StrengthInput<TEntry>,
): StrengthDiagnostics {
  const referenceCount = referenceEntryCount ?? DEFAULT_STRENGTH_REFERENCE_ENTRY_COUNT;
  const citedMass = resolveCitedMass ?? ((entry: TEntry) => entry.weight);

  const mapped = mapEvidenceTitles(evidenceTitles, buildEvidenceTitleMap(entries)) ?? [];

  // Deduped by identity: citing two titles that collapsed into the same entry is one piece of
  // evidence stated twice, not two.
  const seen = new Set<string>();
  const uniquePositive = mapped.filter(entry => {
    if (entry.weight <= 0 || seen.has(entry.identityKey)) {
      return false;
    }
    seen.add(entry.identityKey);
    return true;
  });

  const evidenceMass = uniquePositive.reduce((sum, entry) => sum + citedMass(entry), 0);

  const referenceMass = entries
    .filter(entry => entry.weight > 0)
    .map(entry => citedMass(entry))
    .sort((a, b) => b - a)
    .slice(0, referenceCount)
    .reduce((sum, mass) => sum + mass, 0);

  const drawnFrom = Math.min(referenceCount, entries.filter(entry => entry.weight > 0).length);

  return {
    evidenceMass: round(evidenceMass),
    referenceMass: round(referenceMass),
    referenceEntryCount: drawnFrom,
    share: referenceMass > 0 ? round(evidenceMass / referenceMass) : 0,
    matchedTitleCount: uniquePositive.length,
    familyCount: new Set(uniquePositive.map(entry => entry.familyKey)).size,
  };
}

export function calculateStrengthBand<TEntry extends TasteEvidenceEntryCore>(
  evidenceTitles: readonly string[],
  input: StrengthInput<TEntry>,
): TasteStrengthBand {
  const diagnostics = calculateStrengthDiagnostics(evidenceTitles, input);

  // One resolved title is an anecdote, not a pillar, however heavy it is.
  if (diagnostics.matchedTitleCount <= 1 || diagnostics.referenceMass <= 0) {
    return 'Emerging';
  }

  if (diagnostics.share >= 0.6) {
    return 'Defining';
  }
  if (diagnostics.share >= 0.35) {
    return 'Strong';
  }
  if (diagnostics.share >= 0.15) {
    return 'Present';
  }
  return 'Emerging';
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
