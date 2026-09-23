import 'server-only';

import {
  GeminiTasteProvider,
  normalizeGeminiModelId,
  readGeminiTasteMaxOutputTokens,
  type TasteAiProvider,
} from '@/lib/ai/shared/taste/provider';
import { resolveGeminiApiKey } from '@/lib/ai/shared/provider/gemini';
import { TV_AI_CATEGORY, TV_TASTE_LOG_SCOPE } from '../constants';
import { buildTvTastePrompt, buildTvTasteRetryPrompt } from './prompt';
import {
  AiTvTasteProfileSchema,
  DEFAULT_GEMINI_TV_TASTE_MODEL,
  GEMINI_TV_TASTE_RESPONSE_SCHEMA,
  type TvAiEvidenceDocument,
} from './types';

export { normalizeGeminiModelId };
export { buildTvTastePrompt };

export type TvTasteAiProvider = TasteAiProvider<TvAiEvidenceDocument>;

export const TV_TASTE_MAX_OUTPUT_TOKENS_ENV = 'GEMINI_TV_TASTE_MAX_OUTPUT_TOKENS';

/** Exposed so tests can assert parity with `AiTvTasteProfileSchema`. */
export function getGeminiTvTasteResponseSchema() {
  return GEMINI_TV_TASTE_RESPONSE_SCHEMA;
}

export function getGeminiTvTasteMaxOutputTokens(): number {
  return readGeminiTasteMaxOutputTokens(TV_TASTE_MAX_OUTPUT_TOKENS_ENV);
}

export class GeminiTvTasteProvider extends GeminiTasteProvider<TvAiEvidenceDocument> {
  constructor(apiKey: string) {
    super(apiKey, {
      category: TV_AI_CATEGORY,
      logScope: TV_TASTE_LOG_SCOPE,
      responseSchema: GEMINI_TV_TASTE_RESPONSE_SCHEMA,
      profileSchema: AiTvTasteProfileSchema,
      buildPrompt: buildTvTastePrompt,
      buildRetryPrompt: buildTvTasteRetryPrompt,
      maxOutputTokensEnv: TV_TASTE_MAX_OUTPUT_TOKENS_ENV,
    });
  }
}

/**
 * Resolves the configured tv taste provider.
 *
 * Its own enable flag, deliberately separate from every other category's. The model falls back to
 * the shared `GEMINI_TASTE_MODEL` because a model choice is an account-level fact, while the flag
 * is not.
 */
export function getConfiguredTvTasteProvider(): {
  provider: TvTasteAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_TV_TASTE_MODEL ||
      process.env.GEMINI_TASTE_MODEL ||
      DEFAULT_GEMINI_TV_TASTE_MODEL,
  );
  const enabled = process.env.TV_AI_TASTE_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiTvTasteProvider(apiKey), model, enabled };
}
