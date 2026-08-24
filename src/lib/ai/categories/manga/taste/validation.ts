import type { ZodError, ZodIssue } from 'zod';
import { resolveMangaCitedMass } from './evidence';
import {
  classifyMangaNegativeEvidence,
  isSupportedMangaNegativeSignal,
  type MangaAiNegativeEvidenceStrength,
} from './negative-evidence';
import { isDemographicOnlyLabel, normalizeMangaIdentityKey } from './normalizers';
import {
  AiMangaTasteProfileSchema,
  MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
  type AiMangaTasteProfile,
  type MangaAiEvidenceDocument,
  type MangaAiEvidenceEntry,
  type MangaAiStrengthBand,
  type EnrichedAiMangaTasteProfile,
} from './types';

/**
 * Which stage rejected a generation.
 *
 * - `schema`   — the payload does not match the structural contract (shape, bounds, enums).
 * - `content`  — structurally valid, but breaks an editorial rule such as the identity word cap,
 *                a demographic-only pillar name, or a rejection claim with nothing behind it.
 * - `evidence` — structurally valid, but cites titles the library does not support.
 */
export type MangaAiValidationCategory = 'schema' | 'content' | 'evidence';

export type MangaAiValidationFailure = {
  success: false;
  category: MangaAiValidationCategory;
  reason: string;
  /** Shape-only description of the schema issues; never contains generated text. */
  issues?: MangaAiSchemaIssue[];
};

export type MangaAiValidationSuccess = {
  success: true;
  profile: AiMangaTasteProfile;
  /** Negative signals removed because their evidence did not support an aversion claim. */
  droppedNegativeSignals: string[];
};

export type MangaAiValidationResult = MangaAiValidationSuccess | MangaAiValidationFailure;

export type { MangaAiNegativeEvidenceStrength };
export {
  MANGA_AMBIGUOUS_DROP_SCORE,
  MANGA_HIGH_RATED_SCORE,
  MANGA_STRONG_NEGATIVE_SCORE,
  classifyMangaNegativeEvidence,
  isSupportedMangaNegativeSignal,
} from './negative-evidence';

export type MangaAiSchemaIssue = {
  path: string;
  code: string;
  expected: string;
  receivedType: string;
  receivedCount?: number;
};

const MAX_LOGGED_SCHEMA_ISSUES = 6;

const CATEGORY_BY_REASON: Record<string, MangaAiValidationCategory> = {
  schema_validation_failed: 'schema',
  identity_label_too_long: 'content',
  demographic_only_pillar: 'content',
  unsupported_negative_prose: 'content',
  hallucinated_pillar_evidence: 'evidence',
  hallucinated_negative_evidence: 'evidence',
  contradicted_negative_evidence: 'evidence',
  single_family_pillar: 'evidence',
};

/**
 * Vocabulary that asserts the reader turns something down.
 *
 * Used only to enforce the rule that prose may not claim an aversion the evidence does not carry.
 * Deliberately narrow and word-boundaried: the check runs solely when there are **zero** supported
 * negative signals, so the only prose it can ever see is prose that has nothing behind it, and a
 * profile with a genuine negative signal is never touched by it.
 *
 * The patterns are anchored on the reader as subject wherever the phrase allows it. That matters
 * because a description of a *story* may legitimately use this vocabulary — "a protagonist who
 * rejects easy answers" is about the manga, not about what the reader will not read — and a bare
 * keyword list would fail such a profile for saying something true.
 */
const NEGATIVE_PROSE_PATTERNS: RegExp[] = [
  /\b(avoids?|avoiding|avoidance)\b/i,
  /\b(dislikes?|disliking|distaste|aversion|averse)\b/i,
  /\b(rejects?|rejecting|rejection)\s+(the\s+|a\s+|an\s+)?(genre|trope|style|format|premise|series|titles?|stories|manga)/i,
  /\b(shies?\s+away|steers?\s+clear|turns?\s+away|stays?\s+away)\b/i,
  /\b(no|little|less|limited)\s+(patience|interest|appetite|tolerance|time)\s+for\b/i,
  /\b(impatient|unimpressed|put\s+off|bored)\s+(with|by)\b/i,
  /\b(not|never)\s+(drawn|interested|engaged)\s+(to|in|by)\b/i,
  /\b(abandons?|drops?|walks?\s+away\s+from)\s+(anything|everything|series|stories|titles|manga)\b/i,
];

/**
 * Deliberately *not* on the list: "has no use for".
 *
 * It reads as reader-directed but is overwhelmingly used about a story's subject — "long arcs
 * about people the world has no use for" is a description of the manga. Matching it failed a
 * profile for saying something true, which is a worse outcome than missing one rare phrasing of a
 * claim the reader-directed patterns above already cover.
 */

function fail(
  reason: keyof typeof CATEGORY_BY_REASON,
  issues?: MangaAiSchemaIssue[],
  detail?: string,
): MangaAiValidationFailure {
  return {
    success: false,
    category: CATEGORY_BY_REASON[reason],
    reason: detail ? `${reason} (${detail})` : reason,
    issues,
  };
}

export function validateAiMangaTasteProfile(
  raw: unknown,
  evidence: MangaAiEvidenceDocument,
): MangaAiValidationResult {
  const parsed = AiMangaTasteProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('schema_validation_failed', summarizeSchemaIssues(parsed.error, raw));
  }

  const profile = parsed.data;
  if (profile.identity.label.trim().split(/\s+/).length > 4) {
    return fail('identity_label_too_long');
  }

  const titleMap = buildEvidenceTitleMap(evidence.entries);

  for (const pillar of profile.pillars) {
    // A demographic is a magazine's readership, not a taste. "Seinen" as a pillar name says only
    // that these titles were printed in seinen magazines — a fact about the publisher that the
    // library already records, dressed up as an insight about the reader. Enforced here rather
    // than left to the prompt because it is the single most likely way a manga profile decays
    // into restating its own metadata, and a prompt rule is a request while this is a guarantee.
    if (isDemographicOnlyLabel(pillar.name)) {
      return fail('demographic_only_pillar');
    }

    const mapped = mapEvidenceTitles(pillar.evidenceTitles, titleMap);
    if (!mapped) {
      return fail('hallucinated_pillar_evidence');
    }
    // Family dominance, caught at the output rather than only damped at the input — the third of
    // the three defences. Every citation resolving to one family means the "pillar" describes a
    // single series, which is a fact about the library rather than a pattern across it.
    if (!citesMultipleFamilies(mapped)) {
      return fail('single_family_pillar');
    }
  }

  const supportedNegativeSignals: AiMangaTasteProfile['negativeSignals'] = [];
  const droppedNegativeSignals: string[] = [];

  for (const signal of profile.negativeSignals) {
    const mapped = mapEvidenceTitles(signal.evidenceTitles, titleMap);
    if (!mapped) {
      return fail('hallucinated_negative_evidence');
    }

    const strengths = mapped.map(classifyMangaNegativeEvidence);

    // Only a genuine contradiction — a favourite, or something rated highly — costs the whole
    // generation. The model asserted the opposite of what the reader said, so nothing it produced
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
    // regenerating would spend another provider call to lose them too.
    if (!isSupportedMangaNegativeSignal(strengths)) {
      droppedNegativeSignals.push(`${signal.name} [${summarizeStrengths(strengths)}]`);
      continue;
    }

    supportedNegativeSignals.push(signal);
  }

  // The prose guard, and the reason it fails rather than edits.
  //
  // A negative *signal* that is not supported can be dropped surgically — it is one object in an
  // array and removing it leaves a coherent profile. A rejection claim embedded in the summary or
  // the identity description cannot be: the sentence is load-bearing prose, and there is no
  // honest way to excise a clause and hand the remainder to a user as though the model wrote it.
  //
  // So when no negative signal survives and the prose still asserts an aversion, the whole
  // generation goes. That is the correct direction to fail in — the alternative is rendering
  // "avoids slow-burn romance" on someone's dashboard with nothing behind it, which is the worst
  // outcome this category has. The cost is bounded: the validation cooldown is two minutes, not
  // the twelve a provider failure earns.
  if (supportedNegativeSignals.length === 0) {
    const offending = findNegativeProse(profile);
    if (offending !== null) {
      return fail('unsupported_negative_prose', undefined, offending);
    }
  }

  return {
    success: true,
    profile: { ...profile, negativeSignals: supportedNegativeSignals },
    droppedNegativeSignals,
  };
}

/**
 * Every field whose prose a reader actually sees, scanned for unsupported rejection claims.
 *
 * Returns a shape-only locator — the field and the rule index — or null. Never the matched text:
 * these strings are model output and the logs must stay free of it.
 */
export function findNegativeProse(profile: AiMangaTasteProfile): string | null {
  const fields: Array<[string, string]> = [
    ['identity.description', profile.identity.description],
    ['summary', profile.summary],
    ...profile.pillars.map(
      (pillar, index) => [`pillars.${index}.description`, pillar.description] as [string, string],
    ),
  ];

  for (const [field, text] of fields) {
    const ruleIndex = NEGATIVE_PROSE_PATTERNS.findIndex(pattern => pattern.test(text));
    if (ruleIndex !== -1) {
      return `${field}#${ruleIndex}`;
    }
  }

  return null;
}

export function enrichAiMangaTasteProfile(
  profile: AiMangaTasteProfile,
  evidence: MangaAiEvidenceDocument,
  model: string,
  inputHash: string,
): EnrichedAiMangaTasteProfile {
  return {
    ...profile,
    pillars: profile.pillars.map(pillar => ({
      ...pillar,
      strengthBand: calculateMangaStrengthBand(pillar.evidenceTitles, evidence),
    })),
    dataQuality: evidence.dataQuality,
    source: 'ai',
    model,
    inputHash,
  };
}

/**
 * How much of the reader's strongest evidence a pillar accounts for.
 *
 * The denominator is the sum of the heaviest {@link MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT}
 * positive entries rather than the whole library's mass. Dividing by everything would make the
 * share shrink as a library grew, putting the top bands out of reach for exactly the readers with
 * the most evidence.
 *
 * The thresholds below are the same as anime's, but the denominator they divide into is manga's
 * own — which is the part that had to be derived rather than inherited. See
 * `MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT` for why ten.
 */
export function calculateMangaStrengthBand(
  evidenceTitles: string[],
  evidence: MangaAiEvidenceDocument,
): MangaAiStrengthBand {
  const diagnostics = calculateMangaStrengthDiagnostics(evidenceTitles, evidence);

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

export type MangaAiStrengthDiagnostics = {
  evidenceMass: number;
  referenceMass: number;
  /** How many entries the reference mass was drawn from (fewer than ten for small libraries). */
  referenceEntryCount: number;
  share: number;
  matchedTitleCount: number;
  /** Distinct families among the cited titles. */
  familyCount: number;
};

export function calculateMangaStrengthDiagnostics(
  evidenceTitles: string[],
  evidence: MangaAiEvidenceDocument,
): MangaAiStrengthDiagnostics {
  const titleMap = buildEvidenceTitleMap(evidence.entries);
  const entries = mapEvidenceTitles(evidenceTitles, titleMap) ?? [];
  const familyMassByKey = buildFamilyPositiveMassMap(evidence);

  const uniquePositiveEntries = dedupeEntriesByIdentity(entries).filter(entry => entry.weight > 0);
  const evidenceMass = uniquePositiveEntries.reduce(
    (sum, entry) => sum + resolveMangaCitedMass(entry, familyMassByKey),
    0,
  );

  const referenceMasses = evidence.entries
    .filter(entry => entry.weight > 0)
    .map(entry => resolveMangaCitedMass(entry, familyMassByKey))
    .sort((a, b) => b - a)
    .slice(0, MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT);
  const referenceMass = referenceMasses.reduce((sum, mass) => sum + mass, 0);

  return {
    evidenceMass: roundDiagnosticNumber(evidenceMass),
    referenceMass: roundDiagnosticNumber(referenceMass),
    referenceEntryCount: referenceMasses.length,
    share: roundDiagnosticNumber(referenceMass > 0 ? evidenceMass / referenceMass : 0),
    matchedTitleCount: entries.length,
    familyCount: new Set(entries.map(entry => entry.familyKey)).size,
  };
}

/**
 * Reduces a Zod error to loggable metadata.
 *
 * Records no generated text, no evidence titles and no prompt content — only the field path, the
 * issue code, the violated constraint, and the type or size of what arrived.
 */
export function summarizeSchemaIssues(error: ZodError, raw: unknown): MangaAiSchemaIssue[] {
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

function buildFamilyPositiveMassMap(evidence: MangaAiEvidenceDocument): Map<string, number> {
  return new Map(evidence.families.map(family => [family.familyKey, family.positiveMass]));
}

/**
 * Maps every title a collapsed entry absorbed back to that entry.
 *
 * A pillar may cite "Berserk: Deluxe Edition" even though the collapsed entry is represented by
 * "Berserk": the edition is a title the entry absorbed, so it resolves. What does not resolve is a
 * title the library never held, which is the hallucination this catches.
 */
function buildEvidenceTitleMap(
  entries: MangaAiEvidenceEntry[],
): Map<string, MangaAiEvidenceEntry> {
  const map = new Map<string, MangaAiEvidenceEntry>();
  for (const entry of entries) {
    for (const title of entry.titles) {
      map.set(normalizeMangaIdentityKey(title), entry);
    }
    map.set(normalizeMangaIdentityKey(entry.representativeTitle), entry);
  }
  return map;
}

function mapEvidenceTitles(
  titles: string[],
  titleMap: Map<string, MangaAiEvidenceEntry>,
): MangaAiEvidenceEntry[] | null {
  const mapped: MangaAiEvidenceEntry[] = [];
  for (const title of titles) {
    const entry = titleMap.get(normalizeMangaIdentityKey(title));
    if (!entry) {
      return null;
    }
    mapped.push(entry);
  }
  return mapped;
}

/** Counts by grade, e.g. `unusable:1,usable:1`. Shape only — no titles, no generated text. */
function summarizeStrengths(strengths: MangaAiNegativeEvidenceStrength[]): string {
  const counts = new Map<string, number>();
  for (const strength of strengths) {
    counts.set(strength, (counts.get(strength) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([strength, count]) => `${strength}:${count}`)
    .join(',');
}

function citesMultipleFamilies(entries: MangaAiEvidenceEntry[]): boolean {
  return new Set(entries.map(entry => entry.familyKey)).size > 1;
}

function dedupeEntriesByIdentity(entries: MangaAiEvidenceEntry[]): MangaAiEvidenceEntry[] {
  return Array.from(new Map(entries.map(entry => [entry.identityKey, entry])).values());
}

function roundDiagnosticNumber(value: number): number {
  return Number(value.toFixed(3));
}
