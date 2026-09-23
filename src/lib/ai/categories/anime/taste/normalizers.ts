/**
 * Anime title normalisation: identity, franchise family, and derivative classification.
 *
 * Written for anime rather than reusing `v3/utils/franchise`, and the difference is deliberate.
 * The generic helper strips *every* colon subtitle, which is right for games (`Halo: Reach` is a
 * Halo) and wrong for anime, where the colon is how unrelated works under one brand are named.
 * Stripping it blindly collapses `Gundam: Iron-Blooded Orphans` and `Gundam: Witch from Mercury`
 * into one "Gundam" — two shows with nothing in common beyond the mecha licence — and a taste
 * profile built on that would report a Gundam pillar the viewer never expressed.
 *
 * So the rule here is narrower: a subtitle is stripped **only when the subtitle itself is a
 * continuation marker** (a season, a part, a cour, a recap, a movie). Anything else is treated as
 * a distinct work.
 */

/**
 * Subtitle-position markers meaning "another instalment of the same story".
 *
 * Matched against the text after a colon/dash, or as a trailing phrase.
 */
const CONTINUATION_MARKERS: RegExp[] = [
  /^(the\s+)?final\s+season(\s+part\s+\w+)?$/i,
  /^(the\s+)?final\s+chapters?(\s+part\s+\w+)?$/i,
  /^season\s+\w+$/i,
  /^\d+(st|nd|rd|th)\s+season$/i,
  /^(second|third|fourth|fifth)\s+season$/i,
  /^part\s+\w+$/i,
  /^cour\s+\w+$/i,
  /^(the\s+)?movie(\s+\w+)?$/i,
  /^recap$/i,
  /^(the\s+)?complete\s+series$/i,
];

/** Trailing instalment markers that appear without a colon: "Attack on Titan Season 2". */
const TRAILING_SEASON_PATTERNS: RegExp[] = [
  /\s+(the\s+)?final\s+season(\s+part\s+\w+)?$/i,
  /\s+season\s+\w+$/i,
  /\s+\d+(st|nd|rd|th)\s+season$/i,
  /\s+(second|third|fourth|fifth)\s+season$/i,
  /\s+part\s+(\d+|i{1,3}|iv|v)$/i,
  /\s+cour\s+\w+$/i,
  /\s+s\d{1,2}$/i,
];

/**
 * Formats and title markers whose content is derivative of a parent series.
 *
 * A recap episode restates a season the viewer already watched; a music video is not storytelling
 * at all. Counting either as independent taste evidence inflates a franchise's mass with entries
 * that carry no new information about what the viewer likes.
 */
const DERIVATIVE_TITLE_MARKERS: RegExp[] = [
  /\brecap\b/i,
  /\bsummary\b/i,
  /\bcompilation\b/i,
  /\bspecials?\b/i,
  /\bova\b/i,
  /\bona\b/i,
  /\bpicture\s+drama\b/i,
];

/** MAL `media_type` values, lowercased. `tv` and `movie` are primary; the rest are derivative. */
const DERIVATIVE_FORMATS = new Set(['ova', 'ona', 'special', 'music', 'cm', 'pv']);

/**
 * Formats that are not storytelling and never enter the evidence document at all.
 *
 * A music video in a library says something about a band, not about narrative taste.
 */
const NON_NARRATIVE_FORMATS = new Set(['music', 'cm', 'pv']);

/**
 * Trailing derivative markers that name a side entry of a parent series.
 *
 * These have to be stripped for the *franchise* key even though they are not continuations in the
 * season sense: "Clannad Recap" and "Clannad OVA" belong to the Clannad family, and leaving them
 * as families of their own would let a series contribute an extra entry per side product — which
 * is the franchise inflation the collapse step exists to stop.
 */
const TRAILING_DERIVATIVE_PATTERNS: RegExp[] = [
  /\s*[:–—-]?\s*\b(recap|summary|compilation|specials?|ova|ona|picture\s+drama)\b\s*$/i,
  /\s*[:–—-]?\s*\bthe\s+movie\b\s*$/i,
];

/** Trailing bare instalment numbers: "Psycho-Pass 2", "Mushoku Tensei II". */
const TRAILING_NUMERAL = /\s+(\d{1,2}|i{1,3}|iv|v|vi{0,3}|ix|x)$/i;

/** "Code Geass R2" style season markers. */
const TRAILING_R_NUMBER = /\s+r\d$/i;

/**
 * Identity of one work.
 *
 * Distinct seasons keep distinct identities — season 2 of a series is a real, separate viewing
 * decision. Collapsing across seasons happens one level up, at the franchise, which is where
 * "do not let one series dominate" belongs.
 */
export function normalizeAnimeIdentityKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Bracketed qualifiers MAL and AniList append: "(TV)", "(2019)", "(Dub)".
    .replace(/\((tv|dub|sub|uncensored|\d{4})\)/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-');
}

/**
 * Family key grouping every instalment of one series.
 *
 * Strips trailing season/part/cour markers and continuation subtitles, then bare instalment
 * numerals. A subtitle that is not a continuation marker is kept, which is what stops unrelated
 * works under a shared brand from merging.
 */
export function normalizeAnimeFranchiseKey(title: string): string {
  let working = title.trim();

  // Repeatedly peel continuation markers: "Attack on Titan: The Final Season Part 2" needs two.
  for (let pass = 0; pass < 3; pass += 1) {
    const before = working;

    for (const pattern of TRAILING_SEASON_PATTERNS) {
      working = working.replace(pattern, '');
    }

    for (const pattern of TRAILING_DERIVATIVE_PATTERNS) {
      // Never reduce a title to nothing: "Special" alone would otherwise vanish.
      const stripped = working.replace(pattern, '');
      if (stripped.trim().length > 0) {
        working = stripped;
      }
    }

    const separator = working.match(/^(.*?)[\s]*[:–—-]\s+(.+)$/);
    if (separator) {
      const [, head, tail] = separator;
      if (head.trim() && CONTINUATION_MARKERS.some(marker => marker.test(tail.trim()))) {
        working = head;
      }
    }

    working = working.replace(TRAILING_R_NUMBER, '');

    if (working === before) {
      break;
    }
  }

  // Bare trailing numerals last, so "Season 2" has already gone and this only catches
  // "Psycho-Pass 2" style naming.
  const withoutNumeral = working.replace(TRAILING_NUMERAL, '');
  // Never reduce a title to nothing: "86" and "5" are real titles whose whole name is a numeral.
  if (withoutNumeral.trim().length > 0) {
    working = withoutNumeral;
  }

  const key = normalizeAnimeIdentityKey(working);
  return key || normalizeAnimeIdentityKey(title);
}

/**
 * Whether an entry is derivative of a parent series rather than a work in its own right.
 *
 * Format is trusted over the title when present: MAL's `media_type` is structured data, while a
 * title match is a guess. A movie is deliberately *not* derivative — an anime film is usually a
 * full work, and many are franchise continuations that carry real taste signal.
 */
export function isDerivativeAnimeEntry(title: string, format: string | null): boolean {
  const normalizedFormat = format?.trim().toLowerCase() ?? '';
  if (normalizedFormat) {
    return DERIVATIVE_FORMATS.has(normalizedFormat);
  }
  return DERIVATIVE_TITLE_MARKERS.some(marker => marker.test(title));
}

/**
 * Shortest franchise key a title may be absorbed into by prefix matching.
 *
 * Guards against a very short key acting as a magnet: a library holding a title normalising to
 * "one" should not swallow "one-piece" and "one-punch-man".
 */
const MIN_PREFIX_MERGE_LENGTH = 4;

/**
 * Merges franchise keys that are word-boundary prefixes of one another.
 *
 * The regex rules above only recognise instalments that *say* they are instalments — "Season 2",
 * "Part 3", "Final Season". Anime routinely does not: Demon Slayer names its seasons
 * "Entertainment District Arc" and "Swordsmith Village Arc", which are indistinguishable from
 * unrelated works by pattern alone. Against a real library those six Demon Slayer entries became
 * six independent families, which is precisely the franchise inflation collapse exists to stop.
 *
 * Resolving it against the library rather than against a pattern is what makes it safe. A title is
 * absorbed only when another title the user actually owns is a prefix of it at a word boundary, so
 * "Demon Slayer: Kimetsu no Yaiba" claims its arcs, while "Gundam: Iron-Blooded Orphans" and
 * "Gundam: The Witch from Mercury" stay apart — neither is a prefix of the other, and a bare
 * "Gundam" is not in the library to merge them.
 *
 * Returns key → canonical key, mapping every key to the shortest prefix that claims it.
 */
export function buildFranchisePrefixAliases(keys: Iterable<string>): Map<string, string> {
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
      if (candidate.length < MIN_PREFIX_MERGE_LENGTH) {
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

/** Whether the entry is not storytelling at all and must be excluded from evidence entirely. */
export function isNonNarrativeAnimeEntry(format: string | null): boolean {
  const normalizedFormat = format?.trim().toLowerCase() ?? '';
  return normalizedFormat.length > 0 && NON_NARRATIVE_FORMATS.has(normalizedFormat);
}
