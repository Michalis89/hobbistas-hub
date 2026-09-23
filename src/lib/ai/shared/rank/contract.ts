import { z } from 'zod';

/**
 * The ranking response contract, in both dialects that need it.
 *
 * Every category asks the same structural question — "return this exact list, reordered, one
 * short reason each" — and differs only in how many candidates it sends and how long a rationale
 * it will accept. Those are numbers, not shapes, so they travel as config rather than as a
 * rewritten schema per category.
 *
 * The two builders below must stay in step: Zod decides what the app will accept, and the Gemini
 * `responseSchema` decides what the provider is allowed to emit. Letting them drift turns a
 * provider-side guarantee into an app-side rejection.
 */

export type RankingContractConfig = {
  /** Pinned into the response so a stored ranking says which contract produced it. */
  schemaVersion: number;
  minItems: number;
  maxItems: number;
  rationaleMaxChars: number;
};

export type RankingResultSchema = ReturnType<typeof buildRankingResultSchema>;

export function buildRankingResultSchema({
  schemaVersion,
  minItems,
  maxItems,
  rationaleMaxChars,
}: RankingContractConfig) {
  return z.object({
    schemaVersion: z.literal(schemaVersion),
    ranking: z
      .array(
        z.object({
          candidateId: z.string().trim().min(1),
          rank: z.number().int().min(1),
          rationale: z.string().trim().min(1).max(rationaleMaxChars),
        }),
      )
      .min(minItems)
      .max(maxItems),
  });
}

/**
 * Mirrors the Zod contract field for field, for Gemini's constrained decoding.
 *
 * The `candidateId` enum is the load-bearing part: pinning it to exactly the tokens issued this
 * run makes a hallucinated candidate structurally impossible rather than merely detectable, which
 * is the whole reason candidates travel as opaque tokens instead of media ids.
 */
export function buildGeminiRankingResponseSchema(
  tokens: readonly string[],
  { schemaVersion, rationaleMaxChars }: Pick<RankingContractConfig, 'schemaVersion' | 'rationaleMaxChars'>,
) {
  const count = tokens.length;
  return {
    type: 'object',
    properties: {
      // Zod: z.literal(n). Gemini's `enum` is string-only, so pin the integer by range.
      schemaVersion: {
        type: 'integer',
        minimum: schemaVersion,
        maximum: schemaVersion,
      },
      ranking: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          properties: {
            candidateId: { type: 'string', enum: [...tokens] },
            rank: { type: 'integer', minimum: 1, maximum: count },
            rationale: {
              type: 'string',
              minLength: 1,
              maxLength: rationaleMaxChars,
            },
          },
          required: ['candidateId', 'rank', 'rationale'],
          propertyOrdering: ['candidateId', 'rank', 'rationale'],
        },
      },
    },
    required: ['schemaVersion', 'ranking'],
    propertyOrdering: ['schemaVersion', 'ranking'],
  } as const;
}
