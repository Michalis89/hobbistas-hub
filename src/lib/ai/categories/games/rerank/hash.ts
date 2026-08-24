import { hashPrefix, sha256Hex, stableStringify } from '@/lib/ai/shared/hashing';
import {
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_PROMPT_VERSION,
  GAME_RERANK_SCHEMA_VERSION,
  GAME_RERANK_SHUFFLE_SEED_VERSION,
  type GameRerankCandidatePayload,
  type GameRerankTastePayload,
} from './types';
import { fingerprintCandidates, fingerprintTaste } from './payload';

export { hashPrefix };

export type RerankHashInput = {
  /** Phase 1 profile input hash, so a regenerated taste profile invalidates the rerank. */
  tasteInputHash: string;
  taste: GameRerankTastePayload;
  /** In deterministic shortlist order — reordering the shortlist is a different question. */
  candidates: readonly GameRerankCandidatePayload[];
  /** Media ids in deterministic shortlist order. Never sent to the provider; local only. */
  shortlistMediaIds: readonly number[];
  model: string;
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
export function computeRerankInputHash(input: RerankHashInput): string {
  const payload = {
    tasteInputHash: input.tasteInputHash,
    tasteFingerprint: fingerprintTaste(input.taste),
    // Both the feature digest and the id order matter: same games in a different deterministic
    // order is a different shortlist, and a metadata backfill changes the question being asked.
    candidateFingerprint: fingerprintCandidates(input.candidates),
    shortlistMediaIds: [...input.shortlistMediaIds],
    model: input.model,
    promptVersion: GAME_RERANK_PROMPT_VERSION,
    schemaVersion: GAME_RERANK_SCHEMA_VERSION,
    payloadVersion: GAME_RERANK_PAYLOAD_VERSION,
    shuffleSeedVersion: GAME_RERANK_SHUFFLE_SEED_VERSION,
  };

  return sha256Hex(stableStringify(payload));
}

/**
 * Seed for the candidate shuffle.
 *
 * Derived from the rerank hash so it is stable for identical input and changes whenever the
 * question does, without being guessable from the candidate list alone.
 */
export function computeShuffleSeed(rerankInputHash: string): string {
  return `${GAME_RERANK_SHUFFLE_SEED_VERSION}:${rerankInputHash}`;
}

