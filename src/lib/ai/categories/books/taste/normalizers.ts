import { extractFranchiseKey } from '@/lib/recommendations/v3/utils/franchise';
import { slugifyTitle, stripTrailingYear } from '@/lib/ai/shared/taste/family';

/**
 * What counts as the same book, and what counts as the same series.
 *
 * Books collapse at two levels for the same reason manga does, and the split falls in the same
 * place. An edition is packaging: the illustrated, anniversary, box-set and mass-market printings
 * of one novel are one reading decision, so they merge at the *identity* level. An instalment is
 * not: reading the fourth book of a series is a real decision made after the third, so instalments
 * stay separate entries and merge only at the *family* level.
 *
 * Google Books titles are the messiest in the library — they carry series markers in parentheses,
 * binding in the subtitle, and publisher furniture nobody would call part of the title — so the
 * edition list here is longer than any other category's.
 */

const EDITION_MARKERS = [
  /\s*[([]\s*(illustrated|annotated|unabridged|abridged|deluxe|collector.?s|anniversary|revised|expanded|special|movie tie[\s-]?in|graphic novel)\s*(edition|version)?\s*[)\]]\s*$/i,
  /\s*[:\-–—]\s*(illustrated|annotated|unabridged|abridged|deluxe|collector.?s|anniversary|revised|expanded|special)\s+(edition|version)\s*$/i,
  /\s+(illustrated|annotated|unabridged|abridged|deluxe|collector.?s|anniversary|revised|expanded|special)\s+(edition|version)\s*$/i,
  /\s*[([]\s*(hardcover|paperback|mass market( paperback)?|kindle( edition)?|audiobook|ebook|box set|boxed set|omnibus)\s*[)\]]\s*$/i,
  /\s*[:\-–—]\s*(hardcover|paperback|mass market( paperback)?|box set|boxed set|omnibus)\s*$/i,
  /\s*[([]\s*\d+(st|nd|rd|th)\s+(anniversary\s+)?(edition|ed\.?)\s*[)\]]\s*$/i,
  /\s+\d+(st|nd|rd|th)\s+edition\s*$/i,
];

/**
 * A trailing series parenthetical, with the series name captured.
 *
 * Google Books writes the series *inside* the brackets — "(The Expanse, #2)", "(Discworld Book 5)"
 * — so the name is the thing to keep, not the thing to strip. Stripping it was the first attempt
 * here and it was wrong in the worst way: it left "Leviathan Wakes" and "Caliban's War" in separate
 * families, quietly disabling the guard that stops a pillar being built from one series.
 */
const SERIES_PARENTHETICALS = [
  /[([]\s*([^()\[\]]*?)\s*,\s*(?:book|vol\.?|volume|part|no\.?)?\s*#?\s*\d+\s*[)\]]\s*$/i,
  /[([]\s*([^()\[\]]*?)\s+(?:book|vol\.?|volume|part)\s+\d+\s*[)\]]\s*$/i,
  /[([]\s*([^()\[\]]*?)\s*#\s*\d+\s*[)\]]\s*$/i,
];

/** Trailing instalment markers with no series name attached, stripped only for the family key. */
const TRAILING_INSTALMENT_MARKERS = [
  /\s*[:\-–—]?\s*(book|vol\.?|volume|part)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*$/i,
  /\s*,\s*(book|vol\.?|volume|part)\s+\d+\s*$/i,
  /\s*[([]\s*#\s*\d+\s*[)\]]\s*$/i,
];

/**
 * The series a title names in its own brackets, if it names one.
 *
 * Returns null rather than guessing. An empty capture — "(, #2)" — is treated as no series, because
 * a family key built from nothing would merge every malformed title in the library.
 */
export function extractBookSeriesName(title: string): string | null {
  for (const pattern of SERIES_PARENTHETICALS) {
    const match = title.match(pattern);
    const name = match?.[1]?.trim();
    if (name) {
      return name;
    }
  }
  return null;
}

/**
 * Strips edition furniture, leaving readable title text.
 *
 * Returns *text*, not a key, and the family rule below depends on that: slugifying first would
 * remove the colon and the parentheses that carry a series marker, and the family rule needs both.
 *
 * Series markers are deliberately *not* stripped here. "The Two Towers" and "The Return of the
 * King" are different books; collapsing them into one entry would hide the fact that the reader
 * chose to continue, which is one of the strongest signals a book library holds.
 */
export function stripBookEditionMarkers(title: string): string {
  let working = title.trim();

  for (let pass = 0; pass < 3; pass += 1) {
    const before = working;
    for (const pattern of EDITION_MARKERS) {
      const stripped = working.replace(pattern, '');
      // Never reduce a title to nothing: a book literally called "Omnibus" would vanish.
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

/** One book, whatever edition of it was logged. */
export function normalizeBookIdentityKey(title: string): string {
  return slugifyTitle(stripBookEditionMarkers(title)) || slugifyTitle(title);
}

/**
 * One series, however many of its books were logged.
 *
 * Editions are already gone by the time this runs, so it only has to handle instalments: the
 * explicit series parentheticals above, then the recommender's franchise rule for numbered and
 * subtitled sequels. Titles that announce nothing stay in a family of their own, which is the safe
 * direction to fail in — under-collapsing costs a guard, over-collapsing invents a series.
 */
export function normalizeBookFamilyKey(title: string): string {
  const cleaned = stripBookEditionMarkers(title);

  // A named series wins outright: the publisher has already told us the grouping.
  const declared = extractBookSeriesName(cleaned);
  if (declared) {
    return slugifyTitle(declared) || normalizeBookIdentityKey(title);
  }

  let working = cleaned;
  for (let pass = 0; pass < 2; pass += 1) {
    const before = working;
    for (const pattern of TRAILING_INSTALMENT_MARKERS) {
      const stripped = working.replace(pattern, '');
      if (stripped.trim().length > 0) {
        working = stripped;
      }
    }
    if (working === before) {
      break;
    }
  }

  return extractFranchiseKey(working) || normalizeBookIdentityKey(title);
}
