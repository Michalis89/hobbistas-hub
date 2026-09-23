import 'server-only';

import {
  GeminiTasteProvider,
  normalizeGeminiModelId,
  readGeminiTasteMaxOutputTokens,
  type TasteAiProvider,
} from '@/lib/ai/shared/taste/provider';
import { resolveGeminiApiKey } from '@/lib/ai/shared/provider/gemini';
import { BOOKS_AI_CATEGORY, BOOKS_TASTE_LOG_SCOPE } from '../constants';
import { buildBooksTastePrompt, buildBooksTasteRetryPrompt } from './prompt';
import {
  AiBooksTasteProfileSchema,
  DEFAULT_GEMINI_BOOKS_TASTE_MODEL,
  GEMINI_BOOKS_TASTE_RESPONSE_SCHEMA,
  type BooksAiEvidenceDocument,
} from './types';

export { normalizeGeminiModelId };
export { buildBooksTastePrompt };

export type BooksTasteAiProvider = TasteAiProvider<BooksAiEvidenceDocument>;

export const BOOKS_TASTE_MAX_OUTPUT_TOKENS_ENV = 'GEMINI_BOOKS_TASTE_MAX_OUTPUT_TOKENS';

/** Exposed so tests can assert parity with `AiBooksTasteProfileSchema`. */
export function getGeminiBooksTasteResponseSchema() {
  return GEMINI_BOOKS_TASTE_RESPONSE_SCHEMA;
}

export function getGeminiBooksTasteMaxOutputTokens(): number {
  return readGeminiTasteMaxOutputTokens(BOOKS_TASTE_MAX_OUTPUT_TOKENS_ENV);
}

export class GeminiBooksTasteProvider extends GeminiTasteProvider<BooksAiEvidenceDocument> {
  constructor(apiKey: string) {
    super(apiKey, {
      category: BOOKS_AI_CATEGORY,
      logScope: BOOKS_TASTE_LOG_SCOPE,
      responseSchema: GEMINI_BOOKS_TASTE_RESPONSE_SCHEMA,
      profileSchema: AiBooksTasteProfileSchema,
      buildPrompt: buildBooksTastePrompt,
      buildRetryPrompt: buildBooksTasteRetryPrompt,
      maxOutputTokensEnv: BOOKS_TASTE_MAX_OUTPUT_TOKENS_ENV,
    });
  }
}

/**
 * Resolves the configured books taste provider.
 *
 * Its own enable flag, deliberately separate from every other category's. The model falls back to
 * the shared `GEMINI_TASTE_MODEL` because a model choice is an account-level fact, while the flag
 * is not.
 */
export function getConfiguredBooksTasteProvider(): {
  provider: BooksTasteAiProvider | null;
  model: string;
  enabled: boolean;
} {
  const model = normalizeGeminiModelId(
    process.env.GEMINI_BOOKS_TASTE_MODEL ||
      process.env.GEMINI_TASTE_MODEL ||
      DEFAULT_GEMINI_BOOKS_TASTE_MODEL,
  );
  const enabled = process.env.BOOKS_AI_TASTE_ENABLED === 'true';
  const apiKey = resolveGeminiApiKey();

  if (!enabled || !apiKey) {
    return { provider: null, model, enabled };
  }

  return { provider: new GeminiBooksTasteProvider(apiKey), model, enabled };
}
