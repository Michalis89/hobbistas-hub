import { z } from 'zod';

/**
 * The taste-profile response contract, in both dialects that need it.
 *
 * Every category asks the model for the same document — an identity, a handful of evidence-cited
 * pillars, some negative signals, a summary, some open questions — and differs only in three
 * things: how long each field may be, how many of each it wants, and what a pillar's `kind` may
 * say. Those are configuration, not structure.
 *
 * The two builders below must stay in step. Zod decides what the app will accept; the Gemini
 * `responseSchema` decides what the provider is allowed to emit. A bound Zod enforces but the
 * provider schema omits is a bound the decoder never applies, so the model overruns it and the
 * whole generation is discarded over a string that was thirty characters too long.
 *
 * `pillarKinds` is the field that made a single shared schema impossible before this existed.
 * Games pillars are `content | behavior` — "behaviour" is a *player* concept, how someone plays.
 * A viewer or a reader has no equivalent; what they have is form — episodic versus serialised,
 * ensemble versus protagonist-focused, pacing, arc structure. Every category names its own.
 */

export type TasteProfileTextLimits = {
  identityLabel: number;
  name: number;
  description: number;
  summary: number;
  openQuestion: number;
};

export type TasteProfileListLimits = {
  pillarsMin: number;
  pillarsMax: number;
  pillarEvidenceMin: number;
  negativeEvidenceMin: number;
  evidenceMax: number;
  negativeSignalsMax: number;
  openQuestionsMax: number;
};

export type TasteProfileContractConfig = {
  schemaVersion: number;
  /** What a pillar's `kind` may say. At least one value; the first is the conventional default. */
  pillarKinds: readonly [string, ...string[]];
  textLimits: TasteProfileTextLimits;
  listLimits: TasteProfileListLimits;
};

export function buildTasteProfileSchema({
  schemaVersion,
  pillarKinds,
  textLimits,
  listLimits,
}: TasteProfileContractConfig) {
  return z.object({
    schemaVersion: z.literal(schemaVersion),
    identity: z.object({
      label: z.string().trim().min(1).max(textLimits.identityLabel),
      description: z.string().trim().min(1).max(textLimits.description),
    }),
    pillars: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(textLimits.name),
          kind: z.enum(pillarKinds as [string, ...string[]]),
          description: z.string().trim().min(1).max(textLimits.description),
          evidenceTitles: z
            .array(z.string().trim().min(1))
            .min(listLimits.pillarEvidenceMin)
            .max(listLimits.evidenceMax),
        }),
      )
      .min(listLimits.pillarsMin)
      .max(listLimits.pillarsMax),
    negativeSignals: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(textLimits.name),
          description: z.string().trim().min(1).max(textLimits.description),
          evidenceTitles: z
            .array(z.string().trim().min(1))
            .min(listLimits.negativeEvidenceMin)
            .max(listLimits.evidenceMax),
        }),
      )
      .max(listLimits.negativeSignalsMax),
    summary: z.string().trim().min(1).max(textLimits.summary),
    openQuestions: z
      .array(z.string().trim().min(1).max(textLimits.openQuestion))
      .max(listLimits.openQuestionsMax),
  });
}

/** Mirrors `buildTasteProfileSchema` field for field, for Gemini's constrained decoding. */
export function buildGeminiTasteResponseSchema({
  schemaVersion,
  pillarKinds,
  textLimits,
  listLimits,
}: TasteProfileContractConfig) {
  return {
    type: 'object',
    properties: {
      // Zod: z.literal(n). Gemini's `enum` is string-only, so pin the integer by range.
      schemaVersion: { type: 'integer', minimum: schemaVersion, maximum: schemaVersion },
      identity: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1, maxLength: textLimits.identityLabel },
          description: { type: 'string', minLength: 1, maxLength: textLimits.description },
        },
        required: ['label', 'description'],
        propertyOrdering: ['label', 'description'],
      },
      pillars: {
        type: 'array',
        minItems: listLimits.pillarsMin,
        maxItems: listLimits.pillarsMax,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: textLimits.name },
            kind: { type: 'string', enum: [...pillarKinds] },
            description: { type: 'string', minLength: 1, maxLength: textLimits.description },
            evidenceTitles: {
              type: 'array',
              minItems: listLimits.pillarEvidenceMin,
              maxItems: listLimits.evidenceMax,
              items: { type: 'string', minLength: 1 },
            },
          },
          required: ['name', 'kind', 'description', 'evidenceTitles'],
          propertyOrdering: ['name', 'kind', 'description', 'evidenceTitles'],
        },
      },
      negativeSignals: {
        type: 'array',
        minItems: 0,
        maxItems: listLimits.negativeSignalsMax,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: textLimits.name },
            description: { type: 'string', minLength: 1, maxLength: textLimits.description },
            evidenceTitles: {
              type: 'array',
              minItems: listLimits.negativeEvidenceMin,
              maxItems: listLimits.evidenceMax,
              items: { type: 'string', minLength: 1 },
            },
          },
          required: ['name', 'description', 'evidenceTitles'],
          propertyOrdering: ['name', 'description', 'evidenceTitles'],
        },
      },
      summary: { type: 'string', minLength: 1, maxLength: textLimits.summary },
      openQuestions: {
        type: 'array',
        minItems: 0,
        maxItems: listLimits.openQuestionsMax,
        items: { type: 'string', minLength: 1, maxLength: textLimits.openQuestion },
      },
    },
    required: [
      'schemaVersion',
      'identity',
      'pillars',
      'negativeSignals',
      'summary',
      'openQuestions',
    ],
    propertyOrdering: [
      'schemaVersion',
      'identity',
      'pillars',
      'negativeSignals',
      'summary',
      'openQuestions',
    ],
  } as const;
}
