/**
 * Whether an AI taste profile is worth asking for, for a given category and library.
 *
 * Client-safe on purpose: no node builtins, no zod, no server-only imports. Both the dashboard
 * (deciding whether to mount the section at all) and the server-side evidence builder (deciding
 * whether a library is too sparse to reason about) read the threshold from here, so the two ends
 * cannot drift apart into "the client asks, the server always says no".
 */

/** Categories that actually have an AI taste implementation behind them. */
const AI_TASTE_SUPPORTED_CATEGORIES = ['games'] as const;

export type AiTasteCategory = (typeof AI_TASTE_SUPPORTED_CATEGORIES)[number];

/**
 * Minimum number of evidence-bearing titles before a profile is worth generating.
 *
 * Mirrors the server's `sparse` boundary. Below this the model has nothing to generalise from and
 * `generateGameAiTasteProfile` refuses anyway, so asking only spends a request to be told no.
 */
export const AI_TASTE_MIN_EVIDENCE_TITLES = 6;

export function isAiTasteSupportedCategory(category: string): category is AiTasteCategory {
  return (AI_TASTE_SUPPORTED_CATEGORIES as readonly string[]).includes(category);
}

export type AiTasteEligibilityInput = {
  category: string;
  /**
   * Titles the user has actually engaged with — completed, in progress or dropped.
   *
   * Planned entries are excluded because the server excludes them from evidence too: a backlog
   * says what someone intends, not what they liked.
   */
  engagedEntryCount: number;
  /** Someone else's dashboard. Never generate or spend a request on a viewer's behalf. */
  isReadOnly?: boolean;
};

/**
 * The single gate the dashboard consults before mounting any AI taste UI.
 *
 * Adding a category later means adding it to `AI_TASTE_SUPPORTED_CATEGORIES` and giving it a
 * server implementation — no dashboard changes.
 */
export function isAiTasteEligible({
  category,
  engagedEntryCount,
  isReadOnly = false,
}: AiTasteEligibilityInput): boolean {
  if (isReadOnly) {
    return false;
  }
  if (!isAiTasteSupportedCategory(category)) {
    return false;
  }
  return engagedEntryCount >= AI_TASTE_MIN_EVIDENCE_TITLES;
}
