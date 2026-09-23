import { hashPrefix, sha256Hex, stableStringify } from '@/lib/ai/shared/hashing';
import type { RerankTastePayload } from './taste-payload';
import { fingerprintRerankCandidates, fingerprintRerankTaste } from './rerank-payload';

export { hashPrefix };

/** Everything about a category's contract that changes the question being asked. */
export type RerankHashVersions = {
  promptVersion: string;
  schemaVersion: number;
  payloadVersion: string;
  shuffleSeedVersion: string;
};

export type RerankHashInput<TCandidate> = {
  /** Phase 1 profile input hash, so a regenerated taste profile invalidates the rerank. */
  tasteInputHash: string;
  taste: RerankTastePayload;
  /** In deterministic shortlist order — reordering the shortlist is a different question. */
  candidates: readonly TCandidate[];
  /** Media ids in deterministic shortlist order. Never sent to the provider; local only. */
  shortlistMediaIds: readonly number[];
  model: string;
  versions: RerankHashVersions;
};

/**
 * Identity of a provider question.
 *
 * Contains only what changes the prompt. Notably absent: the blend weight and blend version.
 * Blending is pure post-processing over a stored ranking, so re-tuning the weight must be able to
 * recompute every past shadow run offline without spending a single new provider call. Folding
 * blend parameters in here would throw away the whole corpus on every tweak, which is the exact
 * opposite of what a shadow phase is for.
 */
export function computeRerankInputHashFor<TCandidate>(
  input: RerankHashInput<TCandidate>,
): string {
  const payload = {
    tasteInputHash: input.tasteInputHash,
    tasteFingerprint: fingerprintRerankTaste(input.taste),
    // Both the feature digest and the id order matter: the same titles in a different
    // deterministic order is a different shortlist, and a metadata backfill changes the question.
    candidateFingerprint: fingerprintRerankCandidates(input.candidates),
    shortlistMediaIds: [...input.shortlistMediaIds],
    model: input.model,
    promptVersion: input.versions.promptVersion,
    schemaVersion: input.versions.schemaVersion,
    payloadVersion: input.versions.payloadVersion,
    shuffleSeedVersion: input.versions.shuffleSeedVersion,
  };

  return sha256Hex(stableStringify(payload));
}

/**
 * Seed for the candidate shuffle.
 *
 * Derived from the rerank hash so it is stable for identical input and changes whenever the
 * question does, without being guessable from the candidate list alone.
 */
export function computeShuffleSeedFor(
  shuffleSeedVersion: string,
  rerankInputHash: string,
): string {
  return `${shuffleSeedVersion}:${rerankInputHash}`;
}
