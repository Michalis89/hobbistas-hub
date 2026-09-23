import { calculateStrengthBand, calculateStrengthDiagnostics } from '@/lib/ai/shared/taste/strength';
import { validateTasteProfile } from '@/lib/ai/shared/taste/validation';
import type { TasteValidationResult } from '@/lib/ai/shared/taste/adapter';
import {
  buildMoviesFamilyPositiveMass,
  isNearlyFinished,
  resolveMoviesCitedMass,
} from './evidence';
import {
  AiMoviesTasteProfileSchema,
  type AiMoviesTasteProfile,
  type EnrichedAiMoviesTasteProfile,
  type MoviesAiEvidenceDocument,
  type MoviesAiEvidenceEntry,
  type MoviesAiStrengthBand,
} from './types';

/**
 * The movies binding of the shared validator, plus the one rule films need of their own.
 *
 * `forbidUnsupportedRejectionProse` is on. A film library is the easiest place for a model to
 * assume dislike — everyone has films they walked out of, so "avoids overlong blockbusters" reads
 * plausibly even for a viewer who has abandoned nothing. When no negative signal survives and the
 * library holds no clear aversion evidence, rejection language in prose discards the generation,
 * because an unsupported claim inside a sentence cannot be excised the way an array entry can.
 */

export function validateAiMoviesTasteProfile(
  raw: unknown,
  evidence: MoviesAiEvidenceDocument,
): TasteValidationResult<AiMoviesTasteProfile> {
  return validateTasteProfile<MoviesAiEvidenceEntry, AiMoviesTasteProfile>(raw, {
    schema: AiMoviesTasteProfileSchema,
    entries: evidence.entries,
    clearAversionCount: evidence.dataQuality.clearAversionCount,
    identityLabelMaxWords: 4,
    isNearlyFinished: entry => isNearlyFinished(entry.watchedRatio),
    forbidUnsupportedRejectionProse: true,
  });
}

export function enrichAiMoviesTasteProfile(
  profile: AiMoviesTasteProfile,
  evidence: MoviesAiEvidenceDocument,
  model: string,
  inputHash: string,
): EnrichedAiMoviesTasteProfile {
  return {
    ...profile,
    pillars: profile.pillars.map(pillar => ({
      ...pillar,
      strengthBand: calculateMoviesStrengthBand(pillar.evidenceTitles, evidence),
    })),
    dataQuality: evidence.dataQuality,
    source: 'ai',
    model,
    inputHash,
  };
}

export function calculateMoviesStrengthBand(
  evidenceTitles: string[],
  evidence: MoviesAiEvidenceDocument,
): MoviesAiStrengthBand {
  return calculateStrengthBand(evidenceTitles, buildStrengthInput(evidence));
}

/** Exposed for diagnostics and tests; the band above is what the profile carries. */
export function calculateMoviesStrengthDiagnostics(
  evidenceTitles: string[],
  evidence: MoviesAiEvidenceDocument,
) {
  return calculateStrengthDiagnostics(evidenceTitles, buildStrengthInput(evidence));
}

function buildStrengthInput(evidence: MoviesAiEvidenceDocument) {
  const familyMass = buildMoviesFamilyPositiveMass(evidence.entries);
  return {
    entries: evidence.entries,
    // Damped by family, so a six-film series cannot supply six full-weight citations and dominate
    // every band it appears in.
    resolveCitedMass: (entry: MoviesAiEvidenceEntry) => resolveMoviesCitedMass(entry, familyMass),
  };
}
