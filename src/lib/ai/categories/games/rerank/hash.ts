import {
  computeRerankInputHashFor,
  computeShuffleSeedFor,
  hashPrefix,
  type RerankHashVersions,
} from '@/lib/ai/shared/rank/rerank-hash';
import {
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_PROMPT_VERSION,
  GAME_RERANK_SCHEMA_VERSION,
  GAME_RERANK_SHUFFLE_SEED_VERSION,
  type GameRerankCandidatePayload,
  type GameRerankTastePayload,
} from './types';

export { hashPrefix };

/** The version stamps that identify a games rerank question. */
export const GAME_RERANK_HASH_VERSIONS: RerankHashVersions = {
  promptVersion: GAME_RERANK_PROMPT_VERSION,
  schemaVersion: GAME_RERANK_SCHEMA_VERSION,
  payloadVersion: GAME_RERANK_PAYLOAD_VERSION,
  shuffleSeedVersion: GAME_RERANK_SHUFFLE_SEED_VERSION,
};

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

/** Games binding of the shared rerank hash. See `shared/rank/rerank-hash.ts` for what it omits. */
export function computeRerankInputHash(input: RerankHashInput): string {
  return computeRerankInputHashFor({ ...input, versions: GAME_RERANK_HASH_VERSIONS });
}

export function computeShuffleSeed(rerankInputHash: string): string {
  return computeShuffleSeedFor(GAME_RERANK_SHUFFLE_SEED_VERSION, rerankInputHash);
}
