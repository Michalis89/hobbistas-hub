import { sha256Hex, stableStringify } from '@/lib/ai/shared/hashing';
import { seededShuffle } from '@/lib/ai/shared/shuffle';
import type { RerankTastePayload } from './taste-payload';

/**
 * The envelope every rerank request travels in.
 *
 * Generic in the candidate only. What a candidate *is* — game modes and perspectives, episode
 * counts and studios, page counts and publishers — is the one genuinely per-category part of a
 * rerank payload; the taste block, the version stamp and the shuffle are identical everywhere.
 */
export type RerankRequestPayload<TCandidate> = {
  payloadVersion: string;
  taste: RerankTastePayload;
  /** Shuffled, so list position cannot leak the deterministic ordering. */
  candidates: TCandidate[];
};

/**
 * Shuffles candidates so their input position cannot leak the deterministic ordering.
 *
 * Hiding the score is not enough on its own: models anchor on list order at least as hard as on
 * stated numbers, and sending the list in rank order would make "the AI agrees" indistinguishable
 * from "the AI copied the order it was given". The seed is derived from the payload itself, so
 * identical input always produces an identical shuffle — a refresh cannot reshuffle its way to a
 * different answer, and the cache stays meaningful.
 */
export function shuffleRerankCandidates<TCandidate>(
  candidates: readonly TCandidate[],
  seed: string,
): TCandidate[] {
  return seededShuffle(candidates, seed);
}

export function buildRerankRequestEnvelope<TCandidate>(
  payloadVersion: string,
  taste: RerankTastePayload,
  candidates: readonly TCandidate[],
  seed: string,
): RerankRequestPayload<TCandidate> {
  return {
    payloadVersion,
    taste,
    candidates: shuffleRerankCandidates(candidates, seed),
  };
}

/**
 * Truncates free text at a word boundary where possible.
 *
 * Cutting mid-word produces a fragment the model may treat as a real title or term; backing up to
 * the last space keeps the text honest at the cost of a few characters. The 0.6 floor stops a
 * pathological input — one very long word — from collapsing the whole field to almost nothing.
 */
export function truncateNarrativeText(
  text: string | null | undefined,
  maxChars: number,
): string | null {
  if (!text) {
    return null;
  }
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return null;
  }
  if (collapsed.length <= maxChars) {
    return collapsed;
  }

  const hardCut = collapsed.slice(0, maxChars);
  const lastSpace = hardCut.lastIndexOf(' ');
  const body = lastSpace > maxChars * 0.6 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${body.replace(/[\s.,;:—-]+$/, '')}…`;
}

/** Stable digest of exactly the fields that will be sent, used for both the seed and the hash. */
export function fingerprintRerankCandidates<TCandidate>(
  candidates: readonly TCandidate[],
): string {
  return sha256Hex(stableStringify(candidates));
}

export function fingerprintRerankTaste(taste: RerankTastePayload): string {
  return sha256Hex(stableStringify(taste));
}

export { stableStringify };
