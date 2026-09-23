import type { ZodTypeAny } from 'zod';
import { summarizeTasteSchemaIssues, type TasteSchemaIssue } from './schema-issues';
import type { TasteEvidenceEntryCore } from './evidence-core';
import {
  classifyNegativeEvidence,
  isSupportedNegativeSignal,
  type NegativeEvidenceStrength,
  type NegativeEvidenceThresholds,
} from './negative-evidence';
import type { TasteValidationResult } from './adapter';

/**
 * Judging one generated profile against the evidence it was given.
 *
 * The stages and, more importantly, *what each stage costs*, are shared across categories because
 * the reasoning is about the relationship between a claim and its citations, not about the medium.
 *
 * Three different costs, deliberately:
 *
 * *A hallucinated citation costs the generation.* A title that is not in the evidence means the
 * model was not reading the evidence, so nothing else it produced can be trusted either.
 *
 * *A contradiction costs the generation.* Citing a favourite as a dislike is the model asserting
 * the opposite of what the user said.
 *
 * *An over-claim costs only the signal.* A signal built from lukewarm citations is dropped and the
 * pillars stand. Regenerating would spend another provider call to lose them too — this is the case
 * that previously discarded a whole live profile over one reached-for citation.
 */

export type TasteProfileShape = {
  identity: { label: string; description: string };
  pillars: Array<{ name: string; description: string; evidenceTitles: string[] }>;
  negativeSignals: Array<{ name: string; description: string; evidenceTitles: string[] }>;
  summary: string;
  openQuestions: string[];
};

export type TasteValidationRules<TEntry extends TasteEvidenceEntryCore> = {
  schema: ZodTypeAny;
  entries: readonly TEntry[];
  /** How many `clear` entries the library holds. Zero forbids rejection language anywhere. */
  clearAversionCount: number;
  thresholds?: NegativeEvidenceThresholds;
  /** Maximum words in the identity label. */
  identityLabelMaxWords: number;
  /** Decides `nearlyFinished` for the aversion grader, per category. */
  isNearlyFinished: (entry: TEntry) => boolean | null;
  /**
   * Extra content rules a category enforces on the parsed profile.
   *
   * Returns a failure reason, or null to accept. Used for things no other category needs — manga
   * refusing a pillar named after a demographic bracket, for instance.
   */
  extraContentRules?: Array<(profile: TasteProfileShape) => string | null>;
  /**
   * Whether rejection language in prose should discard a generation when no negative signal
   * survived.
   *
   * On for categories where an unsupported "avoids X" cannot be excised the way an array entry
   * can. Off where the prose is checked some other way.
   */
  forbidUnsupportedRejectionProse: boolean;
};

const CATEGORY_BY_REASON: Record<string, string> = {
  schema_validation_failed: 'schema',
  identity_label_too_long: 'content',
  extra_content_rule: 'content',
  unsupported_rejection_prose: 'content',
  hallucinated_pillar_evidence: 'evidence',
  hallucinated_negative_evidence: 'evidence',
  contradicted_negative_evidence: 'evidence',
  single_family_pillar: 'evidence',
};

function fail(reason: string, issues?: TasteSchemaIssue[], detail?: string) {
  return {
    success: false as const,
    category: CATEGORY_BY_REASON[reason] ?? 'content',
    reason: detail ? `${reason} (${detail})` : reason,
    issues,
  };
}

/**
 * Words that assert a rejection.
 *
 * Checked only when the library contains no aversion evidence at all, and only against prose —
 * `identity.description` and `summary`. A profile that says "avoids slow-burn drama" for a user who
 * has abandoned nothing and rated nothing low is inventing the one claim we can prove is unfounded.
 */
const REJECTION_PROSE = /\b(avoid|avoids|avoiding|averse|aversion|dislike|dislikes|rejects?|rejecting|rejection|impatien\w*|shuns?|steers? clear|no patience|little patience)\b/i;

export function validateTasteProfile<TEntry extends TasteEvidenceEntryCore, TProfile>(
  raw: unknown,
  rules: TasteValidationRules<TEntry>,
): TasteValidationResult<TProfile> {
  const parsed = rules.schema.safeParse(raw);
  if (!parsed.success) {
    return fail('schema_validation_failed', summarizeTasteSchemaIssues(parsed.error, raw));
  }

  const profile = parsed.data as TasteProfileShape;

  if (profile.identity.label.trim().split(/\s+/).length > rules.identityLabelMaxWords) {
    return fail('identity_label_too_long');
  }

  for (const rule of rules.extraContentRules ?? []) {
    const reason = rule(profile);
    if (reason) {
      return fail('extra_content_rule', undefined, reason);
    }
  }

  const titleMap = buildEvidenceTitleMap(rules.entries);

  for (const pillar of profile.pillars) {
    const mapped = mapEvidenceTitles(pillar.evidenceTitles, titleMap);
    if (!mapped) {
      return fail('hallucinated_pillar_evidence');
    }
    // Family dominance, caught at the output rather than only damped at the input. Every citation
    // resolving to one family means the "pillar" is a description of a single series, which is a
    // fact about the library rather than a pattern across it.
    if (!citesMultipleFamilies(mapped)) {
      return fail('single_family_pillar');
    }
  }

  const supportedNegativeSignals: TasteProfileShape['negativeSignals'] = [];
  const droppedNegativeSignals: string[] = [];

  for (const signal of profile.negativeSignals) {
    const mapped = mapEvidenceTitles(signal.evidenceTitles, titleMap);
    if (!mapped) {
      return fail('hallucinated_negative_evidence');
    }

    const strengths = mapped.map(entry =>
      classifyNegativeEvidence(
        {
          status: entry.status,
          score: entry.score,
          favorite: entry.favorite,
          nearlyFinished: rules.isNearlyFinished(entry),
        },
        rules.thresholds,
      ),
    );

    if (strengths.includes('contradictory')) {
      return fail(
        'contradicted_negative_evidence',
        undefined,
        // Shape only: which rule fired and how often. Never a title, never generated text.
        `contradictory=${strengths.filter(s => s === 'contradictory').length}/${strengths.length}`,
      );
    }

    if (!isSupportedNegativeSignal(strengths)) {
      droppedNegativeSignals.push(`${signal.name} [${summarizeStrengths(strengths)}]`);
      continue;
    }

    supportedNegativeSignals.push(signal);
  }

  // An unsupported signal can be dropped from an array. An unsupported "avoids X" cannot be
  // excised from a sentence, so the whole generation goes instead.
  if (
    rules.forbidUnsupportedRejectionProse &&
    supportedNegativeSignals.length === 0 &&
    rules.clearAversionCount === 0 &&
    hasRejectionProse(profile)
  ) {
    return fail('unsupported_rejection_prose');
  }

  return {
    success: true,
    profile: { ...profile, negativeSignals: supportedNegativeSignals } as TProfile,
    droppedNegativeSignals,
  };
}

function hasRejectionProse(profile: TasteProfileShape): boolean {
  return REJECTION_PROSE.test(profile.identity.description) || REJECTION_PROSE.test(profile.summary);
}

/**
 * Maps every supplied title onto the entry it came from.
 *
 * Case- and whitespace-insensitive, because a model that reproduces a title with different casing
 * has not hallucinated it. Any title that resolves to nothing fails the whole list: partial
 * resolution would let one invented citation ride along with three real ones.
 */
export function buildEvidenceTitleMap<TEntry extends TasteEvidenceEntryCore>(
  entries: readonly TEntry[],
): Map<string, TEntry> {
  const map = new Map<string, TEntry>();
  for (const entry of entries) {
    for (const title of [entry.representativeTitle, ...entry.titles]) {
      const key = normalizeTitleKey(title);
      if (key && !map.has(key)) {
        map.set(key, entry);
      }
    }
  }
  return map;
}

export function mapEvidenceTitles<TEntry extends TasteEvidenceEntryCore>(
  titles: readonly string[],
  titleMap: Map<string, TEntry>,
): TEntry[] | null {
  const mapped: TEntry[] = [];
  for (const title of titles) {
    const entry = titleMap.get(normalizeTitleKey(title));
    if (!entry) {
      return null;
    }
    mapped.push(entry);
  }
  return mapped;
}

export function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function citesMultipleFamilies<TEntry extends TasteEvidenceEntryCore>(
  entries: readonly TEntry[],
): boolean {
  return new Set(entries.map(entry => entry.familyKey)).size > 1;
}

function summarizeStrengths(strengths: NegativeEvidenceStrength[]): string {
  const counts = new Map<string, number>();
  for (const strength of strengths) {
    counts.set(strength, (counts.get(strength) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([strength, count]) => `${strength}=${count}`)
    .join(' ');
}
