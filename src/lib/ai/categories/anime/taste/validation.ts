import type { ZodError, ZodIssue } from 'zod';
import { resolveAnimeCitedMass } from './evidence';
import {
  classifyAnimeNegativeEvidence,
  isSupportedAnimeNegativeSignal,
  type AnimeAiNegativeEvidenceStrength,
} from './negative-evidence';
import { normalizeAnimeIdentityKey } from './normalizers';
import {
  AiAnimeTasteProfileSchema,
  ANIME_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
  type AiAnimeTasteProfile,
  type AnimeAiEvidenceDocument,
  type AnimeAiEvidenceEntry,
  type AnimeAiStrengthBand,
  type EnrichedAiAnimeTasteProfile,
} from './types';

/**
 * Which stage rejected a generation.
 *
 * - `schema`   — the payload does not match the structural contract (shape, bounds, enums).
 * - `content`  — structurally valid, but breaks an editorial rule such as the identity word cap.
 * - `evidence` — structurally valid, but cites titles the library does not support.
 */
export type AnimeAiValidationCategory = 'schema' | 'content' | 'evidence';

export type AnimeAiValidationFailure = {
  success: false;
  category: AnimeAiValidationCategory;
  reason: string;
  /** Shape-only description of the schema issues; never contains generated text. */
  issues?: AnimeAiSchemaIssue[];
};

export type AnimeAiValidationSuccess = {
  success: true;
  profile: AiAnimeTasteProfile;
  /** Negative signals removed because their evidence did not support an aversion claim. */
  droppedNegativeSignals: string[];
};

export type AnimeAiValidationResult = AnimeAiValidationSuccess | AnimeAiValidationFailure;

export type { AnimeAiNegativeEvidenceStrength };
export {
  ANIME_AMBIGUOUS_DROP_SCORE,
  ANIME_HIGH_RATED_SCORE,
  ANIME_STRONG_NEGATIVE_SCORE,
  classifyAnimeNegativeEvidence,
  isSupportedAnimeNegativeSignal,
} from './negative-evidence';

export type AnimeAiSchemaIssue = {
  path: string;
  code: string;
  expected: string;
  receivedType: string;
  receivedCount?: number;
};

const MAX_LOGGED_SCHEMA_ISSUES = 6;

const CATEGORY_BY_REASON: Record<string, AnimeAiValidationCategory> = {
  schema_validation_failed: 'schema',
  identity_label_too_long: 'content',
  hallucinated_pillar_evidence: 'evidence',
  hallucinated_negative_evidence: 'evidence',
  contradicted_negative_evidence: 'evidence',
  single_franchise_pillar: 'evidence',
};

function fail(
  reason: keyof typeof CATEGORY_BY_REASON,
  issues?: AnimeAiSchemaIssue[],
  detail?: string,
): AnimeAiValidationFailure {
  return {
    success: false,
    category: CATEGORY_BY_REASON[reason],
    reason: detail ? `${reason} (${detail})` : reason,
    issues,
  };
}

export function validateAiAnimeTasteProfile(
  raw: unknown,
  evidence: AnimeAiEvidenceDocument,
): AnimeAiValidationResult {
  const parsed = AiAnimeTasteProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('schema_validation_failed', summarizeSchemaIssues(parsed.error, raw));
  }

  const profile = parsed.data;
  if (profile.identity.label.trim().split(/\s+/).length > 4) {
    return fail('identity_label_too_long');
  }

  const titleMap = buildEvidenceTitleMap(evidence.entries);

  for (const pillar of profile.pillars) {
    const mapped = mapEvidenceTitles(pillar.evidenceTitles, titleMap);
    if (!mapped) {
      return fail('hallucinated_pillar_evidence');
    }
    // Franchise dominance, caught at the output rather than only damped at the input. Every
    // citation resolving to one family means the "pillar" is a description of a single series,
    // which is a fact about the library rather than a pattern across it.
    if (!citesMultipleFranchises(mapped)) {
      return fail('single_franchise_pillar');
    }
  }

  const supportedNegativeSignals: AiAnimeTasteProfile['negativeSignals'] = [];
  const droppedNegativeSignals: string[] = [];

  for (const signal of profile.negativeSignals) {
    const mapped = mapEvidenceTitles(signal.evidenceTitles, titleMap);
    if (!mapped) {
      return fail('hallucinated_negative_evidence');
    }

    const strengths = mapped.map(classifyAnimeNegativeEvidence);

    // Only a genuine contradiction — a favourite, or something rated highly — costs the whole
    // generation. The model asserted the opposite of what the user said, so nothing it produced
    // can be trusted to have read the evidence.
    if (strengths.includes('contradictory')) {
      return fail(
        'contradicted_negative_evidence',
        undefined,
        // Shape only: which rule fired and how often. Never a title, never generated text.
        `contradictory=${strengths.filter(s => s === 'contradictory').length}/${strengths.length}`,
      );
    }

    // Everything else is an over-claim and costs only the signal: the pillars are unaffected, and
    // regenerating would spend another provider call to lose them too. This is the case that
    // previously discarded a whole live profile over one reached-for citation.
    if (!isSupportedAnimeNegativeSignal(strengths)) {
      droppedNegativeSignals.push(`${signal.name} [${summarizeStrengths(strengths)}]`);
      continue;
    }

    supportedNegativeSignals.push(signal);
  }

  return {
    success: true,
    profile: { ...profile, negativeSignals: supportedNegativeSignals },
    droppedNegativeSignals,
  };
}

export function enrichAiAnimeTasteProfile(
  profile: AiAnimeTasteProfile,
  evidence: AnimeAiEvidenceDocument,
  model: string,
  inputHash: string,
): EnrichedAiAnimeTasteProfile {
  return {
    ...profile,
    pillars: profile.pillars.map(pillar => ({
      ...pillar,
      strengthBand: calculateAnimeStrengthBand(pillar.evidenceTitles, evidence),
    })),
    dataQuality: evidence.dataQuality,
    source: 'ai',
    model,
    inputHash,
  };
}

/**
 * How much of the viewer's strongest evidence a pillar accounts for.
 *
 * The denominator is the sum of the heaviest {@link ANIME_AI_STRENGTH_REFERENCE_ENTRY_COUNT}
 * positive entries rather than the whole library's mass. Dividing by everything would make the
 * share shrink as a library grew, putting the top bands out of reach for exactly the viewers with
 * the most evidence.
 */
export function calculateAnimeStrengthBand(
  evidenceTitles: string[],
  evidence: AnimeAiEvidenceDocument,
): AnimeAiStrengthBand {
  const diagnostics = calculateAnimeStrengthDiagnostics(evidenceTitles, evidence);

  if (diagnostics.matchedTitleCount <= 1) {
    return 'Emerging';
  }
  if (diagnostics.referenceMass <= 0) {
    return 'Emerging';
  }

  const share = diagnostics.evidenceMass / diagnostics.referenceMass;

  if (share >= 0.6) {
    return 'Defining';
  }
  if (share >= 0.35) {
    return 'Strong';
  }
  if (share >= 0.15) {
    return 'Present';
  }
  return 'Emerging';
}

export type AnimeAiStrengthDiagnostics = {
  evidenceMass: number;
  referenceMass: number;
  /** How many entries the reference mass was drawn from (fewer than 12 for small libraries). */
  referenceEntryCount: number;
  share: number;
  matchedTitleCount: number;
  /** Distinct franchise families among the cited titles. */
  franchiseCount: number;
};

export function calculateAnimeStrengthDiagnostics(
  evidenceTitles: string[],
  evidence: AnimeAiEvidenceDocument,
): AnimeAiStrengthDiagnostics {
  const titleMap = buildEvidenceTitleMap(evidence.entries);
  const entries = mapEvidenceTitles(evidenceTitles, titleMap) ?? [];
  const franchiseMassByKey = buildFranchisePositiveMassMap(evidence);

  const uniquePositiveEntries = dedupeEntriesByIdentity(entries).filter(entry => entry.weight > 0);
  const evidenceMass = uniquePositiveEntries.reduce(
    (sum, entry) => sum + resolveAnimeCitedMass(entry, franchiseMassByKey),
    0,
  );

  const referenceMasses = evidence.entries
    .filter(entry => entry.weight > 0)
    .map(entry => resolveAnimeCitedMass(entry, franchiseMassByKey))
    .sort((a, b) => b - a)
    .slice(0, ANIME_AI_STRENGTH_REFERENCE_ENTRY_COUNT);
  const referenceMass = referenceMasses.reduce((sum, mass) => sum + mass, 0);

  return {
    evidenceMass: roundDiagnosticNumber(evidenceMass),
    referenceMass: roundDiagnosticNumber(referenceMass),
    referenceEntryCount: referenceMasses.length,
    share: roundDiagnosticNumber(referenceMass > 0 ? evidenceMass / referenceMass : 0),
    matchedTitleCount: entries.length,
    franchiseCount: new Set(entries.map(entry => entry.franchiseKey)).size,
  };
}

/**
 * Reduces a Zod error to loggable metadata.
 *
 * Records no generated text, no evidence titles and no prompt content — only the field path, the
 * issue code, the violated constraint, and the type or size of what arrived.
 */
export function summarizeSchemaIssues(error: ZodError, raw: unknown): AnimeAiSchemaIssue[] {
  return error.issues.slice(0, MAX_LOGGED_SCHEMA_ISSUES).map(issue => {
    const received = resolveAtPath(raw, issue.path);
    return {
      path: issue.path.map(String).join('.') || '<root>',
      code: issue.code,
      expected: describeConstraint(issue),
      receivedType: describeType(received),
      receivedCount: measureSize(received),
    };
  });
}

function describeConstraint(issue: ZodIssue): string {
  const candidate = issue as ZodIssue & {
    minimum?: number | bigint;
    maximum?: number | bigint;
    expected?: string;
    options?: unknown[];
  };
  if (candidate.minimum !== undefined) {
    return `min ${String(candidate.minimum)}`;
  }
  if (candidate.maximum !== undefined) {
    return `max ${String(candidate.maximum)}`;
  }
  if (candidate.options !== undefined) {
    return `one of ${candidate.options.length}`;
  }
  return candidate.expected ?? issue.code;
}

function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function measureSize(value: unknown): number | undefined {
  if (typeof value === 'string') {
    return value.length;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  return undefined;
}

function resolveAtPath(raw: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let cursor: unknown = raw;
  for (const segment of path) {
    if (cursor === null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<PropertyKey, unknown>)[segment];
  }
  return cursor;
}

function buildFranchisePositiveMassMap(evidence: AnimeAiEvidenceDocument): Map<string, number> {
  return new Map(
    evidence.franchises.map(franchise => [franchise.franchiseKey, franchise.positiveMass]),
  );
}

/**
 * Maps every title a collapsed entry absorbed back to that entry.
 *
 * A pillar may cite "Attack on Titan Season 3" even though the collapsed entry is represented by
 * "Attack on Titan": the season is a title the family absorbed, so it resolves. What does not
 * resolve is a title the library never held, which is the hallucination this catches.
 */
function buildEvidenceTitleMap(
  entries: AnimeAiEvidenceEntry[],
): Map<string, AnimeAiEvidenceEntry> {
  const map = new Map<string, AnimeAiEvidenceEntry>();
  for (const entry of entries) {
    for (const title of entry.titles) {
      map.set(normalizeAnimeIdentityKey(title), entry);
    }
    map.set(normalizeAnimeIdentityKey(entry.representativeTitle), entry);
  }
  return map;
}

function mapEvidenceTitles(
  titles: string[],
  titleMap: Map<string, AnimeAiEvidenceEntry>,
): AnimeAiEvidenceEntry[] | null {
  const mapped: AnimeAiEvidenceEntry[] = [];
  for (const title of titles) {
    const entry = titleMap.get(normalizeAnimeIdentityKey(title));
    if (!entry) {
      return null;
    }
    mapped.push(entry);
  }
  return mapped;
}

/** Counts by grade, e.g. `unusable:1,usable:1`. Shape only — no titles, no generated text. */
function summarizeStrengths(strengths: AnimeAiNegativeEvidenceStrength[]): string {
  const counts = new Map<string, number>();
  for (const strength of strengths) {
    counts.set(strength, (counts.get(strength) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([strength, count]) => `${strength}:${count}`)
    .join(',');
}

function citesMultipleFranchises(entries: AnimeAiEvidenceEntry[]): boolean {
  return new Set(entries.map(entry => entry.franchiseKey)).size > 1;
}

function dedupeEntriesByIdentity(entries: AnimeAiEvidenceEntry[]): AnimeAiEvidenceEntry[] {
  return Array.from(new Map(entries.map(entry => [entry.identityKey, entry])).values());
}

function roundDiagnosticNumber(value: number): number {
  return Number(value.toFixed(3));
}
