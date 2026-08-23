import 'server-only';

import {
  DEFAULT_GEMINI_RERANK_MODEL,
  GAME_RERANK_SCHEMA_VERSION,
  GAME_RERANK_TEXT_LIMITS,
  type GameRerankRequestPayload,
} from './types';

export type GameRerankProviderInput = {
  payload: GameRerankRequestPayload;
  /** Exactly the tokens issued this run; pins the `candidateId` enum. */
  tokens: readonly string[];
  model: string;
  signal?: AbortSignal;
};

export interface GameRerankAiProvider {
  rerank(input: GameRerankProviderInput): Promise<unknown>;
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

type GeminiErrorResponse = {
  error?: { code?: number; message?: string; status?: string };
};

export const DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS = 6_000;

export class GeminiRerankProviderError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, detail: string | null, retryAfterMs: number | null) {
    super(`Gemini rerank failed with ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'GeminiRerankProviderError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Mirrors `AiGameRerankResultSchema` field for field.
 *
 * The `candidateId` enum is the load-bearing part: pinning it to exactly the tokens issued this
 * run makes a hallucinated candidate structurally impossible rather than merely detectable, which
 * is the whole reason candidates travel as opaque tokens instead of media ids.
 */
export function buildGeminiRerankResponseSchema(tokens: readonly string[]) {
  const count = tokens.length;
  return {
    type: 'object',
    properties: {
      // Zod: z.literal(1). Gemini's `enum` is string-only, so pin the integer by range.
      schemaVersion: {
        type: 'integer',
        minimum: GAME_RERANK_SCHEMA_VERSION,
        maximum: GAME_RERANK_SCHEMA_VERSION,
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
              maxLength: GAME_RERANK_TEXT_LIMITS.rationale,
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

export class GeminiGameRerankProvider implements GameRerankAiProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async rerank({ payload, tokens, model, signal }: GameRerankProviderInput): Promise<unknown> {
    const modelId = normalizeGeminiModelId(model);
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
          contents: [{ role: 'user', parts: [{ text: buildRerankPrompt(payload) }] }],
          generationConfig: {
            // Ranking is not a creative task, and a reproducible answer makes the cache honest.
            temperature: 0,
            maxOutputTokens: getGeminiRerankMaxOutputTokens(),
            responseMimeType: 'application/json',
            responseSchema: buildGeminiRerankResponseSchema(tokens),
          },
        }),
        signal,
      },
    );

    if (!response.ok) {
      const { detail, retryAfterMs } = await readGeminiError(response);
      throw new GeminiRerankProviderError(response.status, detail, retryAfterMs);
    }

    const body = (await response.json()) as GeminiGenerateContentResponse;
    const text = body.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('');
    if (!text) {
      throw new Error('Gemini rerank response was empty');
    }

    return parseGeminiJson(text);
  }
}

/**
 * The rerank prompt.
 *
 * Two things it works hardest at: forbidding any change to the candidate set, and pushing the
 * comparison away from genre-label overlap. Label matching is precisely what the deterministic
 * scorer already does well; if the model does the same thing it adds latency and cost for a
 * reordering nobody needed.
 */
export function buildRerankPrompt(payload: GameRerankRequestPayload): string {
  return [
    'Rank a fixed list of games by how well each fits one player, described by the taste profile below.',
    'You may only reorder the supplied list. Do not add, remove, merge, rename or invent entries.',
    'Return every supplied candidateId exactly once. Ranks must be a permutation of 1..N with no gaps or repeats. Rank 1 is the best fit.',
    'Judge fit on mechanics, authorship, structure and pacing — what the player actually does moment to moment and how the game is shaped around them.',
    'Do not rank by genre-label overlap. Two games sharing the label "RPG" can differ completely in whether the player follows an authored story or manages systems; say which of those this player wants and rank accordingly.',
    'Treat each negative signal as a demotion criterion, not an exclusion: a matching candidate should rank low, but must still appear in the output.',
    'Weigh pillars by their strengthBand. A Defining pillar should dominate an Emerging one when the two disagree.',
    'Reason comparatively. Each rationale should say why this candidate sits above or below its neighbours, naming a pillar or negative signal.',
    `Each rationale must be one clause, at most ${GAME_RERANK_TEXT_LIMITS.rationale} characters.`,
    'Do not output percentages, scores, star ratings or any numeric confidence in rationale text.',
    'You may use general knowledge about the supplied titles, but rank only the candidates given.',
    'Return only raw JSON. Do not wrap the response in Markdown fences, prose or comments.',
    'The response JSON schema is supplied separately in generationConfig.responseSchema.',
    'Use schemaVersion exactly 1.',
    'Input:',
    JSON.stringify(payload),
  ].join('\n\n');
}

export function normalizeGeminiModelId(model: string): string {
  return model.trim().replace(/^models\//, '');
}

export function getGeminiRerankMaxOutputTokens(): number {
  const configured = Number(process.env.GEMINI_RERANK_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS;
  }
  return Math.max(2_000, Math.min(Math.floor(configured), 12_000));
}

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

export class GeminiRerankJsonError extends Error {
  constructor() {
    super('Gemini rerank response was not valid JSON');
    this.name = 'GeminiRerankJsonError';
  }
}

function parseGeminiJson(text: string): unknown {
  const unfenced = stripJsonFence(text.trim());
  try {
    return JSON.parse(unfenced);
  } catch {
    const extracted = extractJsonObject(unfenced);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {
        throw new GeminiRerankJsonError();
      }
    }
    throw new GeminiRerankJsonError();
  }
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

/**
 * Resolves the configured provider.
 *
 * No silent model fallback: the model id is whatever is configured, and it is recorded on every
 * shadow run and folded into the cache key. A shadow corpus whose rows cannot say which model
 * produced them is not evidence of anything.
 */
export function getConfiguredGameRerankProvider(): {
  provider: GameRerankAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_RERANK_MODEL || DEFAULT_GEMINI_RERANK_MODEL,
  );
  const enabled = process.env.GAMES_RERANK_SHADOW_ENABLED === 'true';
  const providerName = process.env.AI_PROVIDER || 'gemini';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!enabled || providerName !== 'gemini' || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiGameRerankProvider(apiKey), model, enabled };
}
