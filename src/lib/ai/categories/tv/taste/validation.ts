import { calculateStrengthBand, calculateStrengthDiagnostics } from '@/lib/ai/shared/taste/strength';
import { validateTasteProfile } from '@/lib/ai/shared/taste/validation';
import type { TasteValidationResult } from '@/lib/ai/shared/taste/adapter';
import { isNearlyFinished } from './evidence';
import {
  AiTvTasteProfileSchema,
  type AiTvTasteProfile,
  type EnrichedAiTvTasteProfile,
  type TvAiEvidenceDocument,
  type TvAiEvidenceEntry,
  type TvAiStrengthBand,
} from './types';

/**
 * The tv binding of the shared validator.
 *
 * No repeat damping on cited mass, unlike films. Seasons have already merged into one entry by the
 * time anything is cited, so a series contributes exactly one weight however long it ran — the
 * damping films need exists precisely because their instalments stay separate.
 */

export function validateAiTvTasteProfile(
  raw: unknown,
  evidence: TvAiEvidenceDocument,
): TasteValidationResult<AiTvTasteProfile> {
  return validateTasteProfile<TvAiEvidenceEntry, AiTvTasteProfile>(raw, {
    schema: AiTvTasteProfileSchema,
    entries: evidence.entries,
    clearAversionCount: evidence.dataQuality.clearAversionCount,
    identityLabelMaxWords: 4,
    isNearlyFinished: entry => isNearlyFinished(entry.watchedRatio),
    forbidUnsupportedRejectionProse: true,
  });
}

export function enrichAiTvTasteProfile(
  profile: AiTvTasteProfile,
  evidence: TvAiEvidenceDocument,
  model: string,
  inputHash: string,
): EnrichedAiTvTasteProfile {
  return {
    ...profile,
    pillars: profile.pillars.map(pillar => ({
      ...pillar,
      strengthBand: calculateTvStrengthBand(pillar.evidenceTitles, evidence),
    })),
    dataQuality: evidence.dataQuality,
    source: 'ai',
    model,
    inputHash,
  };
}

export function calculateTvStrengthBand(
  evidenceTitles: string[],
  evidence: TvAiEvidenceDocument,
): TvAiStrengthBand {
  return calculateStrengthBand(evidenceTitles, { entries: evidence.entries });
}

/** Exposed for diagnostics and tests; the band above is what the profile carries. */
export function calculateTvStrengthDiagnostics(
  evidenceTitles: string[],
  evidence: TvAiEvidenceDocument,
) {
  return calculateStrengthDiagnostics(evidenceTitles, { entries: evidence.entries });
}
