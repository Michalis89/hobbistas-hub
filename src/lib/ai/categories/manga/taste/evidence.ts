import { getMinTasteEvidenceTitles } from '@/lib/ai/capabilities';
import { sha256Hex, stableStringify } from '@/lib/ai/shared/hashing';
import { MANGA_AI_CATEGORY } from '../constants';
import type { MangaHistoryEntry } from './history';
import { gradeMangaAversionEvidence } from './negative-evidence';
import {
  buildMangaFamilyPrefixAliases,
  isDerivativeMangaEntry,
  normalizeMangaFamilyKey,
  normalizeMangaIdentityKey,
} from './normalizers';
import {
  bandMangaProgress,
  isDeepMangaRun,
  MANGA_CHAPTERS_PER_VOLUME,
  MANGA_PROGRESS_BANDS,
  resolveMangaChapterEquivalents,
  type MangaProgressBand,
  type MangaProgressInput,
} from './progress';
import {
  DEFAULT_GEMINI_MANGA_TASTE_MODEL,
  MANGA_AI_DERIVATIVE_WEIGHT_FACTOR,
  MANGA_AI_EVIDENCE_PREPROCESSING_VERSION,
  MANGA_AI_EVIDENCE_WEIGHTS,
  MANGA_AI_FAMILY_REPEAT_CAP_MULTIPLE,
  MANGA_AI_FAMILY_REPEAT_DAMPING,
  MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
  MANGA_AI_TASTE_PROMPT_VERSION,
  MANGA_AI_TASTE_SCHEMA_VERSION,
  type MangaAiEvidenceDocument,
  type MangaAiEvidenceEntry,
  type MangaAiEvidenceStatus,
  type MangaAiFamilyEvidence,
} from './types';

/**
 * Library counts above which a library is "rich" rather than merely adequate.
 *
 * Lower than anime's eighteen because manga families do not fan out: fifteen collapsed manga
 * families is roughly fifteen distinct series, where fifteen anime families would have been
 * twenty-five or more library rows.
 */
const RICH_TITLE_COUNT = 15;
const RICH_RATED_RATIO = 0.4;

export function buildMangaAiEvidenceDocument(
  history: MangaHistoryEntry[],
): MangaAiEvidenceDocument {
  const mergedByIdentity = new Map<string, MangaAiEvidenceEntry>();

  for (const entry of history) {
    if (!isEvidenceStatus(entry.status)) {
      continue;
    }

    const evidenceEntry = toEvidenceEntry(entry);
    // The identity key has already collapsed editions, so a deluxe reprint merges with its
    // original here rather than surviving as a second entry in the same family.
    const existing = mergedByIdentity.get(evidenceEntry.identityKey);
    mergedByIdentity.set(
      evidenceEntry.identityKey,
      existing ? mergeEvidenceEntries(existing, evidenceEntry) : evidenceEntry,
    );
  }

  // Resolved against the library before anything is grouped, so the entry list, the family
  // summaries and the strength denominators all agree on which titles are one series.
  const merged = applyFamilyPrefixAliases(
    Array.from(mergedByIdentity.values()).sort(compareEvidenceEntries),
  );
  const entries = collapseFamilies(merged);
  const families = buildFamilyEvidence(merged);

  return {
    schemaVersion: 1,
    preprocessingVersion: MANGA_AI_EVIDENCE_PREPROCESSING_VERSION,
    category: 'manga',
    entries,
    families,
    dataQuality: buildDataQuality(entries),
  };
}

/**
 * Identity of one taste question.
 *
 * Includes every deterministic input that can change the generated profile: the normalised
 * evidence itself, the preprocessing version, the prompt and schema versions, the model, and the
 * weighting and normalisation constants that materially shape the result. The constants are folded
 * in explicitly because they do not all appear in the document — the damping factor, the repeat
 * cap and the strength denominator affect the *bands* rather than the entries, and the
 * chapters-per-volume figure affects banding decisions that are already baked into the entries by
 * the time they are serialised. A tuning change to any of them would otherwise produce a different
 * profile behind an unchanged hash.
 *
 * Nothing games or anime hashes is touched: this function reads only manga constants, and the two
 * other categories compute their own hashes from their own.
 */
export function hashMangaAiEvidence(
  evidence: MangaAiEvidenceDocument,
  model = DEFAULT_GEMINI_MANGA_TASTE_MODEL,
): string {
  const hashInput = {
    evidence,
    preprocessingVersion: MANGA_AI_EVIDENCE_PREPROCESSING_VERSION,
    promptVersion: MANGA_AI_TASTE_PROMPT_VERSION,
    schemaVersion: MANGA_AI_TASTE_SCHEMA_VERSION,
    model,
    weighting: {
      weights: MANGA_AI_EVIDENCE_WEIGHTS,
      progressBands: MANGA_PROGRESS_BANDS,
      chaptersPerVolume: MANGA_CHAPTERS_PER_VOLUME,
      derivativeFactor: MANGA_AI_DERIVATIVE_WEIGHT_FACTOR,
      familyRepeatDamping: MANGA_AI_FAMILY_REPEAT_DAMPING,
      familyRepeatCapMultiple: MANGA_AI_FAMILY_REPEAT_CAP_MULTIPLE,
      strengthReferenceEntryCount: MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
    },
  };

  return sha256Hex(stableStringify(hashInput));
}

/** The progress facts of one history row, in the shape the bander wants. */
function toProgressInput(entry: MangaHistoryEntry): MangaProgressInput {
  return {
    status: entry.status as MangaAiEvidenceStatus,
    progress: entry.progress,
    progressUnit: entry.progressUnit,
    totalChapters: entry.media.totalChapters,
    totalVolumes: entry.media.totalVolumes,
  };
}

/**
 * Weight for one library entry.
 *
 * Derivative entries — one-shots, gaiden, anthologies, 4-koma, doujinshi — are scaled at the end
 * rather than given their own table: how much a reader liked something is judged the same way
 * whatever its form, but a twenty-page one-shot is not independent evidence on the scale a
 * two-hundred-chapter serial is.
 */
export function computeMangaEvidenceWeight(entry: MangaHistoryEntry): number {
  const base = computeBaseWeight(entry);
  if (!isDerivativeMangaEntry(entry.media.title, entry.media.format)) {
    return base;
  }
  return roundMass(base * MANGA_AI_DERIVATIVE_WEIGHT_FACTOR);
}

function computeBaseWeight(entry: MangaHistoryEntry): number {
  const { score } = entry;

  if (entry.status === 'completed') {
    if (entry.isFavorite && score !== null && score >= 9) {
      return MANGA_AI_EVIDENCE_WEIGHTS.completedFavoriteScore9;
    }
    if (entry.isFavorite) {
      return MANGA_AI_EVIDENCE_WEIGHTS.completedFavorite;
    }
    if (score === null) {
      return MANGA_AI_EVIDENCE_WEIGHTS.completedUnrated;
    }
    if (score >= 9) {
      return MANGA_AI_EVIDENCE_WEIGHTS.completedScore9;
    }
    if (score >= 8) {
      return MANGA_AI_EVIDENCE_WEIGHTS.completedScore8;
    }
    if (score >= 7) {
      return MANGA_AI_EVIDENCE_WEIGHTS.completedScore7;
    }
    if (score >= 5) {
      return MANGA_AI_EVIDENCE_WEIGHTS.completedScore5;
    }
    return MANGA_AI_EVIDENCE_WEIGHTS.completedScore4OrLower;
  }

  if (entry.status === 'current') {
    const input = toProgressInput(entry);
    const band = bandMangaProgress(input);

    if (band === 'unknown') {
      return MANGA_AI_EVIDENCE_WEIGHTS.currentUnknownProgress;
    }
    // A long current run is strong positive evidence even with no rating attached — often the only
    // evidence a long-running series ever produces, because readers do not mark them complete.
    if (isDeepMangaRun(input)) {
      return MANGA_AI_EVIDENCE_WEIGHTS.currentDeepRun;
    }
    if (band === 'sampled') {
      return MANGA_AI_EVIDENCE_WEIGHTS.currentSampled;
    }
    return MANGA_AI_EVIDENCE_WEIGHTS.currentEarly;
  }

  if (entry.status === 'dropped') {
    // A stated score is the reader's own verdict and overrides where they stopped.
    if (score !== null) {
      if (score <= 4) {
        return MANGA_AI_EVIDENCE_WEIGHTS.droppedScore4OrLower;
      }
      if (score <= 6) {
        return MANGA_AI_EVIDENCE_WEIGHTS.droppedScore5Or6;
      }
      return MANGA_AI_EVIDENCE_WEIGHTS.droppedScore7OrHigher;
    }

    const band = bandMangaProgress(toProgressInput(entry));
    if (band === 'bailed') {
      return MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedBailed;
    }
    if (band === 'sampled') {
      return MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedSampled;
    }
    if (band === 'partial') {
      return MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedPartial;
    }
    if (band === 'most') {
      return MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedLate;
    }
    return MANGA_AI_EVIDENCE_WEIGHTS.droppedUnratedUnknownProgress;
  }

  return 0;
}

function toEvidenceEntry(entry: MangaHistoryEntry): MangaAiEvidenceEntry {
  const title = entry.media.title;
  const status = entry.status as MangaAiEvidenceStatus;
  const progressInput = toProgressInput(entry);
  const progressBand = bandMangaProgress(progressInput);
  const { read } = resolveMangaChapterEquivalents(progressInput);

  return {
    identityKey: normalizeMangaIdentityKey(title),
    familyKey: normalizeMangaFamilyKey(title) || normalizeMangaIdentityKey(title),
    representativeTitle: title,
    titles: [title],
    status,
    score: entry.score,
    favorite: entry.isFavorite,
    chaptersRead: read,
    totalChapters: entry.media.totalChapters,
    totalVolumes: entry.media.totalVolumes,
    progressBand,
    format: entry.media.format,
    publicationStatus: entry.media.publicationStatus,
    startYear: entry.media.startYear,
    genres: normalizeStringArray(entry.media.genres),
    derivative: isDerivativeMangaEntry(title, entry.media.format),
    aversionEvidence: gradeMangaAversionEvidence({
      status,
      score: entry.score,
      favorite: entry.isFavorite,
      progressBand,
    }),
    weight: computeMangaEvidenceWeight(entry),
  };
}

/**
 * Merges two rows that are the same work — typically an edition and its original.
 *
 * The stronger row wins on status and band; the softer facts are unioned. Someone who owns the
 * deluxe edition of something they favourited has favourited it, whichever row carries the flag.
 */
function mergeEvidenceEntries(
  left: MangaAiEvidenceEntry,
  right: MangaAiEvidenceEntry,
): MangaAiEvidenceEntry {
  const strongest = compareEvidenceEntries(left, right) <= 0 ? left : right;
  const weakest = strongest === left ? right : left;
  const score = mergeScore(left.score, right.score);
  const favorite = left.favorite || right.favorite;

  return {
    ...strongest,
    titles: unionSorted([...left.titles, ...right.titles]),
    favorite,
    score,
    chaptersRead: mergeCount(left.chaptersRead, right.chaptersRead),
    totalChapters: left.totalChapters ?? right.totalChapters,
    totalVolumes: left.totalVolumes ?? right.totalVolumes,
    genres: unionSorted([...left.genres, ...right.genres]),
    derivative: left.derivative && right.derivative,
    // Recomputed, never inherited: merging raises the score and ORs the favourite flag, either of
    // which can turn an eligible entry into one that must never be cited as a dislike.
    aversionEvidence: gradeMangaAversionEvidence({
      status: strongest.status,
      score,
      favorite,
      progressBand: strongest.progressBand,
    }),
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

function mergeCount(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.max(left, right);
}

/**
 * Reduces each family to one representative entry.
 *
 * The first of three defences against one franchise deciding a profile. This is what stops a
 * series read through five sequels and three side stories being read as eight independent
 * endorsements. The representative is the family's strongest entry, with one override: a
 * derivative entry may never represent a family that also contains a real one, because a profile
 * citing "Vinland Saga: Extra Chapters" as its evidence is citing a footnote.
 */
function collapseFamilies(entries: MangaAiEvidenceEntry[]): MangaAiEvidenceEntry[] {
  const byFamily = groupByFamily(entries);

  return Array.from(byFamily.values())
    .map(group => collapseFamilyGroup(group))
    .sort(compareEvidenceEntries);
}

function collapseFamilyGroup(group: MangaAiEvidenceEntry[]): MangaAiEvidenceEntry {
  const sorted = [...group].sort(compareEvidenceEntries);
  const primary = sorted.filter(entry => !entry.derivative);
  const representative = (primary.length > 0 ? primary : sorted)[0];
  const favorite = group.some(entry => entry.favorite);
  const score = group.reduce<number | null>((max, entry) => mergeScore(max, entry.score), null);

  return {
    ...representative,
    titles: unionSorted(group.flatMap(entry => entry.titles)),
    favorite,
    score,
    genres: unionSorted(group.flatMap(entry => entry.genres)),
    derivative: group.every(entry => entry.derivative),
    // A family holding one favourited instalment can never be cited as a dislike, whichever
    // instalment the model names. Recomputed from the collapsed values for exactly that reason.
    aversionEvidence: gradeMangaAversionEvidence({
      status: representative.status,
      score,
      favorite,
      progressBand: representative.progressBand,
    }),
  };
}

function buildFamilyEvidence(entries: MangaAiEvidenceEntry[]): MangaAiFamilyEvidence[] {
  const groups = groupByFamily(entries);

  return Array.from(groups.entries())
    .map(([familyKey, group]) => {
      const sorted = [...group].sort(compareEvidenceEntries);
      const primary = sorted.filter(entry => !entry.derivative);
      return {
        familyKey,
        representativeTitle: (primary.length > 0 ? primary : sorted)[0].representativeTitle,
        titles: unionSorted(group.flatMap(entry => entry.titles)),
        entryCount: group.length,
        completionCount: group.filter(entry => entry.status === 'completed').length,
        favoriteCount: group.filter(entry => entry.favorite).length,
        positiveMass: roundMass(
          group.filter(entry => entry.weight > 0).reduce((sum, entry) => sum + entry.weight, 0),
        ),
        negativeMass: roundMass(
          Math.abs(
            group.filter(entry => entry.weight < 0).reduce((sum, entry) => sum + entry.weight, 0),
          ),
        ),
        genres: unionSorted(group.flatMap(entry => entry.genres)),
      };
    })
    .sort((a, b) => {
      const massDelta = b.positiveMass + b.negativeMass - (a.positiveMass + a.negativeMass);
      if (massDelta !== 0) {
        return massDelta;
      }
      return a.familyKey.localeCompare(b.familyKey);
    });
}

function applyFamilyPrefixAliases(entries: MangaAiEvidenceEntry[]): MangaAiEvidenceEntry[] {
  const aliases = buildMangaFamilyPrefixAliases(entries.map(entry => entry.familyKey));
  return entries.map(entry => {
    const canonical = aliases.get(entry.familyKey) ?? entry.familyKey;
    return canonical === entry.familyKey ? entry : { ...entry, familyKey: canonical };
  });
}

function groupByFamily(entries: MangaAiEvidenceEntry[]): Map<string, MangaAiEvidenceEntry[]> {
  const groups = new Map<string, MangaAiEvidenceEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.familyKey) ?? [];
    group.push(entry);
    groups.set(entry.familyKey, group);
  }
  return groups;
}

function buildDataQuality(
  entries: MangaAiEvidenceEntry[],
): MangaAiEvidenceDocument['dataQuality'] {
  const titleCount = entries.length;
  const ratedCount = entries.filter(entry => entry.score !== null).length;
  const favoriteCount = entries.filter(entry => entry.favorite).length;
  const withLength = entries.filter(
    entry => entry.totalChapters !== null || entry.totalVolumes !== null,
  ).length;
  // A completed entry has an unambiguous position by definition, so it counts as known even when
  // no progress number was ever recorded — the status is the position.
  const withKnownUnit = entries.filter(
    entry => entry.status === 'completed' || entry.chaptersRead !== null,
  ).length;
  const clearAversionCount = entries.filter(entry => entry.aversionEvidence === 'clear').length;

  const ratio = (count: number) => (titleCount > 0 ? Number((count / titleCount).toFixed(3)) : 0);

  const ratedRatio = ratio(ratedCount);
  const sufficiency =
    titleCount >= RICH_TITLE_COUNT && ratedRatio >= RICH_RATED_RATIO
      ? 'rich'
      : titleCount >= getMinTasteEvidenceTitles(MANGA_AI_CATEGORY)
        ? 'adequate'
        : 'sparse';

  return {
    titleCount,
    ratedRatio,
    favoriteCount,
    lengthDataRatio: ratio(withLength),
    progressUnitKnownRatio: ratio(withKnownUnit),
    clearAversionCount,
    sufficiency,
  };
}

/**
 * Cited mass for one collapsed entry.
 *
 * The representative's own weight plus the family's remaining positive mass, damped and then
 * capped. The second of three defences against franchise dominance: damping keeps a long series
 * from counting like several independent ones, and the cap keeps it from growing without limit as
 * sequels and side stories accumulate.
 */
export function resolveMangaCitedMass(
  entry: MangaAiEvidenceEntry,
  familyPositiveMass: Map<string, number>,
): number {
  const base = entry.weight;
  if (base <= 0) {
    return base;
  }

  const familyMass = familyPositiveMass.get(entry.familyKey) ?? base;
  const repeatMass = Math.max(0, familyMass - base);
  const dampedRepeat = MANGA_AI_FAMILY_REPEAT_DAMPING * repeatMass;
  const cappedRepeat = Math.min(dampedRepeat, base * MANGA_AI_FAMILY_REPEAT_CAP_MULTIPLE);

  return roundMass(base + cappedRepeat);
}

function compareEvidenceEntries(a: MangaAiEvidenceEntry, b: MangaAiEvidenceEntry): number {
  const massDelta = Math.abs(b.weight) - Math.abs(a.weight);
  if (massDelta !== 0) {
    return massDelta;
  }
  if (b.favorite !== a.favorite) {
    return b.favorite ? 1 : -1;
  }
  // A real entry outranks a derivative one at equal weight, so representatives stay meaningful.
  if (a.derivative !== b.derivative) {
    return a.derivative ? 1 : -1;
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

function isEvidenceStatus(
  status: MangaHistoryEntry['status'],
): status is MangaAiEvidenceStatus {
  // Planned is intent, not taste. A to-read pile says what someone means to read, which is
  // aspiration as often as preference — and manga backlogs are aspirational at a scale anime
  // backlogs are not, because adding a two-hundred-chapter series costs one click.
  return status === 'completed' || status === 'current' || status === 'dropped';
}

function roundMass(value: number): number {
  return Number(value.toFixed(3));
}

export type { MangaProgressBand };
