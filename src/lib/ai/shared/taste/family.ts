/**
 * Grouping titles into families.
 *
 * Two mechanisms, applied in that order, because neither is sufficient alone.
 *
 * *Pattern stripping* handles the cases a title announces: a season number, a part, a colon
 * subtitle, an edition marker. `extractFranchiseKey` in the recommender already does this and is
 * the codebase's one franchise rule, so the categories here build on it rather than beside it.
 *
 * *Prefix merging* handles the cases a title only implies. "The Lord of the Rings" and "The Lord of
 * the Rings: The Two Towers" reduce to the same key by stripping; "Vinland Saga" and "Vinland Saga:
 * Slave Arc" do not always, and two works of one series with no shared marker never do. Merging a
 * key into a shorter key that is a prefix of it catches those — but only when the shorter key is
 * itself present in this user's library, which is what keeps unrelated works apart.
 */

/**
 * Shortest key that may claim longer ones as family members.
 *
 * Long enough that a common word cannot swallow a library: a two-character key would merge
 * everything beginning with those letters. Twelve characters is roughly two real words.
 */
export const MIN_PREFIX_MERGE_LENGTH = 12;

/**
 * Maps every key to the shortest prefix in the same set that claims it.
 *
 * The prefix must be followed by a separator in the longer key, so `star-wars` claims
 * `star-wars-rogue-one` but never `star-warship`. Merging happens only between keys that both
 * exist in the supplied set, so a family root absent from the library cannot invent a grouping.
 */
export function buildFamilyPrefixAliases(
  keys: Iterable<string>,
  minPrefixLength: number = MIN_PREFIX_MERGE_LENGTH,
): Map<string, string> {
  // Shortest first, so the first prefix found is the broadest family.
  const unique = Array.from(new Set(keys)).sort(
    (a, b) => a.length - b.length || a.localeCompare(b),
  );
  const aliases = new Map<string, string>();

  for (const key of unique) {
    let canonical = key;
    for (const candidate of unique) {
      if (candidate === key) {
        break;
      }
      if (candidate.length < minPrefixLength) {
        continue;
      }
      if (key.startsWith(`${candidate}-`)) {
        // Follow the candidate's own alias, so a chain resolves to one root in a single pass.
        canonical = aliases.get(candidate) ?? candidate;
        break;
      }
    }
    aliases.set(key, canonical);
  }

  return aliases;
}

/** Lowercase, punctuation-free, hyphen-joined. The shape every key in this layer takes. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Strips a trailing year, in parentheses or bare.
 *
 * TMDB and Google Books both disambiguate remakes and reissues this way, and a year is never part
 * of what a work *is* — "Dune (2021)" and "Dune" are the same title for taste purposes even though
 * they are different rows.
 */
export function stripTrailingYear(title: string): string {
  return title.replace(/\s*[([]?\b(19|20)\d{2}\b[)\]]?\s*$/, '').trim() || title.trim();
}
