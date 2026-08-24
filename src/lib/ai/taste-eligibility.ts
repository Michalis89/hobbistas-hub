/**
 * Whether an AI taste profile is worth asking for, for a given category and library.
 *
 * Client-safe on purpose: no node builtins, no zod, no server-only imports. Both the dashboard
 * (deciding whether to mount the section at all) and the server-side evidence builder (deciding
 * whether a library is too sparse to reason about) read the threshold from here, so the two ends
 * cannot drift apart into "the client asks, the server always says no".
 *
 * Support itself lives in the capability registry — see `capabilities.ts`. This module answers
 * only "given that the category is supported, is this particular library worth a request?".
 */

import {
  DEFAULT_MIN_TASTE_EVIDENCE_TITLES,
  getMinTasteEvidenceTitles,
  isAiTasteSupportedCategory,
} from './capabilities';

export type { AiTasteCategory } from './capabilities';
export { isAiTasteSupportedCategory } from './capabilities';

/**
 * Minimum number of evidence-bearing titles before a profile is worth generating.
 *
 * Mirrors the server's `sparse` boundary. Below this the model has nothing to generalise from and
 * the category's generator refuses anyway, so asking only spends a request to be told no. This is
 * the default; a category may register its own floor.
 */
export const AI_TASTE_MIN_EVIDENCE_TITLES = DEFAULT_MIN_TASTE_EVIDENCE_TITLES;

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
 * Adding a category later means registering it in `capabilities.ts` and giving it a server
 * adapter — no dashboard changes.
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
  return engagedEntryCount >= getMinTasteEvidenceTitles(category);
}
