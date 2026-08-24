import 'server-only';

/**
 * Gemini `generateContent` transport.
 *
 * Category-independent by construction: it knows how to send a request, read an error and find
 * the text of a candidate, and nothing at all about what was asked. Prompts, response schemas and
 * validation stay with the category that owns their meaning.
 */

export type GeminiGenerateContentResponse = {
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

export type GeminiCandidateText = {
  /** Concatenated text parts; empty string when the candidate carried none. */
  text: string;
  finishReason: string | null;
  partCount: number;
};

/** Accepts either `gemini-3.6-flash` or the fully qualified `models/gemini-3.6-flash`. */
export function normalizeGeminiModelId(model: string): string {
  return model.trim().replace(/^models\//, '');
}

export type GeminiRequestOptions = {
  apiKey: string;
  modelId: string;
  prompt: string;
  /** Merged verbatim into `generationConfig`. The caller owns schema, temperature and budgets. */
  generationConfig: Record<string, unknown>;
  signal?: AbortSignal;
  /**
   * Builds the error thrown on a non-2xx response.
   *
   * Supplied by the caller so each feature keeps its own error type and message: the taste and
   * rerank paths back off differently, and a shared error class would flatten that.
   */
  onHttpError: (status: number, detail: string | null, retryAfterMs: number | null) => Error;
};

export async function requestGeminiGenerateContent({
  apiKey,
  modelId,
  prompt,
  generationConfig,
  signal,
  onHttpError,
}: GeminiRequestOptions): Promise<GeminiGenerateContentResponse> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId,
    )}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const { detail, retryAfterMs } = await readGeminiError(response);
    throw onHttpError(response.status, detail, retryAfterMs);
  }

  return (await response.json()) as GeminiGenerateContentResponse;
}

/** Pulls the first candidate's text and finish reason. Never throws on a shape it does not expect. */
export function readGeminiCandidate(
  payload: GeminiGenerateContentResponse,
): GeminiCandidateText {
  const candidate = payload.candidates?.[0];
  const parts = candidate?.content?.parts;
  return {
    text: parts?.map(part => part.text ?? '').join('') ?? '',
    finishReason: candidate?.finishReason ?? null,
    partCount: parts?.length ?? 0,
  };
}

export async function readGeminiError(
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
export function parseRetryAfterMs(response: Response, message: string | undefined): number | null {
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

/**
 * Resolves whether the Gemini provider is usable at all.
 *
 * Enablement is per feature (each has its own flag), but the provider name and key are global,
 * so those two checks live here rather than being repeated per feature.
 */
export function resolveGeminiApiKey(): string | null {
  const providerName = process.env.AI_PROVIDER || 'gemini';
  const apiKey = process.env.GEMINI_API_KEY;
  if (providerName !== 'gemini' || !apiKey) {
    return null;
  }
  return apiKey;
}
