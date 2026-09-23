import { extractFranchiseKey } from '@/lib/recommendations/v3/utils/franchise';
import { slugifyTitle, stripTrailingYear } from '@/lib/ai/shared/taste/family';

/**
 * What counts as the same series, and what counts as the same franchise.
 *
 * Television is the category where identity collapse does the most work. A library row is often a
 * season — "Better Call Saul Season 3" — and a viewer who tracked five seasons separately has made
 * one decision about one show, not five. Treating those as five entries would let a single series
 * outweigh a whole genre, which is exactly the failure Track A found on the movies side with
 * actors.
 *
 * So seasons collapse into the series at the *identity* level here, unlike films where instalments
 * stay separate. The distinction is real: starting season four of a show you have watched for three
 * years is not a fresh decision the way seeing a sequel film is.
 */

const SEASON_MARKERS = [
  /\s*[:\-–—]?\s*(season|series|staffel|saison|temporada)\s+\d+\s*$/i,
  /\s*[:\-–—]?\s*(season|series)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s*$/i,
  /\s*[([]\s*(season|series)\s+\d+\s*[)\]]\s*$/i,
  /\s*\bs\d{1,2}\s*$/i,
  /\s*[:\-–—]\s*(the\s+)?(final|complete)\s+season\s*$/i,
  /\s*[:\-–—]?\s*part\s+(one|two|three|four|\d+)\s*$/i,
  /\s*[:\-–—]?\s*(volume|vol\.?)\s+\d+\s*$/i,
];

/**
 * Strips season and part furniture, leaving readable title text.
 *
 * Returns *text*, not a key, and the family rule below depends on that: slugifying first would
 * remove the colon that separates a franchise from its series, and "Star Trek: Deep Space Nine"
 * groups with "Star Trek: Voyager" only because that separator survives.
 *
 * The year is stripped after the season markers, so "Doctor Who (2005)" and "Doctor Who Season 2
 * (2005)" land on the same key — TMDB uses the year to separate a revival from its original, and
 * that distinction matters for the row but not for what the viewer is telling us about taste.
 */
export function stripTvSeasonMarkers(title: string): string {
  let working = title.trim();

  for (let pass = 0; pass < 3; pass += 1) {
    const before = working;
    for (const pattern of SEASON_MARKERS) {
      const stripped = working.replace(pattern, '');
      // Never reduce a title to nothing: a show literally called "Part Two" would vanish.
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

/** One series, however its seasons were logged. */
export function normalizeTvIdentityKey(title: string): string {
  return slugifyTitle(stripTvSeasonMarkers(title)) || slugifyTitle(title);
}

/**
 * One franchise, however many series of it were logged.
 *
 * Handed the season-stripped *text* rather than the identity key. Groups spin-offs that announce
 * themselves — the several Star Trek series, the several Law & Order series — while leaving
 * unrelated shows apart. Used only to stop a pillar being built from one franchise; it never merges
 * entries.
 */
export function normalizeTvFamilyKey(title: string): string {
  return extractFranchiseKey(stripTvSeasonMarkers(title)) || normalizeTvIdentityKey(title);
}
