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
  unionSorted,
  type TasteEvidenceStatus,
} from '@/lib/ai/shared/taste/evidence-core';
import { TV_AI_CATEGORY } from '../constants';
import type { TvHistory, TvHistoryEntry } from './history';
import { normalizeTvFamilyKey, normalizeTvIdentityKey } from './normalizers';
import {
  TV_AI_EVIDENCE_PREPROCESSING_VERSION,
  TV_AI_EVIDENCE_WEIGHTS,
  TV_RICH_RATED_RATIO,
  TV_RICH_TITLE_COUNT,
  type TvAiEvidenceDocument,
  type TvAiEvidenceEntry,
} from './types';

/**
 * Turning a television library into the document the model reasons over.
 *
 * The collapse here is the most aggressive of any category, and it has to be. A viewer who tracked
 * "The Wire" as five season rows has made one decision about one show; left uncollapsed it would
 * supply five citations and could carry a pillar on its own. Seasons merge at the *identity* level,
 * so one series is one entry no matter how it was logged.
 *
 * Progress is summed across the rows that merged, and that is deliberate rather than taking the
 * maximum: three seasons tracked separately at 10 episodes each is 30 episodes watched, not 10. The
 * episode *total*, by contrast, is a series total on every row, so it is taken rather than summed —
 * and the ratio is clamped, because a library where seasons were logged inconsistently can
 * otherwise report more episodes watched than the series has.
 */

/** A series that is not planned has been watched, abandoned or is in progress. */
const EVIDENCE_STATUSES = new Set<TasteEvidenceStatus>(['completed', 'current', 'dropped']);

export function buildTvAiEvidenceDocument(history: TvHistory): TvAiEvidenceDocument {
  const mergedByIdentity = new Map<string, TvAiEvidenceEntry>();

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
    preprocessingVersion: TV_AI_EVIDENCE_PREPROCESSING_VERSION,
    category: 'tv',
    entries,
    authorship: {
      directors: [...history.authorship.directors],
      actors: [...history.authorship.actors],
    },
    dataQuality: buildDataQuality(entries, history),
  };
}

export function hashTvAiEvidence(evidence: TvAiEvidenceDocument, model: string): string {
  return sha256Hex(stableStringify({ evidence, model }));
}

/**
 * Whether stopping this series reads as a stall rather than a verdict.
 *
 * Looser than films, for a reason that is specific to long-form television: a viewer four seasons
 * into a six-season show who stops has usually run out of momentum, not patience. Anything past 70
 * percent is treated as a stall; below that, stopping is a real verdict on the show.
 */
export function isNearlyFinished(watchedRatio: number | null): boolean | null {
  return watchedRatio === null ? null : watchedRatio >= 0.7;
}

function isEvidenceStatus(status: string): status is TasteEvidenceStatus {
  return EVIDENCE_STATUSES.has(status as TasteEvidenceStatus);
}

function toEvidenceEntry(entry: TvHistoryEntry): TvAiEvidenceEntry {
  const title = entry.media.title;
  const status = entry.status as TasteEvidenceStatus;
  const watchedRatio = computeWatchedRatio(entry.progress, entry.media.totalEpisodes);

  return {
    identityKey: normalizeTvIdentityKey(title),
    familyKey: normalizeTvFamilyKey(title) || normalizeTvIdentityKey(title),
    // The collapsed title, not the row title: citing "Better Call Saul Season 3" would ask the
    // model to name a season when every other entry names a series.
    representativeTitle: stripSeasonFromDisplayTitle(title),
    titles: unionSorted([title, stripSeasonFromDisplayTitle(title)]),
    status,
    score: entry.score,
    favorite: entry.isFavorite,
    labels: unionSorted(entry.media.genres),
    episodesWatched: entry.progress,
    totalEpisodes: entry.media.totalEpisodes,
    totalSeasons: entry.media.totalSeasons,
    firstAirYear: entry.media.firstAirYear,
    watchedRatio,
    collapsedRowCount: 1,
    aversionEvidence: gradeAversionEvidence({
      status,
      score: entry.score,
      favorite: entry.isFavorite,
      nearlyFinished: isNearlyFinished(watchedRatio),
    }),
    weight: computeLadderWeight(
      { status, score: entry.score, favorite: entry.isFavorite, progressRatio: watchedRatio },
      TV_AI_EVIDENCE_WEIGHTS,
    ),
  };
}

/**
 * Merges two rows of one series.
 *
 * Episodes watched are summed; the episode total is taken, not summed, because it is a series total
 * on every row. The status kept is the most settled one — a finished season beside an abandoned one
 * says the viewer finished at least part of the show, and "completed" is the honest reading of a
 * library that holds both.
 */
function mergeEvidenceEntries(left: TvAiEvidenceEntry, right: TvAiEvidenceEntry): TvAiEvidenceEntry {
  const strongest = compareEvidenceStatus(left.status, right.status) <= 0 ? left : right;
  const score = mergeScore(left.score, right.score);
  const favorite = left.favorite || right.favorite;
  const episodesWatched = sumCounts(left.episodesWatched, right.episodesWatched);
  const totalEpisodes = mergeCount(left.totalEpisodes, right.totalEpisodes);
  const watchedRatio = computeWatchedRatio(episodesWatched, totalEpisodes);

  return {
    ...strongest,
    titles: unionSorted([...left.titles, ...right.titles]),
    score,
    favorite,
    labels: unionSorted([...left.labels, ...right.labels]),
    episodesWatched,
    totalEpisodes,
    totalSeasons: mergeCount(left.totalSeasons, right.totalSeasons),
    firstAirYear: left.firstAirYear ?? right.firstAirYear,
    watchedRatio,
    collapsedRowCount: left.collapsedRowCount + right.collapsedRowCount,
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
      TV_AI_EVIDENCE_WEIGHTS,
    ),
  };
}

function sumCounts(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left + right;
}

/** Clamped: inconsistently logged seasons can otherwise exceed the series total. */
function computeWatchedRatio(progress: number | null, totalEpisodes: number | null): number | null {
  if (progress === null || totalEpisodes === null || totalEpisodes <= 0) {
    return null;
  }
  return Number(Math.min(1, progress / totalEpisodes).toFixed(3));
}

const DISPLAY_SEASON_PATTERN =
  /\s*[:\-–—]?\s*((season|series|staffel|saison|temporada)\s+\d+|s\d{1,2}|(the\s+)?(final|complete)\s+season)\s*$/i;

function stripSeasonFromDisplayTitle(title: string): string {
  const stripped = title.replace(DISPLAY_SEASON_PATTERN, '').trim();
  return stripped.length > 0 ? stripped : title.trim();
}

function applyFamilyAliases(entries: TvAiEvidenceEntry[]): TvAiEvidenceEntry[] {
  const aliases = buildFamilyPrefixAliases(entries.map(entry => entry.familyKey));
  return entries.map(entry => ({
    ...entry,
    familyKey: aliases.get(entry.familyKey) ?? entry.familyKey,
  }));
}

function buildDataQuality(
  entries: readonly TvAiEvidenceEntry[],
  history: TvHistory,
): TvAiEvidenceDocument['dataQuality'] {
  const titleCount = entries.length;
  const rated = entries.filter(entry => entry.score !== null).length;
  const ratedRatio = titleCount > 0 ? Number((rated / titleCount).toFixed(3)) : 0;
  const withEpisodeTotal = entries.filter(entry => entry.totalEpisodes !== null).length;

  return {
    titleCount,
    ratedRatio,
    favoriteCount: entries.filter(entry => entry.favorite).length,
    clearAversionCount: entries.filter(entry => entry.aversionEvidence === 'clear').length,
    episodeDataRatio: titleCount > 0 ? Number((withEpisodeTotal / titleCount).toFixed(3)) : 0,
    hasAuthorship:
      history.authorship.directors.length > 0 || history.authorship.actors.length > 0,
    sufficiency: computeSufficiency({
      titleCount,
      ratedRatio,
      minTitleCount: getMinTasteEvidenceTitles(TV_AI_CATEGORY),
      richTitleCount: TV_RICH_TITLE_COUNT,
      richRatedRatio: TV_RICH_RATED_RATIO,
    }),
  };
}
