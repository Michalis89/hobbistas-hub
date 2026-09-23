import {
  computeRerankInputHashFor,
  computeShuffleSeedFor,
  hashPrefix,
  type RerankHashVersions,
} from '@/lib/ai/shared/rank/rerank-hash';
import {
  ANIME_RERANK_PAYLOAD_VERSION,
  ANIME_RERANK_PROMPT_VERSION,
  ANIME_RERANK_SCHEMA_VERSION,
  ANIME_RERANK_SHUFFLE_SEED_VERSION,
  type AnimeRerankCandidatePayload,
  type AnimeRerankTastePayload,
} from './types';

export { hashPrefix };

/** The version stamps that identify an anime rerank question. */
export const ANIME_RERANK_HASH_VERSIONS: RerankHashVersions = {
  promptVersion: ANIME_RERANK_PROMPT_VERSION,
  schemaVersion: ANIME_RERANK_SCHEMA_VERSION,
  payloadVersion: ANIME_RERANK_PAYLOAD_VERSION,
  shuffleSeedVersion: ANIME_RERANK_SHUFFLE_SEED_VERSION,
};

export type AnimeRerankHashInput = {
  /** Taste evidence hash, so a regenerated profile invalidates the rerank. */
  tasteInputHash: string;
  taste: AnimeRerankTastePayload;
  /** In deterministic shortlist order — reordering the shortlist is a different question. */
  candidates: readonly AnimeRerankCandidatePayload[];
  /** Media ids in deterministic shortlist order. Never sent to the provider; local only. */
  shortlistMediaIds: readonly number[];
  model: string;
};

export function computeAnimeRerankInputHash(input: AnimeRerankHashInput): string {
  return computeRerankInputHashFor({ ...input, versions: ANIME_RERANK_HASH_VERSIONS });
}

export function computeAnimeShuffleSeed(rerankInputHash: string): string {
  return computeShuffleSeedFor(ANIME_RERANK_SHUFFLE_SEED_VERSION, rerankInputHash);
}
