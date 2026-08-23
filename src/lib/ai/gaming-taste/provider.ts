import 'server-only';

import {
  AiGamingTasteProfileSchema,
  DEFAULT_GEMINI_TASTE_MODEL,
  GAME_AI_TASTE_LIST_LIMITS,
  GAME_AI_TASTE_SCHEMA_VERSION,
  GAME_AI_TASTE_TEXT_LIMITS,
  type AiGamingTasteProfile,
  type GameAiEvidenceDocument,
} from './types';

export type GameTasteProviderInput = {
  evidence: GameAiEvidenceDocument;
  model: string;
  signal?: AbortSignal;
};

export interface GameTasteAiProvider {
  generateProfile(input: GameTasteProviderInput): Promise<unknown>;
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export const DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS = 6_000;

/**
 * A non-2xx response from Gemini, carrying enough detail for the caller to decide how long to
 * back off. A 429 recovers in seconds and should not be treated like a broken integration.
 */
export class GeminiTasteProviderError extends Error {
  readonly status: number;
  /** Server-suggested wait from the 429 payload, in ms; null when absent. */
  readonly retryAfterMs: number | null;

  constructor(status: number, detail: string | null, retryAfterMs: number | null) {
    super(`Gemini taste profile failed with ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'GeminiTasteProviderError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Mirrors `AiGamingTasteProfileSchema` field for field.
 *
 * Every bound Zod enforces must also appear here, or constrained decoding happily produces
 * output that Zod then rejects wholesale — a whole generation thrown away over one long string.
 * `GAME_AI_TASTE_TEXT_LIMITS` is the single source of truth for the shared numbers; keep any
 * change to one side reflected on the other.
 */
const GEMINI_TASTE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    // Zod: z.literal(1). Gemini's `enum` is string-only, so pin the integer by range.
    schemaVersion: {
      type: 'integer',
      minimum: GAME_AI_TASTE_SCHEMA_VERSION,
      maximum: GAME_AI_TASTE_SCHEMA_VERSION,
    },
    identity: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          minLength: 1,
          maxLength: GAME_AI_TASTE_TEXT_LIMITS.identityLabel,
        },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: GAME_AI_TASTE_TEXT_LIMITS.description,
        },
      },
      required: ['label', 'description'],
      propertyOrdering: ['label', 'description'],
    },
    pillars: {
      type: 'array',
      minItems: GAME_AI_TASTE_LIST_LIMITS.pillarsMin,
      maxItems: GAME_AI_TASTE_LIST_LIMITS.pillarsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: GAME_AI_TASTE_TEXT_LIMITS.name },
          kind: { type: 'string', enum: ['content', 'behavior'] },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: GAME_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: GAME_AI_TASTE_LIST_LIMITS.pillarEvidenceMin,
            maxItems: GAME_AI_TASTE_LIST_LIMITS.evidenceMax,
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
      maxItems: GAME_AI_TASTE_LIST_LIMITS.negativeSignalsMax,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: GAME_AI_TASTE_TEXT_LIMITS.name },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: GAME_AI_TASTE_TEXT_LIMITS.description,
          },
          evidenceTitles: {
            type: 'array',
            minItems: GAME_AI_TASTE_LIST_LIMITS.negativeEvidenceMin,
            maxItems: GAME_AI_TASTE_LIST_LIMITS.evidenceMax,
            items: { type: 'string', minLength: 1 },
          },
        },
        required: ['name', 'description', 'evidenceTitles'],
        propertyOrdering: ['name', 'description', 'evidenceTitles'],
      },
    },
    summary: { type: 'string', minLength: 1, maxLength: GAME_AI_TASTE_TEXT_LIMITS.summary },
    openQuestions: {
      type: 'array',
      minItems: 0,
      maxItems: GAME_AI_TASTE_LIST_LIMITS.openQuestionsMax,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: GAME_AI_TASTE_TEXT_LIMITS.openQuestion,
      },
    },
  },
  required: ['schemaVersion', 'identity', 'pillars', 'negativeSignals', 'summary', 'openQuestions'],
  propertyOrdering: [
    'schemaVersion',
    'identity',
    'pillars',
    'negativeSignals',
    'summary',
    'openQuestions',
  ],
} as const;

/** Exposed so tests can assert parity with `AiGamingTasteProfileSchema`. */
export function getGeminiTasteResponseSchema(): typeof GEMINI_TASTE_RESPONSE_SCHEMA {
  return GEMINI_TASTE_RESPONSE_SCHEMA;
}

export class GeminiGameTasteProvider implements GameTasteAiProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateProfile({ evidence, model, signal }: GameTasteProviderInput): Promise<unknown> {
    const modelId = normalizeGeminiModelId(model);
    const maxOutputTokens = getGeminiTasteMaxOutputTokens();
    const first = await this.generateStructuredJson({
      modelId,
      prompt: buildGamingTastePrompt(evidence),
      temperature: 0.2,
      maxOutputTokens,
      signal,
    });

    let firstParsed: unknown;
    try {
      firstParsed = parseGeminiJson(first.text);
    } catch (error) {
      if (!isInvalidJsonError(error) || signal?.aborted) {
        throw error;
      }
      console.warn('[gaming-ai-taste] Gemini returned invalid JSON; retrying once.', first.metadata);
    }

    if (firstParsed !== undefined) {
      // The response schema mirrors the Zod contract, so a structural miss here is unexpected.
      // Retry once deterministically rather than discarding the whole generation.
      if (AiGamingTasteProfileSchema.safeParse(firstParsed).success) {
        return firstParsed as AiGamingTasteProfile;
      }
      if (signal?.aborted) {
        return firstParsed;
      }
      console.warn(
        '[gaming-ai-taste] Gemini output missed the structural contract; retrying once.',
        first.metadata,
      );
    }

    const retry = await this.generateStructuredJson({
      modelId,
      prompt: buildGamingTasteRetryPrompt(evidence),
      temperature: 0,
      maxOutputTokens,
      signal,
    });

    try {
      return parseGeminiJson(retry.text) as AiGamingTasteProfile;
    } catch (error) {
      if (isInvalidJsonError(error)) {
        console.warn('[gaming-ai-taste] Gemini retry returned invalid JSON.', retry.metadata);
      }
      // Nothing usable from the retry either; surface the first attempt so the service can
      // report a precise validation category instead of a generic provider error.
      if (firstParsed !== undefined) {
        return firstParsed;
      }
      throw error;
    }
  }

  private async generateStructuredJson({
    modelId,
    prompt,
    temperature,
    maxOutputTokens,
    signal,
  }: {
    modelId: string;
    prompt: string;
    temperature: number;
    maxOutputTokens: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; metadata: GeminiResponseMetadata }> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelId,
      )}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens,
            responseMimeType: 'application/json',
            responseSchema: GEMINI_TASTE_RESPONSE_SCHEMA,
          },
        }),
        signal,
      },
    );

    if (!response.ok) {
      const { detail, retryAfterMs } = await readGeminiError(response);
      throw new GeminiTasteProviderError(response.status, detail, retryAfterMs);
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts?.map(part => part.text ?? '').join('');
    if (!text) {
      throw new Error('Gemini taste profile response was empty');
    }

    return {
      text,
      metadata: {
        finishReason: candidate?.finishReason ?? null,
        partCount: candidate?.content?.parts?.length ?? 0,
        textLength: text.length,
        maxOutputTokens,
      },
    };
  }
}

export function normalizeGeminiModelId(model: string): string {
  return model.trim().replace(/^models\//, '');
}

export function getGeminiTasteMaxOutputTokens(): number {
  const configured = Number(process.env.GEMINI_TASTE_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS;
  }
  return Math.max(2_500, Math.min(Math.floor(configured), 12_000));
}

type GeminiResponseMetadata = {
  finishReason: string | null;
  partCount: number;
  textLength: number;
  maxOutputTokens: number;
};

async function readGeminiError(
  response: Response,
): Promise<{ detail: string | null; retryAfterMs: number | null }> {
  try {
    const payload = (await response.json()) as GeminiErrorResponse;
    const message = payload.error?.message?.trim();
    const status = payload.error?.status?.trim();
    const code = payload.error?.code;
    const parts = [status, typeof code === 'number' ? String(code) : null, message].filter(Boolean);
    return {
      detail: parts.length > 0 ? parts.join(' - ') : null,
      retryAfterMs: parseRetryAfterMs(response, message),
    };
  } catch {
    return { detail: null, retryAfterMs: parseRetryAfterMs(response, undefined) };
  }
}

/** Prefers the standard `Retry-After` header, falling back to Gemini's "retry in 2.3s" prose. */
function parseRetryAfterMs(response: Response, message: string | undefined): number | null {
  const header = Number(response.headers?.get?.('retry-after'));
  if (Number.isFinite(header) && header > 0) {
    return Math.round(header * 1_000);
  }
  const prose = message?.match(/retry in ([\d.]+)s/i);
  if (prose) {
    const seconds = Number(prose[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.round(seconds * 1_000);
    }
  }
  return null;
}

function parseGeminiJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = stripJsonFence(trimmed);

  try {
    return JSON.parse(unfenced);
  } catch {
    const extracted = extractJsonObject(unfenced);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {
        throw new Error('Gemini taste profile response was not valid JSON');
      }
    }

    throw new Error('Gemini taste profile response was not valid JSON');
  }
}

function isInvalidJsonError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Gemini taste profile response was not valid JSON';
}

function stripJsonFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? text;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

export function getConfiguredGameTasteProvider(): {
  provider: GameTasteAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(process.env.GEMINI_TASTE_MODEL || DEFAULT_GEMINI_TASTE_MODEL);
  const enabled = process.env.GAMING_AI_TASTE_ENABLED === 'true';
  const providerName = process.env.AI_PROVIDER || 'gemini';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!enabled || providerName !== 'gemini' || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiGameTasteProvider(apiKey), model, enabled };
}

export function buildGamingTastePrompt(evidence: GameAiEvidenceDocument): string {
  return [
    'Infer a semantic Gaming Taste Profile from the supplied deterministic evidence.',
    'Do not output percentages, numeric confidence values, or recommendation rankings.',
    'Do not merely restate genre frequency. Distinguish games that share metadata but imply different preferences.',
    'Name each pillar after the specific shared design or taste pattern linking its evidence titles, not a broad genre, platform, budget tier, or loose umbrella label.',
    'Avoid vague labels such as cinematic, epic, open-world, RPG, action, adventure, or AAA unless the description states the more precise shared appeal.',
    'Do not group evidence titles merely because they are polished, popular, cinematic, or open-world; group them by player-facing appeal such as authored narrative, difficult combat mastery, dark atmosphere, exploration pressure, tactical party agency, stealth/traversal fantasy, or emotional stakes.',
    'The identity label should reflect the strongest recurring tensions in the evidence; do not over-index on "epic" if challenge, atmosphere, authored narrative, or combat mastery are equally central.',
    'A negative signal must name the concrete mechanic or play pattern every one of its cited titles actually shares, verified title by title. Do not reach for a genre or category word that only fits some of them.',
    'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
    'Ground negative signals in titles the player abandoned unrated or rated poorly. A title the player rated well is not evidence of aversion even if abandoned, and a favorite never is.',
    'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern that has more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the player will enjoy next, and do not ask about data that is not in the evidence.',
    'You may use general knowledge about supplied game titles, but every evidence claim must cite only titles present in the evidence.',
    'Return only raw JSON. Do not wrap the response in Markdown fences, prose, or comments.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 real supplied titles; 0-3 negative signals; summary <= 45 words; 0-2 open questions.',
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}

function buildGamingTasteRetryPrompt(evidence: GameAiEvidenceDocument): string {
  return [
    'Return a Gaming Taste Profile as one valid JSON object only.',
    'Do not include Markdown, code fences, prose before JSON, prose after JSON, JavaScript syntax, backticks, comments, or trailing commas.',
    'Every JSON string must use double quotes and must escape embedded double quotes.',
    'Name pillars after precise shared design/taste patterns, not broad genre umbrellas or popularity/budget labels.',
    'Avoid vague labels such as cinematic, epic, open-world, RPG, action, adventure, or AAA unless the description states the more precise shared appeal.',
    'Do not group evidence titles merely because they are polished, popular, cinematic, or open-world; group them by player-facing appeal such as authored narrative, difficult combat mastery, dark atmosphere, exploration pressure, tactical party agency, stealth/traversal fantasy, or emotional stakes.',
    'The identity label should reflect the strongest recurring tensions in the evidence; do not over-index on "epic" if challenge, atmosphere, authored narrative, or combat mastery are equally central.',
    'A negative signal must name the concrete mechanic or play pattern every one of its cited titles actually shares, verified title by title. Do not reach for a genre or category word that only fits some of them.',
    'Prefer a narrower label that is true of all cited titles over a broader one that is loosely true of most. If the titles do not share one precise pattern, split them into separate signals or omit them; returning fewer negative signals is better than returning an inaccurate one.',
    'Ground negative signals in titles the player abandoned unrated or rated poorly. A title the player rated well is not evidence of aversion even if abandoned, and a favorite never is.',
    'Each open question must name a genuine ambiguity in the supplied evidence: an observed pattern that has more than one plausible explanation, stated so a future signal could settle it. Do not forecast what the player will enjoy next, and do not ask about data that is not in the evidence.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Keep all descriptions concise: one sentence each. Constraints: identity label <= 4 words; 2-4 pillars; each pillar cites 2-5 exact evidence titles; 0-3 negative signals; summary <= 45 words; 0-2 open questions.',
    'Evidence document:',
    JSON.stringify(evidence),
  ].join('\n\n');
}
