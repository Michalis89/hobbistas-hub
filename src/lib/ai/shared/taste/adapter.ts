import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { TasteSchemaIssue } from './schema-issues';
import type { TasteAiProvider } from './provider';

/**
 * What a category must supply to produce an AI taste profile.
 *
 * Everything in a generation that is *not* here — the cache lookup, the in-flight guard, the
 * cooldowns, the abort budget, the failure classification and the logging — is the same question
 * asked about different nouns, and lives once in `generation-runner.ts`.
 *
 * What remains genuinely per-category is where the whole value of the feature is: what the library
 * rows mean, what collapses into what, how strong a piece of evidence is, and what the model is
 * told. None of that generalises, and none of it should be pushed into the runner to make the
 * runner look cleverer.
 */

export type TasteValidationFailure = {
  success: false;
  /** `schema` | `content` | `evidence` — which stage refused it. */
  category: string;
  /** Shape and rule names only. Never generated text. */
  reason: string;
  issues?: TasteSchemaIssue[];
};

export type TasteValidationSuccess<TProfile> = {
  success: true;
  profile: TProfile;
  /**
   * Signals that were dropped rather than rejected outright.
   *
   * An unsupported negative signal can be excised from an array without damaging the rest of the
   * response; an unsupported claim inside prose cannot, which is why some categories escalate that
   * case to a failure instead.
   */
  droppedNegativeSignals: string[];
};

export type TasteValidationResult<TProfile> =
  | TasteValidationSuccess<TProfile>
  | TasteValidationFailure;

export type TasteGenerationAdapter<THistory, TEvidence, TProfile, TEnriched> = {
  /** Keys the `ai_taste_profiles` row. */
  category: string;
  logScope: string;

  promptVersion: string;
  schemaVersion: number;

  getTimeoutMs(): number;

  resolveProvider(): {
    provider: TasteAiProvider<TEvidence> | null;
    model: string;
    enabled: boolean;
  };

  loadHistory(supabase: SupabaseClient<Database>, userId: string): Promise<THistory>;

  buildEvidence(history: THistory): TEvidence;

  /** Folds in the model id, so changing models invalidates every stored profile. */
  hashEvidence(evidence: TEvidence, model: string): string;

  /**
   * Whether the evidence is too thin to be worth a provider call.
   *
   * Asked of the evidence rather than counted by the runner: each category decides what "enough"
   * means from its own `dataQuality`, and the floors genuinely differ between them.
   */
  isSparse(evidence: TEvidence): boolean;

  validate(raw: unknown, evidence: TEvidence): TasteValidationResult<TProfile>;

  /**
   * Attaches everything the model is not allowed to produce.
   *
   * Strength bands, data-quality figures and provenance are all computed deterministically. The
   * model contributes prose and the titles it cites, and nothing else.
   */
  enrich(profile: TProfile, evidence: TEvidence, model: string, inputHash: string): TEnriched;
};
