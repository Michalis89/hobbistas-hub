import { localeStableStringify, sha256Hex } from '@/lib/ai/shared/hashing';
import {
  normalizeFranchiseFamilyKey,
  normalizeGameIdentityKey,
} from '@/lib/recommendations/v3/games/games-normalizers';
import type { GameHistoryEntry } from '@/lib/recommendations/v3/games/games-types';
import { getMinTasteEvidenceTitles } from '@/lib/ai/capabilities';
import { GAMES_AI_CATEGORY } from '../constants';
import {
  DEFAULT_GEMINI_TASTE_MODEL,
  GAME_AI_EVIDENCE_PREPROCESSING_VERSION,
  GAME_AI_EVIDENCE_WEIGHTS,
  GAME_AI_TASTE_PROMPT_VERSION,
  GAME_AI_TASTE_SCHEMA_VERSION,
  type GameAiEvidenceDocument,
  type GameAiEvidenceEntry,
  type GameAiEvidenceStatus,
  type GameAiFranchiseEvidence,
  type GameAiProgressBucket,
} from './types';

const MEANINGFUL_REMAKE_PATTERN = /\b(remake|remaster(?:ed)?|reimagined|reboot)\b/i;

export function buildGameAiEvidenceDocument(history: GameHistoryEntry[]): GameAiEvidenceDocument {
  const mergedByIdentity = new Map<string, GameAiEvidenceEntry>();

  for (const entry of history) {
    if (!isEvidenceStatus(entry.status)) {
      continue;
    }

    const evidenceEntry = toEvidenceEntry(entry);
    const current = mergedByIdentity.get(evidenceEntry.identityKey);
    mergedByIdentity.set(
      evidenceEntry.identityKey,
      current ? mergeEvidenceEntries(current, evidenceEntry) : evidenceEntry,
    );
  }

  const mergedEntries = Array.from(mergedByIdentity.values()).sort(compareEvidenceEntries);
  const entries = collapseFranchises(mergedEntries);
  const franchises = buildFranchiseEvidence(mergedEntries);

  return {
    schemaVersion: 1,
    preprocessingVersion: GAME_AI_EVIDENCE_PREPROCESSING_VERSION,
    category: 'games',
    entries,
    franchises,
    dataQuality: buildDataQuality(entries),
  };
}

export function hashGameAiEvidence(
  evidence: GameAiEvidenceDocument,
  model = DEFAULT_GEMINI_TASTE_MODEL,
): string {
  const hashInput = {
    evidence,
    preprocessingVersion: GAME_AI_EVIDENCE_PREPROCESSING_VERSION,
    promptVersion: GAME_AI_TASTE_PROMPT_VERSION,
    schemaVersion: GAME_AI_TASTE_SCHEMA_VERSION,
    model,
  };

  // `localeStableStringify`, not `stableStringify`: the two order object keys differently and
  // this hash is the live cache key for every stored games profile. See the hashing module.
  return sha256Hex(localeStableStringify(hashInput));
}

export function computeGameEvidenceWeight(entry: GameHistoryEntry): number {
  const score = entry.score;

  if (entry.status === 'completed') {
    if (entry.isFavorite && score !== null && score >= 9) {
      return GAME_AI_EVIDENCE_WEIGHTS.completedFavoriteScore9;
    }
    if (entry.isFavorite) {
      return GAME_AI_EVIDENCE_WEIGHTS.completedFavorite;
    }
    if (score === null) {
      return GAME_AI_EVIDENCE_WEIGHTS.completedUnrated;
    }
    if (score >= 9) {
      return GAME_AI_EVIDENCE_WEIGHTS.completedScore9;
    }
    if (score >= 8) {
      return GAME_AI_EVIDENCE_WEIGHTS.completedScore8;
    }
    if (score >= 7) {
      return GAME_AI_EVIDENCE_WEIGHTS.completedScore7;
    }
    if (score >= 5) {
      return GAME_AI_EVIDENCE_WEIGHTS.completedScore5;
    }
    return GAME_AI_EVIDENCE_WEIGHTS.completedScore4OrLower;
  }

  if (entry.status === 'current') {
    return (entry.progress ?? 0) > 25
      ? GAME_AI_EVIDENCE_WEIGHTS.currentProgressOver25
      : GAME_AI_EVIDENCE_WEIGHTS.currentProgressLowOrUnknown;
  }

  if (entry.status === 'dropped') {
    if (score !== null) {
      return score <= 5
        ? GAME_AI_EVIDENCE_WEIGHTS.droppedScore5OrLower
        : GAME_AI_EVIDENCE_WEIGHTS.droppedScoreOver5;
    }
    return (entry.progress ?? 0) > 40
      ? GAME_AI_EVIDENCE_WEIGHTS.droppedNoScoreProgressOver40
      : GAME_AI_EVIDENCE_WEIGHTS.droppedNoScoreProgressLowOrUnknown;
  }

  return 0;
}

export function bucketGameProgress(progress: number | null): GameAiProgressBucket {
  if (progress === null || !Number.isFinite(progress)) {
    return 'unknown';
  }
  if (progress <= 25) {
    return '0-25';
  }
  if (progress <= 40) {
    return '26-40';
  }
  if (progress <= 75) {
    return '41-75';
  }
  return '76-100';
}

function toEvidenceEntry(entry: GameHistoryEntry): GameAiEvidenceEntry {
  const title = entry.media.title;
  return {
    identityKey: buildEvidenceIdentityKey(title),
    franchiseKey: normalizeFranchiseFamilyKey(title) || buildEvidenceIdentityKey(title),
    representativeTitle: title,
    titles: [title],
    status: entry.status as GameAiEvidenceStatus,
    score: entry.score,
    favorite: entry.isFavorite,
    progressBucket: bucketGameProgress(entry.progress),
    genres: normalizeStringArray(entry.media.genres),
    themes: normalizeStringArray(entry.media.themes),
    studios: normalizeStringArray(entry.media.studios),
    weight: computeGameEvidenceWeight(entry),
  };
}

function buildEvidenceIdentityKey(title: string): string {
  const normalized = normalizeGameIdentityKey(title);
  if (!MEANINGFUL_REMAKE_PATTERN.test(title)) {
    return normalized;
  }
  const marker = title.toLowerCase().match(MEANINGFUL_REMAKE_PATTERN)?.[1] ?? 'remake';
  return `${normalized}:${marker.replace(/ed$/, '')}`;
}

function mergeEvidenceEntries(
  left: GameAiEvidenceEntry,
  right: GameAiEvidenceEntry,
): GameAiEvidenceEntry {
  const strongest = compareEvidenceEntries(left, right) <= 0 ? left : right;
  const weakest = strongest === left ? right : left;

  return {
    ...strongest,
    titles: unionSorted([...left.titles, ...right.titles]),
    favorite: left.favorite || right.favorite,
    score: mergeScore(left.score, right.score),
    genres: unionSorted([...left.genres, ...right.genres]),
    themes: unionSorted([...left.themes, ...right.themes]),
    studios: unionSorted([...left.studios, ...right.studios]),
    weight:
      Math.abs(strongest.weight) >= Math.abs(weakest.weight) ? strongest.weight : weakest.weight,
  };
}

function mergeScore(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.max(left, right);
}

function collapseFranchises(entries: GameAiEvidenceEntry[]): GameAiEvidenceEntry[] {
  const byFranchise = new Map<string, GameAiEvidenceEntry[]>();
  for (const entry of entries) {
    const group = byFranchise.get(entry.franchiseKey) ?? [];
    group.push(entry);
    byFranchise.set(entry.franchiseKey, group);
  }

  return Array.from(byFranchise.values())
    .map(group => collapseFranchiseGroup(group))
    .sort(compareEvidenceEntries);
}

function collapseFranchiseGroup(group: GameAiEvidenceEntry[]): GameAiEvidenceEntry {
  const representative = [...group].sort(compareEvidenceEntries)[0];

  return {
    ...representative,
    titles: unionSorted(group.flatMap(entry => entry.titles)),
    favorite: group.some(entry => entry.favorite),
    score: group.reduce<number | null>((max, entry) => mergeScore(max, entry.score), null),
    genres: unionSorted(group.flatMap(entry => entry.genres)),
    themes: unionSorted(group.flatMap(entry => entry.themes)),
    studios: unionSorted(group.flatMap(entry => entry.studios)),
  };
}

function buildFranchiseEvidence(entries: GameAiEvidenceEntry[]): GameAiFranchiseEvidence[] {
  const groups = new Map<string, GameAiEvidenceEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.franchiseKey) ?? [];
    group.push(entry);
    groups.set(entry.franchiseKey, group);
  }

  return Array.from(groups.entries())
    .map(([franchiseKey, group]) => {
      const sorted = [...group].sort(compareEvidenceEntries);
      return {
        franchiseKey,
        representativeTitle: sorted[0].representativeTitle,
        titles: unionSorted(group.flatMap(entry => entry.titles)),
        completionCount: group.filter(entry => entry.status === 'completed').length,
        favoriteCount: group.filter(entry => entry.favorite).length,
        positiveMass: roundMass(
          group.filter(entry => entry.weight > 0).reduce((sum, entry) => sum + entry.weight, 0),
        ),
        negativeMass: roundMass(
          Math.abs(group.filter(entry => entry.weight < 0).reduce((sum, entry) => sum + entry.weight, 0)),
        ),
        genres: unionSorted(group.flatMap(entry => entry.genres)),
        themes: unionSorted(group.flatMap(entry => entry.themes)),
        studios: unionSorted(group.flatMap(entry => entry.studios)),
      };
    })
    .sort((a, b) => {
      const massDelta = b.positiveMass + b.negativeMass - (a.positiveMass + a.negativeMass);
      if (massDelta !== 0) {
        return massDelta;
      }
      return a.franchiseKey.localeCompare(b.franchiseKey);
    });
}

function buildDataQuality(entries: GameAiEvidenceEntry[]): GameAiEvidenceDocument['dataQuality'] {
  const ratedCount = entries.filter(entry => entry.score !== null).length;
  const favoriteCount = entries.filter(entry => entry.favorite).length;
  const titleCount = entries.length;
  const ratedRatio = titleCount > 0 ? Number((ratedCount / titleCount).toFixed(3)) : 0;
  const sufficiency =
    titleCount >= 15 && ratedRatio >= 0.4
      ? 'rich'
      : titleCount >= getMinTasteEvidenceTitles(GAMES_AI_CATEGORY)
        ? 'adequate'
        : 'sparse';

  return {
    titleCount,
    ratedRatio,
    favoriteCount,
    sufficiency,
  };
}

function compareEvidenceEntries(a: GameAiEvidenceEntry, b: GameAiEvidenceEntry): number {
  const massDelta = Math.abs(b.weight) - Math.abs(a.weight);
  if (massDelta !== 0) {
    return massDelta;
  }
  if (b.favorite !== a.favorite) {
    return b.favorite ? 1 : -1;
  }
  return a.identityKey.localeCompare(b.identityKey);
}

function normalizeStringArray(values: string[]): string[] {
  return unionSorted(values.map(value => value.trim()).filter(Boolean));
}

function unionSorted(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function isEvidenceStatus(status: GameHistoryEntry['status']): status is GameAiEvidenceStatus {
  return status === 'completed' || status === 'current' || status === 'dropped';
}

function roundMass(value: number): number {
  return Number(value.toFixed(3));
}

