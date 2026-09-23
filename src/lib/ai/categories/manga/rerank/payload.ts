import { buildRerankTokenMap, type RerankTokenMap } from '@/lib/ai/shared/rank/tokens';
import {
  buildRerankRequestEnvelope,
  fingerprintRerankCandidates,
  fingerprintRerankTaste,
  shuffleRerankCandidates,
  truncateNarrativeText,
} from '@/lib/ai/shared/rank/rerank-payload';
import { buildRerankTastePayload } from '@/lib/ai/shared/rank/taste-payload';
import type { PipelineDiscoveryShortlistEntry } from '@/lib/recommendations/v3/pipeline/shadow-context';
import type { EnrichedAiMangaTasteProfile } from '@/lib/ai/categories/manga/taste/types';
import type { MangaRerankCandidateDetail } from './candidate-details';
import {
  MANGA_RERANK_MAX_SHORTLIST,
  MANGA_RERANK_PAYLOAD_VERSION,
  MANGA_RERANK_SYNOPSIS_MAX_CHARS,
  type MangaRerankCandidatePayload,
  type MangaRerankRequestPayload,
  type MangaRerankTastePayload,
} from './types';

export type MangaRerankTokenMap = RerankTokenMap;

export function buildMangaTokenMap(
  shortlist: readonly PipelineDiscoveryShortlistEntry[],
): MangaRerankTokenMap {
  return buildRerankTokenMap(
    shortlist.map(entry => entry.item.mediaDbId),
    MANGA_RERANK_MAX_SHORTLIST,
  );
}

export function truncateMangaSynopsis(synopsis: string | null | undefined): string | null {
  return truncateNarrativeText(synopsis, MANGA_RERANK_SYNOPSIS_MAX_CHARS);
}

/**
 * Builds one candidate's payload.
 *
 * Everything the deterministic pipeline ranked on — raw score, cluster match, tone match,
 * deterministic rank — is deliberately absent, along with anything that identifies the row. What is
 * left is only what a person would need to judge whether they would enjoy reading it.
 *
 * A missing detail row yields nulls rather than a dropped candidate. The shortlist is the question
 * being asked; removing an entry would make `ai_order` shorter than `deterministic_order` and
 * corrupt the blend.
 */
export function buildMangaCandidatePayload(
  entry: PipelineDiscoveryShortlistEntry,
  token: string,
  detail: MangaRerankCandidateDetail | undefined,
): MangaRerankCandidatePayload {
  return {
    token,
    title: entry.item.title,
    // MAL's flat list, named for what it actually is. See the type's own note.
    labels: entry.item.genres ?? [],
    format: detail?.format ?? null,
    totalChapters: detail?.totalChapters ?? null,
    totalVolumes: detail?.totalVolumes ?? null,
    publicationStatus: detail?.publicationStatus ?? null,
    startYear: detail?.startYear ?? null,
    synopsis: truncateMangaSynopsis(detail?.synopsis),
  };
}

export function buildMangaTastePayload(
  profile: EnrichedAiMangaTasteProfile,
): MangaRerankTastePayload {
  return buildRerankTastePayload(profile);
}

export function shuffleMangaCandidates(
  candidates: readonly MangaRerankCandidatePayload[],
  seed: string,
): MangaRerankCandidatePayload[] {
  return shuffleRerankCandidates(candidates, seed);
}

export function fingerprintMangaCandidates(
  candidates: readonly MangaRerankCandidatePayload[],
): string {
  return fingerprintRerankCandidates(candidates);
}

export function fingerprintMangaTaste(taste: MangaRerankTastePayload): string {
  return fingerprintRerankTaste(taste);
}

export function buildMangaRerankRequestPayload(
  taste: MangaRerankTastePayload,
  candidates: readonly MangaRerankCandidatePayload[],
  seed: string,
): MangaRerankRequestPayload {
  return buildRerankRequestEnvelope(MANGA_RERANK_PAYLOAD_VERSION, taste, candidates, seed);
}
