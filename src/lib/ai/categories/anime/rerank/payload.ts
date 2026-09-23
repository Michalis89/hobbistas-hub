import { buildRerankTokenMap, type RerankTokenMap } from '@/lib/ai/shared/rank/tokens';
import {
  buildRerankRequestEnvelope,
  fingerprintRerankCandidates,
  fingerprintRerankTaste,
  shuffleRerankCandidates,
  truncateNarrativeText,
} from '@/lib/ai/shared/rank/rerank-payload';
import { buildRerankTastePayload } from '@/lib/ai/shared/rank/taste-payload';
import type { AnimeDiscoveryShortlistEntry } from '@/lib/recommendations/v3/anime/anime-types';
import type { EnrichedAiAnimeTasteProfile } from '@/lib/ai/categories/anime/taste/types';
import type { AnimeRerankCandidateDetail } from './candidate-details';
import {
  ANIME_RERANK_MAX_SHORTLIST,
  ANIME_RERANK_PAYLOAD_VERSION,
  ANIME_RERANK_SYNOPSIS_MAX_CHARS,
  type AnimeRerankCandidatePayload,
  type AnimeRerankRequestPayload,
  type AnimeRerankTastePayload,
} from './types';

export type AnimeRerankTokenMap = RerankTokenMap;

export function buildAnimeTokenMap(
  shortlist: readonly AnimeDiscoveryShortlistEntry[],
): AnimeRerankTokenMap {
  return buildRerankTokenMap(
    shortlist.map(entry => entry.candidate.id),
    ANIME_RERANK_MAX_SHORTLIST,
  );
}

export function truncateSynopsis(synopsis: string | null | undefined): string | null {
  return truncateNarrativeText(synopsis, ANIME_RERANK_SYNOPSIS_MAX_CHARS);
}

/**
 * Builds one candidate's payload.
 *
 * Everything the deterministic engine used to rank — score, deterministic rank, family key — is
 * deliberately absent, along with anything that identifies the row (media id, slug, cover). What is
 * left is only what a person would need to judge whether they would enjoy watching it.
 *
 * A missing detail row yields nulls rather than a dropped candidate. The shortlist is the question
 * being asked; a candidate whose metadata never loaded still has a title the model knows, and
 * removing it would make `ai_order` shorter than `deterministic_order` and corrupt the blend.
 */
export function buildAnimeCandidatePayload(
  entry: AnimeDiscoveryShortlistEntry,
  token: string,
  detail: AnimeRerankCandidateDetail | undefined,
): AnimeRerankCandidatePayload {
  return {
    token,
    title: entry.candidate.title,
    genres: entry.candidate.genres ?? [],
    format: detail?.format ?? null,
    episodes: detail?.episodes ?? null,
    seasonYear: detail?.seasonYear ?? null,
    synopsis: truncateSynopsis(detail?.synopsis),
  };
}

export function buildAnimeTastePayload(
  profile: EnrichedAiAnimeTasteProfile,
): AnimeRerankTastePayload {
  return buildRerankTastePayload(profile);
}

export function shuffleAnimeCandidates(
  candidates: readonly AnimeRerankCandidatePayload[],
  seed: string,
): AnimeRerankCandidatePayload[] {
  return shuffleRerankCandidates(candidates, seed);
}

export function fingerprintAnimeCandidates(
  candidates: readonly AnimeRerankCandidatePayload[],
): string {
  return fingerprintRerankCandidates(candidates);
}

export function fingerprintAnimeTaste(taste: AnimeRerankTastePayload): string {
  return fingerprintRerankTaste(taste);
}

export function buildAnimeRerankRequestPayload(
  taste: AnimeRerankTastePayload,
  candidates: readonly AnimeRerankCandidatePayload[],
  seed: string,
): AnimeRerankRequestPayload {
  return buildRerankRequestEnvelope(ANIME_RERANK_PAYLOAD_VERSION, taste, candidates, seed);
}
