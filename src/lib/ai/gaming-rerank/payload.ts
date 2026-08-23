import { createHash } from 'node:crypto';
import type { GamesDiscoveryShortlistEntry } from '@/lib/recommendations/v3/games/games-types';
import type { EnrichedAiGamingTasteProfile } from '@/lib/ai/gaming-taste/types';
import {
  GAME_RERANK_MAX_SHORTLIST,
  GAME_RERANK_PAYLOAD_VERSION,
  GAME_RERANK_SUMMARY_MAX_CHARS,
  type GameRerankCandidatePayload,
  type GameRerankRequestPayload,
  type GameRerankTastePayload,
} from './types';

/** Deterministic mapping between the opaque tokens sent out and the media ids kept in. */
export type GameRerankTokenMap = {
  /** token → mediaId */
  toMediaId: Map<string, number>;
  /** mediaId → token */
  toToken: Map<number, string>;
  /** Issued tokens, in shortlist (deterministic) order. */
  tokens: string[];
};

export function buildTokenMap(shortlist: readonly GamesDiscoveryShortlistEntry[]): GameRerankTokenMap {
  const toMediaId = new Map<string, number>();
  const toToken = new Map<number, string>();
  const tokens: string[] = [];

  shortlist.slice(0, GAME_RERANK_MAX_SHORTLIST).forEach((entry, index) => {
    const token = `c${String(index + 1).padStart(2, '0')}`;
    tokens.push(token);
    toMediaId.set(token, entry.candidate.id);
    toToken.set(entry.candidate.id, token);
  });

  return { toMediaId, toToken, tokens };
}

/**
 * Truncates a summary at a word boundary where possible.
 *
 * Cutting mid-word produces a fragment the model may treat as a real title or term; backing up to
 * the last space keeps the text honest at the cost of a few characters.
 */
export function truncateSummary(summary: string | null | undefined): string | null {
  if (!summary) {
    return null;
  }
  const collapsed = summary.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return null;
  }
  if (collapsed.length <= GAME_RERANK_SUMMARY_MAX_CHARS) {
    return collapsed;
  }

  const hardCut = collapsed.slice(0, GAME_RERANK_SUMMARY_MAX_CHARS);
  const lastSpace = hardCut.lastIndexOf(' ');
  const body = lastSpace > GAME_RERANK_SUMMARY_MAX_CHARS * 0.6 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${body.replace(/[\s.,;:—-]+$/, '')}…`;
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

export function buildTastePayload(profile: EnrichedAiGamingTasteProfile): GameRerankTastePayload {
  return {
    identity: {
      label: profile.identity.label,
      description: profile.identity.description,
    },
    // evidenceTitles are omitted on purpose: the descriptions already carry the semantic claim,
    // and re-supplying library titles invites "more games like X", which is the franchise-
    // similarity behaviour the deterministic side already handles.
    pillars: profile.pillars.map(pillar => ({
      name: pillar.name,
      kind: pillar.kind,
      description: pillar.description,
      strengthBand: pillar.strengthBand,
    })),
    negativeSignals: profile.negativeSignals.map(signal => ({
      name: signal.name,
      description: signal.description,
    })),
    summary: profile.summary,
    // openQuestions are omitted: they are ambiguities the profile itself flags as unresolved, and
    // feeding them in would silently turn a stated uncertainty into a ranking criterion.
    sufficiency: profile.dataQuality.sufficiency,
  };
}

/** xmur3 + mulberry32: small, fast, and fully reproducible from a string seed. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;

  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffles candidates so their input position cannot leak the deterministic ordering.
 *
 * Hiding the score is not enough on its own: models anchor on list order at least as hard as on
 * stated numbers, and sending the list in rank order would make "the AI agrees" indistinguishable
 * from "the AI copied the order it was given". The seed is derived from the payload itself, so
 * identical input always produces an identical shuffle — a refresh cannot reshuffle its way to a
 * different answer, and the cache stays meaningful.
 */
export function shuffleCandidates(
  candidates: readonly GameRerankCandidatePayload[],
  seed: string,
): GameRerankCandidatePayload[] {
  const random = seededRandom(seed);
  const shuffled = [...candidates];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/** Stable digest of exactly the fields that will be sent, used for both the seed and the hash. */
export function fingerprintCandidates(candidates: readonly GameRerankCandidatePayload[]): string {
  return createHash('sha256').update(stableStringify(candidates)).digest('hex');
}

export function fingerprintTaste(taste: GameRerankTastePayload): string {
  return createHash('sha256').update(stableStringify(taste)).digest('hex');
}

export function buildRerankRequestPayload(
  taste: GameRerankTastePayload,
  candidates: readonly GameRerankCandidatePayload[],
  seed: string,
): GameRerankRequestPayload {
  return {
    payloadVersion: GAME_RERANK_PAYLOAD_VERSION,
    taste,
    candidates: shuffleCandidates(candidates, seed),
  };
}

/** Key order must not affect a digest, so object keys are emitted sorted. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}
