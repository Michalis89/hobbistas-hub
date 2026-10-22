/**
 * ISBN helpers shared by the book providers.
 *
 * Every provider spells ISBNs differently (hyphens, ISBN-10, ISBN-13, an
 * array of every edition's ISBN), so they are all reduced to bare ISBN-13
 * digits before being compared or stored in media_items.isbn_13.
 */

const stripIsbn = (value: string) => value.replace(/[^0-9Xx]/g, '').toUpperCase();

const isbn13CheckDigit = (first12: string) => {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
};

const isValidIsbn10 = (digits: string) => {
  if (!/^\d{9}[\dX]$/.test(digits)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const char = digits[i];
    const value = char === 'X' ? 10 : Number(char);
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
};

const isValidIsbn13 = (digits: string) =>
  /^97[89]\d{10}$/.test(digits) && isbn13CheckDigit(digits.slice(0, 12)) === digits[12];

/**
 * Returns the ISBN-13 digits for any valid ISBN-10 or ISBN-13 input, or null.
 */
export function toIsbn13(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const digits = stripIsbn(value);
  if (digits.length === 13) {
    return isValidIsbn13(digits) ? digits : null;
  }
  if (digits.length === 10 && isValidIsbn10(digits)) {
    const first12 = `978${digits.slice(0, 9)}`;
    return `${first12}${isbn13CheckDigit(first12)}`;
  }
  return null;
}

/**
 * Greek publishers are registered under the 960 and 618 group prefixes.
 * Only these are worth sending to the National Library of Greece.
 */
export function isGreekIsbn(isbn13: string | null | undefined): boolean {
  return !!isbn13 && (isbn13.startsWith('978960') || isbn13.startsWith('978618'));
}

/** English-language registration groups: 978-0, 978-1 and 979-8. */
const isEnglishIsbn = (isbn13: string) => /^97(8[01]|98)/.test(isbn13);

/**
 * A book can carry several ISBNs (editions, volumes of a set) and the stored
 * isbn_13 can only be one. A Greek edition is the most useful (the National
 * Library of Greece has it, with its cover), then an English one, which is
 * the edition most likely to also be on Google Books.
 */
export const pickEditionIsbn = (isbns: readonly string[]) =>
  isbns.find(isGreekIsbn) ?? isbns.find(isEnglishIsbn) ?? isbns[0] ?? null;

/**
 * True when a search query is an ISBN rather than a title, so providers can
 * be asked for an exact ISBN match instead of a full-text search.
 */
export function parseIsbnQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!/^[\d\s-]+[\dXx]$/.test(trimmed)) {
    return null;
  }
  return toIsbn13(trimmed);
}
