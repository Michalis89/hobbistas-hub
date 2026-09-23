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
import { BOOKS_AI_CATEGORY } from '../constants';
import type { BooksHistoryEntry } from './history';
import { normalizeBookFamilyKey, normalizeBookIdentityKey } from './normalizers';
import {
  BOOKS_AI_EVIDENCE_PREPROCESSING_VERSION,
  BOOKS_AI_EVIDENCE_WEIGHTS,
  BOOKS_RICH_RATED_RATIO,
  BOOKS_RICH_TITLE_COUNT,
  type BooksAiEvidenceDocument,
  type BooksAiEvidenceEntry,
} from './types';

/**
 * Turning a book library into the document the model reasons over.
 *
 * Editions merge, instalments do not — see the normalizers for why. What that leaves is a document
 * where a seven-book series contributes seven entries, all sharing a family key, which is honest
 * about the reading decisions made but dangerous for strength bands. Hence the damping below.
 */

/**
 * How much a second, third or seventh book of the same series contributes.
 *
 * Halved, matching films. Finishing a long series is strong evidence about one sensibility, not
 * seven independent votes — and without this a reader who worked through a fourteen-volume epic
 * would find every pillar it touched banded "Defining" on the strength of one series.
 */
export const BOOKS_AI_FAMILY_REPEAT_DAMPING = 0.5;

const EVIDENCE_STATUSES = new Set<TasteEvidenceStatus>(['completed', 'current', 'dropped']);

export function buildBooksAiEvidenceDocument(
  history: BooksHistoryEntry[],
): BooksAiEvidenceDocument {
  const mergedByIdentity = new Map<string, BooksAiEvidenceEntry>();

  for (const entry of history) {
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
    preprocessingVersion: BOOKS_AI_EVIDENCE_PREPROCESSING_VERSION,
    category: 'books',
    entries,
    dataQuality: buildDataQuality(entries),
  };
}

export function hashBooksAiEvidence(evidence: BooksAiEvidenceDocument, model: string): string {
  return sha256Hex(stableStringify({ evidence, model }));
}

/**
 * Whether putting this book down reads as a stall rather than a verdict.
 *
 * The most forgiving threshold of any category, at 60 percent. Abandoning a novel two thirds of the
 * way through is overwhelmingly a life event rather than a judgement — it is the one place where
 * "I stopped" genuinely tends to mean "I stopped", and treating it as a rejection would manufacture
 * dislikes out of interrupted reading.
 */
export function isNearlyFinished(readRatio: number | null): boolean | null {
  return readRatio === null ? null : readRatio >= 0.6;
}

/** Cited mass for one entry, damped by how much of its series is already in the library. */
export function resolveBooksCitedMass(
  entry: BooksAiEvidenceEntry,
  familyPositiveMass: Map<string, number>,
): number {
  const base = entry.weight;
  if (base <= 0) {
    return base;
  }
  const familyMass = familyPositiveMass.get(entry.familyKey) ?? base;
  const repeatMass = Math.max(0, familyMass - base);
  return roundMass(base + BOOKS_AI_FAMILY_REPEAT_DAMPING * repeatMass * (base / familyMass));
}

export function buildBooksFamilyPositiveMass(
  entries: readonly BooksAiEvidenceEntry[],
): Map<string, number> {
  const masses = new Map<string, number>();
  for (const entry of entries) {
    if (entry.weight > 0) {
      masses.set(entry.familyKey, (masses.get(entry.familyKey) ?? 0) + entry.weight);
    }
  }
  return masses;
}

function isEvidenceStatus(status: string): status is TasteEvidenceStatus {
  return EVIDENCE_STATUSES.has(status as TasteEvidenceStatus);
}

function toEvidenceEntry(entry: BooksHistoryEntry): BooksAiEvidenceEntry {
  const title = entry.media.title;
  const status = entry.status as TasteEvidenceStatus;
  const readRatio = computeReadRatio(entry.progress, entry.media.pageCount);

  return {
    identityKey: normalizeBookIdentityKey(title),
    familyKey: normalizeBookFamilyKey(title) || normalizeBookIdentityKey(title),
    representativeTitle: title,
    titles: [title],
    status,
    score: entry.score,
    favorite: entry.isFavorite,
    labels: unionSorted(entry.media.genres),
    authors: entry.media.authors,
    pageCount: entry.media.pageCount,
    publicationYear: entry.media.publicationYear,
    readRatio,
    aversionEvidence: gradeAversionEvidence({
      status,
      score: entry.score,
      favorite: entry.isFavorite,
      nearlyFinished: isNearlyFinished(readRatio),
    }),
    weight: computeLadderWeight(
      { status, score: entry.score, favorite: entry.isFavorite, progressRatio: readRatio },
      BOOKS_AI_EVIDENCE_WEIGHTS,
    ),
  };
}

function mergeEvidenceEntries(
  left: BooksAiEvidenceEntry,
  right: BooksAiEvidenceEntry,
): BooksAiEvidenceEntry {
  const strongest = compareEvidenceStatus(left.status, right.status) <= 0 ? left : right;
  const score = mergeScore(left.score, right.score);
  const favorite = left.favorite || right.favorite;
  const pageCount = mergeCount(left.pageCount, right.pageCount);
  const readRatio = mergeRatio(left.readRatio, right.readRatio);

  return {
    ...strongest,
    titles: unionSorted([...left.titles, ...right.titles]),
    score,
    favorite,
    labels: unionSorted([...left.labels, ...right.labels]),
    authors: unionSorted([...left.authors, ...right.authors]),
    pageCount,
    publicationYear: left.publicationYear ?? right.publicationYear,
    readRatio,
    // Recomputed, never inherited: merging raises the score and ORs the favourite flag, either of
    // which can turn an eligible entry into one that must never be cited as a dislike.
    aversionEvidence: gradeAversionEvidence({
      status: strongest.status,
      score,
      favorite,
      nearlyFinished: isNearlyFinished(readRatio),
    }),
    weight: computeLadderWeight(
      { status: strongest.status, score, favorite, progressRatio: readRatio },
      BOOKS_AI_EVIDENCE_WEIGHTS,
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

function computeReadRatio(progress: number | null, pageCount: number | null): number | null {
  if (progress === null || pageCount === null || pageCount <= 0) {
    return null;
  }
  return Number(Math.min(1, progress / pageCount).toFixed(3));
}

/**
 * Merges family keys that are prefixes of one another.
 *
 * Catches the series a title only implies — "Mistborn" and "Mistborn: The Well of Ascension" — while
 * leaving unrelated books apart. Only keys already present in this library may claim others.
 */
function applyFamilyAliases(entries: BooksAiEvidenceEntry[]): BooksAiEvidenceEntry[] {
  const aliases = buildFamilyPrefixAliases(entries.map(entry => entry.familyKey));
  return entries.map(entry => ({
    ...entry,
    familyKey: aliases.get(entry.familyKey) ?? entry.familyKey,
  }));
}

function buildDataQuality(
  entries: readonly BooksAiEvidenceEntry[],
): BooksAiEvidenceDocument['dataQuality'] {
  const titleCount = entries.length;
  const rated = entries.filter(entry => entry.score !== null).length;
  const ratedRatio = titleCount > 0 ? Number((rated / titleCount).toFixed(3)) : 0;
  const withPages = entries.filter(entry => entry.pageCount !== null).length;
  const withAuthors = entries.filter(entry => entry.authors.length > 0).length;
  const distinctAuthors = new Set(entries.flatMap(entry => entry.authors));

  return {
    titleCount,
    ratedRatio,
    favoriteCount: entries.filter(entry => entry.favorite).length,
    clearAversionCount: entries.filter(entry => entry.aversionEvidence === 'clear').length,
    pageDataRatio: titleCount > 0 ? Number((withPages / titleCount).toFixed(3)) : 0,
    authorDataRatio: titleCount > 0 ? Number((withAuthors / titleCount).toFixed(3)) : 0,
    distinctAuthorCount: distinctAuthors.size,
    sufficiency: computeSufficiency({
      titleCount,
      ratedRatio,
      minTitleCount: getMinTasteEvidenceTitles(BOOKS_AI_CATEGORY),
      richTitleCount: BOOKS_RICH_TITLE_COUNT,
      richRatedRatio: BOOKS_RICH_RATED_RATIO,
    }),
  };
}
