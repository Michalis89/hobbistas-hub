/**
 * Greek -> Latin transliteration for slug generation.
 *
 * Accented characters are handled by NFD decomposition before this map is
 * applied, so only base letters need entries here.
 */
const GREEK_TO_LATIN: Record<string, string> = {
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
};

const GREEK_RANGE = /[\u0370-\u03ff\u1f00-\u1fff]/g;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Builds a URL-safe slug from arbitrary text.
 *
 * Unlike a naive `[^a-z0-9]` filter, Greek titles survive: they are
 * transliterated rather than stripped, so "Ο νέος Kratos" becomes
 * "o-neos-kratos" instead of "kratos".
 */
export function slugify(value: string): string {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(GREEK_RANGE, char => GREEK_TO_LATIN[char] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Trims stray leading/trailing dashes from slugs already persisted in the
 * database. Kept separate from {@link slugify} because it must not alter
 * legacy slugs beyond the dashes that older slug generation left behind.
 */
export function normalizeSlug(value: string): string {
  const trimmed = value.replace(/^-+/, '').replace(/-+$/, '');
  return trimmed || value;
}
