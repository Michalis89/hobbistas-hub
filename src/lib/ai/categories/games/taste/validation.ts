import type { ZodError, ZodIssue } from 'zod';
import { normalizeGameIdentityKey } from '@/lib/recommendations/v3/games/games-normalizers';
import {
  AiGamingTasteProfileSchema,
  GAME_AI_FRANCHISE_REPEAT_DAMPING,
  GAME_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
  type AiGamingTasteProfile,
  type EnrichedAiGamingTasteProfile,
  type GameAiEvidenceDocument,
  type GameAiEvidenceEntry,
  type GameAiStrengthBand,
} from './types';

/**
 * Which stage rejected a generation.
 *
 * - `schema`  — the payload does not match the structural contract (shape, bounds, enums).
 * - `content` — structurally valid, but breaks an editorial rule such as the identity word cap.
 * - `evidence` — structurally valid, but cites titles the library does not support.
 *
 * The stage decides whether a retry could plausibly help; `reason` names the specific rule.
 */
export type GameAiValidationCategory = 'schema' | 'content' | 'evidence';

export type GameAiValidationFailure = {
  success: false;
  category: GameAiValidationCategory;
  reason: string;
  /** Shape-only description of the schema issues; never contains generated text. */
  issues?: GameAiSchemaIssue[];
};

export type GameAiValidationSuccess = {
  success: true;
  profile: AiGamingTasteProfile;
  /**
   * Negative signals removed because their evidence did not support an aversion claim.
   *
   * Names only — reported so the drop is visible in logs rather than silent.
   */
  droppedNegativeSignals: string[];
};

export type GameAiValidationResult = GameAiValidationSuccess | GameAiValidationFailure;

/**
 * How strongly one library entry supports an aversion claim.
 *
 * - `strong`    — rated at or below {@link STRONG_NEGATIVE_SCORE}; a clear dislike.
 * - `usable`    — abandoned without a rating; real but weaker evidence.
 * - `ambiguous` — abandoned yet rated {@link AMBIGUOUS_DROP_SCORE} or better. Far more likely
 *                 "never got round to finishing it" than "disliked it".
 * - `invalid`   — cannot support an aversion claim under any circumstances.
 */
export type GameAiNegativeEvidenceStrength = 'strong' | 'usable' | 'ambiguous' | 'invalid';

/** At or above this score a title can never be cited as aversion evidence. */
export const HIGH_RATED_SCORE = 8;
/** At or below this score a title is a clear dislike, whether finished or abandoned. */
export const STRONG_NEGATIVE_SCORE = 5;
/** At or above this score, abandoning a title says little about taste. */
export const AMBIGUOUS_DROP_SCORE = 6;

/** Safe-to-log summary of one Zod issue: path, code, constraint, and a type/count only. */
export type GameAiSchemaIssue = {
  path: string;
  code: string;
  expected: string;
  receivedType: string;
  receivedCount?: number;
};

const CATEGORY_BY_REASON: Record<string, GameAiValidationCategory> = {
  schema_validation_failed: 'schema',
  identity_label_too_long: 'content',
  hallucinated_pillar_evidence: 'evidence',
  hallucinated_negative_evidence: 'evidence',
  invalid_negative_evidence: 'evidence',
};

function fail(reason: keyof typeof CATEGORY_BY_REASON, issues?: GameAiSchemaIssue[]): GameAiValidationFailure {
  return { success: false, category: CATEGORY_BY_REASON[reason], reason, issues };
}

export function validateAiGamingTasteProfile(
  raw: unknown,
  evidence: GameAiEvidenceDocument,
): GameAiValidationResult {
  const parsed = AiGamingTasteProfileSchema.safeParse(raw);
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
  }

  const supportedNegativeSignals: AiGamingTasteProfile['negativeSignals'] = [];
  const droppedNegativeSignals: string[] = [];

  for (const signal of profile.negativeSignals) {
    const mapped = mapEvidenceTitles(signal.evidenceTitles, titleMap);
    if (!mapped) {
      return fail('hallucinated_negative_evidence');
    }

    const strengths = mapped.map(classifyNegativeEvidence);

    // Citing a favorite or a well-rated title as aversion contradicts the evidence outright.
    // That is a contract violation, not an over-claim, so it fails the whole generation.
    if (strengths.includes('invalid')) {
      return fail('invalid_negative_evidence');
    }

    // An over-claim, by contrast, costs only the signal: the rest of the profile is sound and
    // regenerating would spend another provider call for no gain.
    if (!isSupportedNegativeSignal(strengths)) {
      droppedNegativeSignals.push(signal.name);
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

/**
 * Reduces a Zod error to loggable metadata.
 *
 * Deliberately records no generated text, no evidence titles, and no prompt content — only the
 * field path, the issue code, the constraint that was violated, and the type or size of what
 * arrived. That is enough to diagnose a contract drift without putting library or model output
 * into the logs.
 */
export function summarizeSchemaIssues(error: ZodError, raw: unknown): GameAiSchemaIssue[] {
  return error.issues.slice(0, MAX_LOGGED_SCHEMA_ISSUES).map(issue => {
    const path = issue.path.map(segment => String(segment)).join('.') || '<root>';
    const received = resolveAtPath(raw, issue.path);
    return {
      path,
      code: issue.code,
      expected: describeConstraint(issue),
      receivedType: describeType(received),
      ...(measureSize(received) === undefined ? {} : { receivedCount: measureSize(received) }),
    };
  });
}

const MAX_LOGGED_SCHEMA_ISSUES = 8;

function describeConstraint(issue: ZodIssue): string {
  const withBounds = issue as ZodIssue & {
    minimum?: number | bigint;
    maximum?: number | bigint;
    origin?: string;
    values?: unknown[];
    expected?: string;
  };
  const unit = withBounds.origin === 'string' ? 'characters' : 'items';

  switch (issue.code) {
    case 'too_big':
      return `<=${String(withBounds.maximum)} ${unit}`;
    case 'too_small':
      return `>=${String(withBounds.minimum)} ${unit}`;
    case 'invalid_type':
      return `type ${withBounds.expected ?? 'unknown'}`;
    case 'invalid_value':
      return `one of ${(withBounds.values ?? []).length} allowed values`;
    default:
      return issue.code;
  }
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

/** Size without content: string length or array length, nothing else. */
function measureSize(value: unknown): number | undefined {
  if (typeof value === 'string' || Array.isArray(value)) {
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

export function enrichAiGamingTasteProfile(
  profile: AiGamingTasteProfile,
  evidence: GameAiEvidenceDocument,
  model: string,
  inputHash: string,
): EnrichedAiGamingTasteProfile {
  logPillarStrengthDiagnostics(profile, evidence);

  return {
    ...profile,
    pillars: profile.pillars.map(pillar => ({
      ...pillar,
      strengthBand: calculateStrengthBand(pillar.evidenceTitles, evidence),
    })),
    dataQuality: evidence.dataQuality,
    source: 'ai',
    model,
    inputHash,
  };
}

export function calculateStrengthBand(
  evidenceTitles: string[],
  evidence: GameAiEvidenceDocument,
): GameAiStrengthBand {
  const diagnostics = calculateStrengthDiagnostics(evidenceTitles, evidence);

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

export type GameAiStrengthDiagnostics = {
  evidenceMass: number;
  /** Sum of the strongest `GAME_AI_STRENGTH_REFERENCE_ENTRY_COUNT` positive entries. */
  referenceMass: number;
  /** How many entries the reference mass was drawn from (< 12 for small libraries). */
  referenceEntryCount: number;
  share: number;
  matchedTitleCount: number;
  evidenceWeights: Array<{
    title: string;
    representativeTitle: string;
    identityKey: string;
    franchiseKey: string;
    /** Weight of the collapsed representative entry alone. */
    weight: number;
    /** Representative weight plus damped repeat mass from the rest of the franchise. */
    citedMass: number;
  }>;
};

export function calculateStrengthDiagnostics(
  evidenceTitles: string[],
  evidence: GameAiEvidenceDocument,
): GameAiStrengthDiagnostics {
  const titleMap = buildEvidenceTitleMap(evidence.entries);
  const entries = mapEvidenceTitles(evidenceTitles, titleMap) ?? [];
  const franchiseMassByKey = buildFranchisePositiveMassMap(evidence);

  const uniquePositiveEntries = dedupeEntriesByIdentity(entries).filter(entry => entry.weight > 0);
  const evidenceMass = uniquePositiveEntries.reduce(
    (sum, entry) => sum + resolveCitedMass(entry, franchiseMassByKey),
    0,
  );

  const referenceMasses = evidence.entries
    .filter(entry => entry.weight > 0)
    .map(entry => resolveCitedMass(entry, franchiseMassByKey))
    .sort((a, b) => b - a)
    .slice(0, GAME_AI_STRENGTH_REFERENCE_ENTRY_COUNT);
  const referenceMass = referenceMasses.reduce((sum, mass) => sum + mass, 0);
  const share = referenceMass > 0 ? evidenceMass / referenceMass : 0;

  return {
    evidenceMass: roundDiagnosticNumber(evidenceMass),
    referenceMass: roundDiagnosticNumber(referenceMass),
    referenceEntryCount: referenceMasses.length,
    share: roundDiagnosticNumber(share),
    matchedTitleCount: entries.length,
    evidenceWeights: evidenceTitles.map((title, index) => {
      const entry = entries[index];
      return {
        title,
        representativeTitle: entry?.representativeTitle ?? '',
        identityKey: entry?.identityKey ?? '',
        franchiseKey: entry?.franchiseKey ?? '',
        weight: entry?.weight ?? 0,
        citedMass: entry ? roundDiagnosticNumber(resolveCitedMass(entry, franchiseMassByKey)) : 0,
      };
    }),
  };
}

/**
 * Reuses the per-family positive mass `buildFranchiseEvidence` already computed rather than
 * re-deriving per-title weights here. Damping into a sublinear value happens in
 * `resolveCitedMass`.
 */
function buildFranchisePositiveMassMap(evidence: GameAiEvidenceDocument): Map<string, number> {
  return new Map(
    evidence.franchises.map(franchise => [franchise.franchiseKey, franchise.positiveMass]),
  );
}

/**
 * Franchise collapse keeps only the strongest entry per family, so a family's other completions
 * disappear from `entries[].weight`. `franchises[].positiveMass` still holds the full positive
 * mass for that family; the surplus over the representative is re-added at damped weight so
 * repeated engagement counts, but sublinearly.
 */
function resolveCitedMass(
  entry: GameAiEvidenceEntry,
  franchiseMassByKey: Map<string, number>,
): number {
  const base = Math.max(entry.weight, 0);
  const franchiseMass = franchiseMassByKey.get(entry.franchiseKey);
  if (franchiseMass === undefined) {
    return base;
  }
  const repeatMass = Math.max(franchiseMass - base, 0);
  return base + GAME_AI_FRANCHISE_REPEAT_DAMPING * repeatMass;
}

function buildEvidenceTitleMap(entries: GameAiEvidenceEntry[]): Map<string, GameAiEvidenceEntry> {
  const map = new Map<string, GameAiEvidenceEntry>();
  for (const entry of entries) {
    for (const title of entry.titles) {
      map.set(normalizeGameIdentityKey(title), entry);
    }
    map.set(normalizeGameIdentityKey(entry.representativeTitle), entry);
  }
  return map;
}

function mapEvidenceTitles(
  titles: string[],
  titleMap: Map<string, GameAiEvidenceEntry>,
): GameAiEvidenceEntry[] | null {
  const mapped: GameAiEvidenceEntry[] = [];
  for (const title of titles) {
    const entry = titleMap.get(normalizeGameIdentityKey(title));
    if (!entry) {
      return null;
    }
    mapped.push(entry);
  }
  return mapped;
}

/**
 * Grades one entry as aversion evidence.
 *
 * The previous rule treated `status === 'dropped'` as sufficient on its own, which let titles the
 * player abandoned but still rated 6.5-7 stand as evidence of dislike. Abandoning something you
 * rated well is far more often "did not finish" than "did not like".
 */
export function classifyNegativeEvidence(
  entry: GameAiEvidenceEntry,
): GameAiNegativeEvidenceStrength {
  if (entry.favorite) {
    return 'invalid';
  }
  if (entry.score !== null && entry.score >= HIGH_RATED_SCORE) {
    return 'invalid';
  }
  // Only a finished-and-disliked or an abandoned title says anything about aversion. A title
  // still in progress says nothing yet, and planned entries never reach the evidence document.
  if (entry.status !== 'dropped' && entry.status !== 'completed') {
    return 'invalid';
  }
  if (entry.score !== null && entry.score <= STRONG_NEGATIVE_SCORE) {
    return 'strong';
  }
  // Finished, and rated between the two thresholds: a mild verdict, not a rejection.
  if (entry.status === 'completed') {
    return 'invalid';
  }
  if (entry.score === null) {
    return 'usable';
  }
  return entry.score >= AMBIGUOUS_DROP_SCORE ? 'ambiguous' : 'usable';
}

/**
 * Whether a negative signal's evidence as a whole supports an aversion claim.
 *
 * Ambiguous entries may take part, but must not carry the group: a signal built mostly from
 * well-rated abandonments is asserting a dislike the library does not show.
 */
export function isSupportedNegativeSignal(
  strengths: GameAiNegativeEvidenceStrength[],
): boolean {
  if (strengths.length === 0 || strengths.includes('invalid')) {
    return false;
  }
  const ambiguous = strengths.filter(strength => strength === 'ambiguous').length;
  const corroborating = strengths.length - ambiguous;
  return ambiguous === 0 || corroborating >= ambiguous;
}

function dedupeEntriesByIdentity(entries: GameAiEvidenceEntry[]): GameAiEvidenceEntry[] {
  return Array.from(new Map(entries.map(entry => [entry.identityKey, entry])).values());
}

function logPillarStrengthDiagnostics(
  profile: AiGamingTasteProfile,
  evidence: GameAiEvidenceDocument,
): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const diagnostics = profile.pillars.map(pillar => ({
    name: pillar.name,
    strengthBand: calculateStrengthBand(pillar.evidenceTitles, evidence),
    ...calculateStrengthDiagnostics(pillar.evidenceTitles, evidence),
  }));

  console.warn('[gaming-ai-taste] pillar strength diagnostics', JSON.stringify(diagnostics, null, 2));
}

function roundDiagnosticNumber(value: number): number {
  return Number(value.toFixed(3));
}
