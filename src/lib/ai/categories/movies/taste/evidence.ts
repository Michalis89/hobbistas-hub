import { getMinTasteEvidenceTitles } from '@/lib/ai/capabilities';
import { sha256Hex, stableStringify } from '@/lib/ai/shared/hashing';
import { buildFamilyPrefixAliases } from '@/lib/ai/shared/taste/family';
import { gradeAversionEvidence } from '@/lib/ai/shared/taste/negative-evidence';
import {
  compareEvidenceStatus,
  computeLadderWeight,
  computeSufficiency,
  mergeCount,
  mergeScore,
  roundMass,
  unionSorted,
  type TasteEvidenceStatus,
} from '@/lib/ai/shared/taste/evidence-core';
import { MOVIES_AI_CATEGORY } from '../constants';
import type { MoviesHistory, MoviesHistoryEntry } from './history';
import { normalizeMovieFamilyKey, normalizeMovieIdentityKey } from './normalizers';
import {
  MOVIES_AI_EVIDENCE_PREPROCESSING_VERSION,
  MOVIES_AI_EVIDENCE_WEIGHTS,
  MOVIES_RICH_RATED_RATIO,
  MOVIES_RICH_TITLE_COUNT,
  type MoviesAiEvidenceDocument,
  type MoviesAiEvidenceEntry,
} from './types';

/**
 * Turning a film library into the document the model reasons over.
 *
 * Two collapses, in order, and they answer different questions.
 *
 * *Identity collapse* merges cuts, remasters and re-release years: one film, however many rows.
 * This is a correctness fix rather than a nicety — a user who owns the theatrical and extended
 * cuts of the same film has made one viewing decision, and counting it twice doubles its vote.
 *
 * *Family grouping* marks instalments of one series. It does **not** merge them into a single
 * entry, and that is the deliberate difference from the serialised categories: watching the second
 * Godfather film is a real, separate decision in a way that watching the second cour of an anime
 * season is not. Instead the family key is carried, so the validator can refuse a "pillar" whose
 * every citation is one trilogy, and so repeat mass can be damped.
 */

/**
 * How much a second, third or fourth film of the same series contributes.
 *
 * Halved. A trilogy someone loved is strong evidence, but it is *one* strong piece of evidence
 * about a shared sensibility rather than three independent ones — the same reasoning that stopped
 * Elijah Wood becoming a favourite actor off a single franchise.
 */
export const MOVIES_AI_FAMILY_REPEAT_DAMPING = 0.5;

/** A film that is not planned has been watched, abandoned or is in progress. */
const EVIDENCE_STATUSES = new Set<TasteEvidenceStatus>(['completed', 'current', 'dropped']);

export function buildMoviesAiEvidenceDocument(
  history: MoviesHistory,
): MoviesAiEvidenceDocument {
  const mergedByIdentity = new Map<string, MoviesAiEvidenceEntry>();

  for (const entry of history.entries) {
    if (!isEvidenceStatus(entry.status)) {
      continue;
    }

    const evidenceEntry = toEvidenceEntry(entry);
    const existing = mergedByIdentity.get(evidenceEntry.identityKey);
    mergedByIdentity.set(
      evidenceEntry.identityKey,
      existing ? mergeEvidenceEntries(existing, evidenceEntry) : evidenceEntry,
    );
  }

  const entries = applyFamilyAliases(Array.from(mergedByIdentity.values()));

  // Canonical ordering: heaviest first, then by key. Two libraries with the same content must
  // produce byte-identical documents, or the hash stops being a cache key.
  entries.sort(
    (left, right) =>
      right.weight - left.weight || left.identityKey.localeCompare(right.identityKey),
  );

  return {
    schemaVersion: 1,
    preprocessingVersion: MOVIES_AI_EVIDENCE_PREPROCESSING_VERSION,
    category: 'movies',
    entries,
    authorship: {
      directors: [...history.authorship.directors],
      actors: [...history.authorship.actors],
    },
    dataQuality: buildDataQuality(entries, history),
  };
}

/**
 * Cited mass for one entry, damped by how much of its family is already in the library.
 *
 * Without this a six-film series would supply six full-weight citations and dominate every
 * strength band it appeared in.
 */
export function resolveMoviesCitedMass(
  entry: MoviesAiEvidenceEntry,
  familyPositiveMass: Map<string, number>,
): number {
  const base = entry.weight;
  if (base <= 0) {
    return base;
  }
  const familyMass = familyPositiveMass.get(entry.familyKey) ?? base;
  const repeatMass = Math.max(0, familyMass - base);
  return roundMass(base + MOVIES_AI_FAMILY_REPEAT_DAMPING * repeatMass * (base / familyMass));
}

export function buildMoviesFamilyPositiveMass(
  entries: readonly MoviesAiEvidenceEntry[],
): Map<string, number> {
  const masses = new Map<string, number>();
  for (const entry of entries) {
    if (entry.weight > 0) {
      masses.set(entry.familyKey, (masses.get(entry.familyKey) ?? 0) + entry.weight);
    }
  }
  return masses;
}

/**
 * The cache key for a generation.
 *
 * Folds in the model, so switching models invalidates every stored profile rather than serving one
 * model's reasoning under another's name.
 */
export function hashMoviesAiEvidence(evidence: MoviesAiEvidenceDocument, model: string): string {
  return sha256Hex(stableStringify({ evidence, model }));
}

function isEvidenceStatus(status: string): status is TasteEvidenceStatus {
  return EVIDENCE_STATUSES.has(status as TasteEvidenceStatus);
}

function toEvidenceEntry(entry: MoviesHistoryEntry): MoviesAiEvidenceEntry {
  const title = entry.media.title;
  const status = entry.status as TasteEvidenceStatus;
  const watchedRatio = computeWatchedRatio(entry.progress, entry.media.runtime);

  return {
    identityKey: normalizeMovieIdentityKey(title),
    familyKey: normalizeMovieFamilyKey(title) || normalizeMovieIdentityKey(title),
    representativeTitle: title,
    titles: [title],
    status,
    score: entry.score,
    favorite: entry.isFavorite,
    labels: unionSorted(entry.media.genres),
    runtime: entry.media.runtime,
    releaseYear: entry.media.releaseYear,
    watchedRatio,
    aversionEvidence: gradeAversionEvidence({
      status,
      score: entry.score,
      favorite: entry.isFavorite,
      nearlyFinished: isNearlyFinished(watchedRatio),
    }),
    weight: computeLadderWeight(
      { status, score: entry.score, favorite: entry.isFavorite, progressRatio: watchedRatio },
      MOVIES_AI_EVIDENCE_WEIGHTS,
    ),
  };
}

/**
 * Whether stopping this film reads as a stall rather than a verdict.
 *
 * Deliberately stricter than the serialised categories. Three quarters of the way through a film is
 * twenty minutes from the end; walking out there is still a rejection, just a patient one. Only an
 * abandonment past 90% is treated as a stall.
 */
export function isNearlyFinished(watchedRatio: number | null): boolean | null {
  return watchedRatio === null ? null : watchedRatio >= 0.9;
}

function computeWatchedRatio(progress: number | null, runtime: number | null): number | null {
  if (progress === null || runtime === null || runtime <= 0) {
    return null;
  }
  return Number(Math.min(1, progress / runtime).toFixed(3));
}

function mergeEvidenceEntries(
  left: MoviesAiEvidenceEntry,
  right: MoviesAiEvidenceEntry,
): MoviesAiEvidenceEntry {
  const strongest = compareEvidenceStatus(left.status, right.status) <= 0 ? left : right;
  const score = mergeScore(left.score, right.score);
  const favorite = left.favorite || right.favorite;
  const watchedRatio = mergeRatio(left.watchedRatio, right.watchedRatio);

  return {
    ...strongest,
    titles: unionSorted([...left.titles, ...right.titles]),
    score,
    favorite,
    labels: unionSorted([...left.labels, ...right.labels]),
    runtime: mergeCount(left.runtime, right.runtime),
    releaseYear: left.releaseYear ?? right.releaseYear,
    watchedRatio,
    // Recomputed, never inherited: merging raises the score and ORs the favourite flag, either of
    // which can turn an eligible entry into one that must never be cited as a dislike.
    aversionEvidence: gradeAversionEvidence({
      status: strongest.status,
      score,
      favorite,
      nearlyFinished: isNearlyFinished(watchedRatio),
    }),
    weight: computeLadderWeight(
      { status: strongest.status, score, favorite, progressRatio: watchedRatio },
      MOVIES_AI_EVIDENCE_WEIGHTS,
    ),
  };
}

function mergeRatio(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.max(left, right);
}

/**
 * Merges family keys that are prefixes of one another.
 *
 * Catches the series the title only implies — "Before Sunrise" / "Before Sunset" will not merge
 * (neither is a prefix of the other), while "Kill Bill" and "Kill Bill Vol. 2" will. Only keys
 * already present in this library may claim others, so a root that was never watched cannot invent
 * a grouping.
 */
function applyFamilyAliases(entries: MoviesAiEvidenceEntry[]): MoviesAiEvidenceEntry[] {
  const aliases = buildFamilyPrefixAliases(entries.map(entry => entry.familyKey));
  return entries.map(entry => ({
    ...entry,
    familyKey: aliases.get(entry.familyKey) ?? entry.familyKey,
  }));
}

function buildDataQuality(
  entries: readonly MoviesAiEvidenceEntry[],
  history: MoviesHistory,
): MoviesAiEvidenceDocument['dataQuality'] {
  const titleCount = entries.length;
  const rated = entries.filter(entry => entry.score !== null).length;
  const ratedRatio = titleCount > 0 ? Number((rated / titleCount).toFixed(3)) : 0;
  const withRuntime = entries.filter(entry => entry.runtime !== null).length;

  return {
    titleCount,
    ratedRatio,
    favoriteCount: entries.filter(entry => entry.favorite).length,
    clearAversionCount: entries.filter(entry => entry.aversionEvidence === 'clear').length,
    runtimeDataRatio: titleCount > 0 ? Number((withRuntime / titleCount).toFixed(3)) : 0,
    hasAuthorship:
      history.authorship.directors.length > 0 || history.authorship.actors.length > 0,
    sufficiency: computeSufficiency({
      titleCount,
      ratedRatio,
      minTitleCount: getMinTasteEvidenceTitles(MOVIES_AI_CATEGORY),
      richTitleCount: MOVIES_RICH_TITLE_COUNT,
      richRatedRatio: MOVIES_RICH_RATED_RATIO,
    }),
  };
}
