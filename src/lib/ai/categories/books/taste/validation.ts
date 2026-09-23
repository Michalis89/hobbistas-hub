import { calculateStrengthBand, calculateStrengthDiagnostics } from '@/lib/ai/shared/taste/strength';
import { validateTasteProfile } from '@/lib/ai/shared/taste/validation';
import type { TasteValidationResult } from '@/lib/ai/shared/taste/adapter';
import { buildBooksFamilyPositiveMass, isNearlyFinished, resolveBooksCitedMass } from './evidence';
import {
  AiBooksTasteProfileSchema,
  type AiBooksTasteProfile,
  type BooksAiEvidenceDocument,
  type BooksAiEvidenceEntry,
  type BooksAiStrengthBand,
  type EnrichedAiBooksTasteProfile,
} from './types';

/**
 * The books binding of the shared validator.
 *
 * `forbidUnsupportedRejectionProse` is on, and it matters more here than anywhere else. Books are
 * the category where an unfinished entry is *least* likely to mean dislike, so a model reading a
 * shelf of abandoned novels is at maximum risk of writing "impatient with slow openings" about a
 * reader who simply got busy. When nothing in the library carries clear aversion evidence,
 * rejection language in prose discards the generation.
 */

export function validateAiBooksTasteProfile(
  raw: unknown,
  evidence: BooksAiEvidenceDocument,
): TasteValidationResult<AiBooksTasteProfile> {
  return validateTasteProfile<BooksAiEvidenceEntry, AiBooksTasteProfile>(raw, {
    schema: AiBooksTasteProfileSchema,
    entries: evidence.entries,
    clearAversionCount: evidence.dataQuality.clearAversionCount,
    identityLabelMaxWords: 4,
    isNearlyFinished: entry => isNearlyFinished(entry.readRatio),
    forbidUnsupportedRejectionProse: true,
  });
}

export function enrichAiBooksTasteProfile(
  profile: AiBooksTasteProfile,
  evidence: BooksAiEvidenceDocument,
  model: string,
  inputHash: string,
): EnrichedAiBooksTasteProfile {
  return {
    ...profile,
    pillars: profile.pillars.map(pillar => ({
      ...pillar,
      strengthBand: calculateBooksStrengthBand(pillar.evidenceTitles, evidence),
    })),
    dataQuality: evidence.dataQuality,
    source: 'ai',
    model,
    inputHash,
  };
}

export function calculateBooksStrengthBand(
  evidenceTitles: string[],
  evidence: BooksAiEvidenceDocument,
): BooksAiStrengthBand {
  return calculateStrengthBand(evidenceTitles, buildStrengthInput(evidence));
}

/** Exposed for diagnostics and tests; the band above is what the profile carries. */
export function calculateBooksStrengthDiagnostics(
  evidenceTitles: string[],
  evidence: BooksAiEvidenceDocument,
) {
  return calculateStrengthDiagnostics(evidenceTitles, buildStrengthInput(evidence));
}

function buildStrengthInput(evidence: BooksAiEvidenceDocument) {
  const familyMass = buildBooksFamilyPositiveMass(evidence.entries);
  return {
    entries: evidence.entries,
    // Damped by series, so a fourteen-volume epic cannot band every pillar it touches "Defining".
    resolveCitedMass: (entry: BooksAiEvidenceEntry) => resolveBooksCitedMass(entry, familyMass),
  };
}
