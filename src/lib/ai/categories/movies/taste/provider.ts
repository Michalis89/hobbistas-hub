import 'server-only';

import {
  GeminiTasteProvider,
  normalizeGeminiModelId,
  readGeminiTasteMaxOutputTokens,
  type TasteAiProvider,
} from '@/lib/ai/shared/taste/provider';
import { resolveGeminiApiKey } from '@/lib/ai/shared/provider/gemini';
import { MOVIES_AI_CATEGORY, MOVIES_TASTE_LOG_SCOPE } from '../constants';
import { buildMoviesTastePrompt, buildMoviesTasteRetryPrompt } from './prompt';
import {
  AiMoviesTasteProfileSchema,
  DEFAULT_GEMINI_MOVIES_TASTE_MODEL,
  GEMINI_MOVIES_TASTE_RESPONSE_SCHEMA,
  type MoviesAiEvidenceDocument,
} from './types';

export { normalizeGeminiModelId };
export { buildMoviesTastePrompt };

export type MoviesTasteAiProvider = TasteAiProvider<MoviesAiEvidenceDocument>;

export const MOVIES_TASTE_MAX_OUTPUT_TOKENS_ENV = 'GEMINI_MOVIES_TASTE_MAX_OUTPUT_TOKENS';

/** Exposed so tests can assert parity with `AiMoviesTasteProfileSchema`. */
export function getGeminiMoviesTasteResponseSchema() {
  return GEMINI_MOVIES_TASTE_RESPONSE_SCHEMA;
}

export function getGeminiMoviesTasteMaxOutputTokens(): number {
  return readGeminiTasteMaxOutputTokens(MOVIES_TASTE_MAX_OUTPUT_TOKENS_ENV);
}

export class GeminiMoviesTasteProvider extends GeminiTasteProvider<MoviesAiEvidenceDocument> {
  constructor(apiKey: string) {
    super(apiKey, {
      category: MOVIES_AI_CATEGORY,
      logScope: MOVIES_TASTE_LOG_SCOPE,
      responseSchema: GEMINI_MOVIES_TASTE_RESPONSE_SCHEMA,
      profileSchema: AiMoviesTasteProfileSchema,
      buildPrompt: buildMoviesTastePrompt,
      buildRetryPrompt: buildMoviesTasteRetryPrompt,
      maxOutputTokensEnv: MOVIES_TASTE_MAX_OUTPUT_TOKENS_ENV,
    });
  }
}

/**
 * Resolves the configured movies taste provider.
 *
 * Its own enable flag, deliberately separate from every other category's: movies taste must be
 * switchable off without touching a feature that is already live, and vice versa. The model falls
 * back to the shared `GEMINI_TASTE_MODEL` because a model choice is an account-level fact, while
 * the flag is not.
 */
export function getConfiguredMoviesTasteProvider(): {
  provider: MoviesTasteAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_MOVIES_TASTE_MODEL ||
      process.env.GEMINI_TASTE_MODEL ||
      DEFAULT_GEMINI_MOVIES_TASTE_MODEL,
  );
  const enabled = process.env.MOVIES_AI_TASTE_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiMoviesTasteProvider(apiKey), model, enabled };
}
