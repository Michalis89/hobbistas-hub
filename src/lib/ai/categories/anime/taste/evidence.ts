import { getMinTasteEvidenceTitles } from '@/lib/ai/capabilities';
import { sha256Hex, stableStringify } from '@/lib/ai/shared/hashing';
import { ANIME_AI_CATEGORY } from '../constants';
import type { AnimeHistoryEntry } from './history';
import { gradeAversionEvidence } from './negative-evidence';
import {
  buildFranchisePrefixAliases,
  isDerivativeAnimeEntry,
  isNonNarrativeAnimeEntry,
  normalizeAnimeFranchiseKey,
  normalizeAnimeIdentityKey,
} from './normalizers';
import {
  ANIME_AI_DERIVATIVE_WEIGHT_FACTOR,
  ANIME_AI_EVIDENCE_PREPROCESSING_VERSION,
  ANIME_AI_EVIDENCE_WEIGHTS,
  ANIME_AI_FRANCHISE_REPEAT_CAP_MULTIPLE,
  ANIME_AI_FRANCHISE_REPEAT_DAMPING,
  ANIME_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
  ANIME_AI_TASTE_PROMPT_VERSION,
  ANIME_AI_TASTE_SCHEMA_VERSION,
  ANIME_DROP_BANDS,
  DEFAULT_GEMINI_ANIME_TASTE_MODEL,
  type AnimeAiEvidenceDocument,
  type AnimeAiEvidenceEntry,
  type AnimeAiEvidenceStatus,
  type AnimeAiFranchiseEvidence,
  type AnimeAiProgressBand,
} from './types';

/** Library counts above which a library is "rich" rather than merely adequate. */
const RICH_TITLE_COUNT = 18;
const RICH_RATED_RATIO = 0.4;

export function buildAnimeAiEvidenceDocument(
  history: AnimeHistoryEntry[],
): AnimeAiEvidenceDocument {
  const mergedByIdentity = new Map<string, AnimeAiEvidenceEntry>();

  for (const entry of history) {
    if (!isEvidenceStatus(entry.status)) {
      continue;
    }
    // Music videos, commercials and promos are not storytelling; they say nothing about what
    // kind of story this viewer wants.
    if (isNonNarrativeAnimeEntry(entry.media.format)) {
      continue;
    }

    const evidenceEntry = toEvidenceEntry(entry);
    const existing = mergedByIdentity.get(evidenceEntry.identityKey);
    mergedByIdentity.set(
      evidenceEntry.identityKey,
      existing ? mergeEvidenceEntries(existing, evidenceEntry) : evidenceEntry,
    );
  }

  // Resolved against the library before anything is grouped, so the entry list, the franchise
  // summaries and the strength denominators all agree on which titles are one series.
  const merged = applyFranchisePrefixAliases(
    Array.from(mergedByIdentity.values()).sort(compareEvidenceEntries),
  );
  const entries = collapseFranchises(merged);
  const franchises = buildFranchiseEvidence(merged);

  return {
    schemaVersion: 1,
    preprocessingVersion: ANIME_AI_EVIDENCE_PREPROCESSING_VERSION,
    category: 'anime',
    entries,
    franchises,
    dataQuality: buildDataQuality(entries),
  };
}

/**
 * Identity of one taste question.
 *
 * Includes every deterministic input that can change the generated profile: the normalised
 * evidence itself, the preprocessing version, the prompt and schema versions, the model, and the
 * weighting constants that materially shape the evidence. The constants are folded in explicitly
 * because they do not all appear in the document — the damping factor and repeat cap affect the
 * *strength bands* rather than the entries, so a tuning change would otherwise produce a different
 * profile behind an unchanged hash.
 */
export function hashAnimeAiEvidence(
  evidence: AnimeAiEvidenceDocument,
  model = DEFAULT_GEMINI_ANIME_TASTE_MODEL,
): string {
  const hashInput = {
    evidence,
    preprocessingVersion: ANIME_AI_EVIDENCE_PREPROCESSING_VERSION,
    promptVersion: ANIME_AI_TASTE_PROMPT_VERSION,
    schemaVersion: ANIME_AI_TASTE_SCHEMA_VERSION,
    model,
    weighting: {
      weights: ANIME_AI_EVIDENCE_WEIGHTS,
      dropBands: ANIME_DROP_BANDS,
      derivativeFactor: ANIME_AI_DERIVATIVE_WEIGHT_FACTOR,
      franchiseRepeatDamping: ANIME_AI_FRANCHISE_REPEAT_DAMPING,
      franchiseRepeatCapMultiple: ANIME_AI_FRANCHISE_REPEAT_CAP_MULTIPLE,
      strengthReferenceEntryCount: ANIME_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
    },
  };

  return sha256Hex(stableStringify(hashInput));
}

/**
 * Where the viewer stopped, as a band.
 *
 * Degrades in two steps rather than fabricating a percentage. With a known total the band comes
 * from the ratio; without one it comes from the raw episode count, which is still meaningful
 * ("stopped after two episodes" needs no denominator); with neither it is `unknown` and the
 * caller weights it as an unqualified drop.
 */
export function bandAnimeProgress(
  status: AnimeAiEvidenceStatus,
  episodesWatched: number | null,
  totalEpisodes: number | null,
): AnimeAiProgressBand {
  if (status === 'completed') {
    return 'complete';
  }
  if (episodesWatched === null) {
    return 'unknown';
  }
  if (totalEpisodes !== null && totalEpisodes > 0) {
    const ratio = episodesWatched / totalEpisodes;
    if (ratio <= ANIME_DROP_BANDS.bailedMaxRatio) {
      return 'bailed';
    }
    if (ratio <= ANIME_DROP_BANDS.midwayMaxRatio) {
      return 'partial';
    }
    return 'most';
  }
  if (episodesWatched <= ANIME_DROP_BANDS.unknownTotalBailedMaxEpisodes) {
    return 'bailed';
  }
  if (episodesWatched <= ANIME_DROP_BANDS.unknownTotalMidwayMaxEpisodes) {
    return 'partial';
  }
  return 'most';
}

/**
 * Weight for one library entry.
 *
 * Derivative entries (OVAs, specials, recaps) are scaled down at the end rather than being given
 * their own table: how much a viewer liked something is judged the same way whatever the format,
 * but a recap of a season they already watched is not independent evidence of anything.
 */
export function computeAnimeEvidenceWeight(entry: AnimeHistoryEntry): number {
  const base = computeBaseWeight(entry);
  if (!isDerivativeAnimeEntry(entry.media.title, entry.media.format)) {
    return base;
  }
  return roundMass(base * ANIME_AI_DERIVATIVE_WEIGHT_FACTOR);
}

function computeBaseWeight(entry: AnimeHistoryEntry): number {
  const { score } = entry;

  if (entry.status === 'completed') {
    if (entry.isFavorite && score !== null && score >= 9) {
      return ANIME_AI_EVIDENCE_WEIGHTS.completedFavoriteScore9;
    }
    if (entry.isFavorite) {
      return ANIME_AI_EVIDENCE_WEIGHTS.completedFavorite;
    }
    if (score === null) {
      return ANIME_AI_EVIDENCE_WEIGHTS.completedUnrated;
    }
    if (score >= 9) {
      return ANIME_AI_EVIDENCE_WEIGHTS.completedScore9;
    }
    if (score >= 8) {
      return ANIME_AI_EVIDENCE_WEIGHTS.completedScore8;
    }
    if (score >= 7) {
      return ANIME_AI_EVIDENCE_WEIGHTS.completedScore7;
    }
    if (score >= 5) {
      return ANIME_AI_EVIDENCE_WEIGHTS.completedScore5;
    }
    return ANIME_AI_EVIDENCE_WEIGHTS.completedScore4OrLower;
  }

  if (entry.status === 'current') {
    const band = bandAnimeProgress('current', entry.progress, entry.media.episodes);
    if (band === 'most') {
      return ANIME_AI_EVIDENCE_WEIGHTS.currentPastHalf;
    }
    if (band === 'partial') {
      return ANIME_AI_EVIDENCE_WEIGHTS.currentPastQuarter;
    }
    return ANIME_AI_EVIDENCE_WEIGHTS.currentEarly;
  }

  if (entry.status === 'dropped') {
    // A stated score is the viewer's own verdict and overrides where they stopped.
    if (entry.score !== null) {
      if (entry.score <= 4) {
        return ANIME_AI_EVIDENCE_WEIGHTS.droppedScore4OrLower;
      }
      if (entry.score <= 6) {
        return ANIME_AI_EVIDENCE_WEIGHTS.droppedScore5Or6;
      }
      return ANIME_AI_EVIDENCE_WEIGHTS.droppedScore7OrHigher;
    }

    const band = bandAnimeProgress('dropped', entry.progress, entry.media.episodes);
    if (band === 'bailed') {
      return ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedBailed;
    }
    if (band === 'partial') {
      return ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedMidway;
    }
    if (band === 'most') {
      return ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedLate;
    }
    return ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedUnknownProgress;
  }

  return 0;
}

function toEvidenceEntry(entry: AnimeHistoryEntry): AnimeAiEvidenceEntry {
  const title = entry.media.title;
  const status = entry.status as AnimeAiEvidenceStatus;

  return {
    identityKey: normalizeAnimeIdentityKey(title),
    franchiseKey: normalizeAnimeFranchiseKey(title) || normalizeAnimeIdentityKey(title),
    representativeTitle: title,
    titles: [title],
    status,
    score: entry.score,
    favorite: entry.isFavorite,
    episodesWatched: entry.progress,
    totalEpisodes: entry.media.episodes,
    progressBand: bandAnimeProgress(status, entry.progress, entry.media.episodes),
    format: entry.media.format,
    seasonYear: entry.media.seasonYear,
    genres: normalizeStringArray(entry.media.genres),
    derivative: isDerivativeAnimeEntry(title, entry.media.format),
    aversionEvidence: gradeAversionEvidence({
      status,
      score: entry.score,
      favorite: entry.isFavorite,
      progressBand: bandAnimeProgress(status, entry.progress, entry.media.episodes),
    }),
    weight: computeAnimeEvidenceWeight(entry),
  };
}

function mergeEvidenceEntries(
  left: AnimeAiEvidenceEntry,
  right: AnimeAiEvidenceEntry,
): AnimeAiEvidenceEntry {
  const strongest = compareEvidenceEntries(left, right) <= 0 ? left : right;
  const weakest = strongest === left ? right : left;

  return {
    ...strongest,
    titles: unionSorted([...left.titles, ...right.titles]),
    favorite: left.favorite || right.favorite,
    score: mergeScore(left.score, right.score),
    episodesWatched: mergeCount(left.episodesWatched, right.episodesWatched),
    totalEpisodes: left.totalEpisodes ?? right.totalEpisodes,
    genres: unionSorted([...left.genres, ...right.genres]),
    derivative: left.derivative && right.derivative,
    // Recomputed, never inherited: merging raises the score and ORs the favourite flag, either of
    // which can turn an eligible entry into one that must never be cited as a dislike.
    aversionEvidence: gradeAversionEvidence({
      status: strongest.status,
      score: mergeScore(left.score, right.score),
      favorite: left.favorite || right.favorite,
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
 * Reduces each franchise family to one representative entry.
 *
 * This is what stops a five-season series being read as five independent endorsements. The
 * representative is the family's strongest entry, with one override: a derivative entry may never
 * represent a family that also contains a real one, because a profile that cites "Attack on Titan
 * OVA" as its evidence for a pillar is citing a footnote.
 */
function collapseFranchises(entries: AnimeAiEvidenceEntry[]): AnimeAiEvidenceEntry[] {
  const byFranchise = groupByFranchise(entries);

  return Array.from(byFranchise.values())
    .map(group => collapseFranchiseGroup(group))
    .sort(compareEvidenceEntries);
}

function collapseFranchiseGroup(group: AnimeAiEvidenceEntry[]): AnimeAiEvidenceEntry {
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
    // A family holding one favourited season can never be cited as a dislike, whichever season
    // the model names. Recomputed from the collapsed values for exactly that reason.
    aversionEvidence: gradeAversionEvidence({
      status: representative.status,
      score,
      favorite,
      progressBand: representative.progressBand,
    }),
  };
}

function buildFranchiseEvidence(entries: AnimeAiEvidenceEntry[]): AnimeAiFranchiseEvidence[] {
  const groups = groupByFranchise(entries);

  return Array.from(groups.entries())
    .map(([franchiseKey, group]) => {
      const sorted = [...group].sort(compareEvidenceEntries);
      const primary = sorted.filter(entry => !entry.derivative);
      return {
        franchiseKey,
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
      return a.franchiseKey.localeCompare(b.franchiseKey);
    });
}

function applyFranchisePrefixAliases(
  entries: AnimeAiEvidenceEntry[],
): AnimeAiEvidenceEntry[] {
  const aliases = buildFranchisePrefixAliases(entries.map(entry => entry.franchiseKey));
  return entries.map(entry => {
    const canonical = aliases.get(entry.franchiseKey) ?? entry.franchiseKey;
    return canonical === entry.franchiseKey ? entry : { ...entry, franchiseKey: canonical };
  });
}

function groupByFranchise(
  entries: AnimeAiEvidenceEntry[],
): Map<string, AnimeAiEvidenceEntry[]> {
  const groups = new Map<string, AnimeAiEvidenceEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.franchiseKey) ?? [];
    group.push(entry);
    groups.set(entry.franchiseKey, group);
  }
  return groups;
}

function buildDataQuality(
  entries: AnimeAiEvidenceEntry[],
): AnimeAiEvidenceDocument['dataQuality'] {
  const titleCount = entries.length;
  const ratedCount = entries.filter(entry => entry.score !== null).length;
  const favoriteCount = entries.filter(entry => entry.favorite).length;
  const withEpisodeTotal = entries.filter(entry => entry.totalEpisodes !== null).length;
  const clearAversionCount = entries.filter(entry => entry.aversionEvidence === 'clear').length;

  const ratedRatio = titleCount > 0 ? Number((ratedCount / titleCount).toFixed(3)) : 0;
  const episodeDataRatio =
    titleCount > 0 ? Number((withEpisodeTotal / titleCount).toFixed(3)) : 0;

  const sufficiency =
    titleCount >= RICH_TITLE_COUNT && ratedRatio >= RICH_RATED_RATIO
      ? 'rich'
      : titleCount >= getMinTasteEvidenceTitles(ANIME_AI_CATEGORY)
        ? 'adequate'
        : 'sparse';

  return {
    titleCount,
    ratedRatio,
    favoriteCount,
    episodeDataRatio,
    clearAversionCount,
    sufficiency,
  };
}

/**
 * Cited mass for one collapsed entry.
 *
 * The representative's own weight plus the family's remaining positive mass, damped and then
 * capped. Both steps matter: damping keeps a long series from counting like several independent
 * shows, and the cap keeps it from growing without limit as seasons accumulate.
 */
export function resolveAnimeCitedMass(
  entry: AnimeAiEvidenceEntry,
  franchisePositiveMass: Map<string, number>,
): number {
  const base = entry.weight;
  if (base <= 0) {
    return base;
  }

  const familyMass = franchisePositiveMass.get(entry.franchiseKey) ?? base;
  const repeatMass = Math.max(0, familyMass - base);
  const dampedRepeat = ANIME_AI_FRANCHISE_REPEAT_DAMPING * repeatMass;
  const cappedRepeat = Math.min(dampedRepeat, base * ANIME_AI_FRANCHISE_REPEAT_CAP_MULTIPLE);

  return roundMass(base + cappedRepeat);
}

function compareEvidenceEntries(a: AnimeAiEvidenceEntry, b: AnimeAiEvidenceEntry): number {
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
  status: AnimeHistoryEntry['status'],
): status is AnimeAiEvidenceStatus {
  // Planned is intent, not taste. A backlog says what someone means to watch, which is aspiration
  // as often as preference, and letting it in would make the profile describe a wishlist.
  return status === 'completed' || status === 'current' || status === 'dropped';
}

function roundMass(value: number): number {
  return Number(value.toFixed(3));
}
