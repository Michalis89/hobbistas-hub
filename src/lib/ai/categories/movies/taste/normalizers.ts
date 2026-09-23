import { extractFranchiseKey } from '@/lib/recommendations/v3/utils/franchise';
import { slugifyTitle, stripTrailingYear } from '@/lib/ai/shared/taste/family';

/**
 * What counts as the same film, and what counts as the same series.
 *
 * Films need a sharper identity rule than any other category, because a single film accumulates
 * more distinct rows than anything else in the library: a theatrical cut, an extended edition, a
 * director's cut, a remaster and a re-release year are five rows for one viewing decision. Treating
 * them as five signals would let one favourite film outweigh a whole genre.
 */

const CUT_MARKERS = [
  /\s*[([]\s*(extended|theatrical|director.?s|unrated|uncut|special|final|ultimate|redux|remastered|restored|international)\s*(cut|edition|version)?\s*[)\]]\s*$/i,
  /\s*[-:]\s*(extended|theatrical|director.?s|unrated|uncut|special|final|ultimate|redux|remastered|restored|international)\s+(cut|edition|version)\s*$/i,
  /\s+(extended|theatrical|director.?s|unrated|uncut|special|final|ultimate)\s+(cut|edition|version)\s*$/i,
  /\s*[([]\s*\d{1,2}k\s*(remaster(ed)?)?\s*[)\]]\s*$/i,
  /\s+\d{1,2}k\s+remaster(ed)?\s*$/i,
];

/**
 * Strips cut and edition furniture, leaving readable title text.
 *
 * Returns *text*, not a key, and both functions below depend on that. Slugifying first would remove
 * the colon that separates a franchise from its subtitle, and the franchise rule needs that colon —
 * "The Lord of the Rings: The Two Towers" becomes one family only because the separator survives
 * long enough to be seen. That was a real bug here, caught by the family test.
 *
 * The year is stripped last and only from the end, so "2001: A Space Odyssey" keeps its title: the
 * year rule looks for a trailing token, and that one leads.
 */
export function stripMovieEditionMarkers(title: string): string {
  let working = title.trim();

  for (let pass = 0; pass < 3; pass += 1) {
    const before = working;
    for (const pattern of CUT_MARKERS) {
      const stripped = working.replace(pattern, '');
      // Never reduce a title to nothing: a film literally called "Unrated" would vanish.
      if (stripped.trim().length > 0) {
        working = stripped;
      }
    }
    if (working === before) {
      break;
    }
  }

  return stripTrailingYear(working);
}

/** One film, whatever cut of it was logged. */
export function normalizeMovieIdentityKey(title: string): string {
  return slugifyTitle(stripMovieEditionMarkers(title)) || slugifyTitle(title);
}

/**
 * One series, however many instalments of it were logged.
 *
 * Handed the cut-stripped *text* rather than the identity key, then passed to the recommender's
 * franchise rule — the same one Track A used to stop three Lord of the Rings films from counting as
 * three independent votes for Peter Jackson. Reusing it rather than writing a second rule means a
 * film grouped as one family here is grouped the same way on the dashboard.
 */
export function normalizeMovieFamilyKey(title: string): string {
  return (
    extractFranchiseKey(stripMovieEditionMarkers(title)) || normalizeMovieIdentityKey(title)
  );
}
