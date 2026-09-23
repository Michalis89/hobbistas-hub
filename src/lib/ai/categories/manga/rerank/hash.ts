import {
  computeRerankInputHashFor,
  computeShuffleSeedFor,
  hashPrefix,
  type RerankHashVersions,
} from '@/lib/ai/shared/rank/rerank-hash';
import {
  MANGA_RERANK_PAYLOAD_VERSION,
  MANGA_RERANK_PROMPT_VERSION,
  MANGA_RERANK_SCHEMA_VERSION,
  MANGA_RERANK_SHUFFLE_SEED_VERSION,
  type MangaRerankCandidatePayload,
  type MangaRerankTastePayload,
} from './types';

export { hashPrefix };

/** The version stamps that identify a manga rerank question. */
export const MANGA_RERANK_HASH_VERSIONS: RerankHashVersions = {
  promptVersion: MANGA_RERANK_PROMPT_VERSION,
  schemaVersion: MANGA_RERANK_SCHEMA_VERSION,
  payloadVersion: MANGA_RERANK_PAYLOAD_VERSION,
  shuffleSeedVersion: MANGA_RERANK_SHUFFLE_SEED_VERSION,
};

export type MangaRerankHashInput = {
  tasteInputHash: string;
  taste: MangaRerankTastePayload;
  candidates: readonly MangaRerankCandidatePayload[];
  shortlistMediaIds: readonly number[];
  model: string;
};

export function computeMangaRerankInputHash(input: MangaRerankHashInput): string {
  return computeRerankInputHashFor({ ...input, versions: MANGA_RERANK_HASH_VERSIONS });
}

export function computeMangaShuffleSeed(rerankInputHash: string): string {
  return computeShuffleSeedFor(MANGA_RERANK_SHUFFLE_SEED_VERSION, rerankInputHash);
}
