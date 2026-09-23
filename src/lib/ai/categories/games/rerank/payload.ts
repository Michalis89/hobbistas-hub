import { buildRerankTokenMap, type RerankTokenMap } from '@/lib/ai/shared/rank/tokens';
import {
  buildRerankRequestEnvelope,
  fingerprintRerankCandidates,
  fingerprintRerankTaste,
  shuffleRerankCandidates,
  stableStringify,
  truncateNarrativeText,
} from '@/lib/ai/shared/rank/rerank-payload';
import { buildRerankTastePayload } from '@/lib/ai/shared/rank/taste-payload';
import type { GamesDiscoveryShortlistEntry } from '@/lib/recommendations/v3/games/games-types';
import type { EnrichedAiGamingTasteProfile } from '@/lib/ai/categories/games/taste/types';
import {
  GAME_RERANK_MAX_SHORTLIST,
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_SUMMARY_MAX_CHARS,
  type GameRerankCandidatePayload,
  type GameRerankRequestPayload,
  type GameRerankTastePayload,
} from './types';

/** Deterministic mapping between the opaque tokens sent out and the media ids kept in. */
export type GameRerankTokenMap = RerankTokenMap;

export function buildTokenMap(
  shortlist: readonly GamesDiscoveryShortlistEntry[],
): GameRerankTokenMap {
  return buildRerankTokenMap(
    shortlist.map(entry => entry.candidate.id),
    GAME_RERANK_MAX_SHORTLIST,
  );
}

/** Games binding of the shared truncation rule. */
export function truncateSummary(summary: string | null | undefined): string | null {
  return truncateNarrativeText(summary, GAME_RERANK_SUMMARY_MAX_CHARS);
}

function releaseYear(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) {
    return null;
  }
  const year = Number(String(releaseDate).slice(0, 4));
  return Number.isInteger(year) && year > 1950 && year < 2100 ? year : null;
}

/**
 * Builds one candidate's payload.
 *
 * Everything the deterministic engine used to rank — score, rank, popularity — is deliberately
 * absent, along with anything that identifies the row (media id, slug, cover). What is left is
 * only what a person would need to judge whether they would enjoy the game.
 */
export function buildCandidatePayload(
  entry: GamesDiscoveryShortlistEntry,
  token: string,
  summary: string | null,
): GameRerankCandidatePayload {
  const candidate = entry.candidate;
  return {
    token,
    title: candidate.title,
    genres: candidate.genres ?? [],
    themes: candidate.themes ?? [],
    gameModes: candidate.gameModes ?? [],
    playerPerspectives: candidate.playerPerspectives ?? [],
    developer: candidate.developer ?? candidate.studios?.[0] ?? null,
    releaseYear: releaseYear(candidate.releaseDate),
    summary: truncateSummary(summary),
  };
}

/**
 * Games binding of the shared taste mapper.
 *
 * Kept as a named export rather than inlined at the call site because the enriched games profile
 * satisfies `RerankTasteProfileSource` structurally, and a named binding is where a future
 * divergence would be caught by the compiler instead of at runtime.
 */
export function buildTastePayload(profile: EnrichedAiGamingTasteProfile): GameRerankTastePayload {
  return buildRerankTastePayload(profile);
}

export function shuffleCandidates(
  candidates: readonly GameRerankCandidatePayload[],
  seed: string,
): GameRerankCandidatePayload[] {
  return shuffleRerankCandidates(candidates, seed);
}

export function fingerprintCandidates(
  candidates: readonly GameRerankCandidatePayload[],
): string {
  return fingerprintRerankCandidates(candidates);
}

export function fingerprintTaste(taste: GameRerankTastePayload): string {
  return fingerprintRerankTaste(taste);
}

export function buildRerankRequestPayload(
  taste: GameRerankTastePayload,
  candidates: readonly GameRerankCandidatePayload[],
  seed: string,
): GameRerankRequestPayload {
  return buildRerankRequestEnvelope(GAME_RERANK_PAYLOAD_VERSION, taste, candidates, seed);
}

/** Re-exported so the hash module keeps one obvious source for its digest input. */
export { stableStringify };
