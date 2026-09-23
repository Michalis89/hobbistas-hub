/**
 * Manga title normalisation: work identity, family identity, and derivative classification.
 *
 * Manga needs a level of collapse that anime does not, and the difference drives this whole
 * module. Anime has one question — is this another instalment of the same series? — answered at
 * the franchise level. Manga has two, and conflating them loses information both ways:
 *
 *   *Is this literally the same work republished?* "Berserk" and "Berserk: Deluxe Edition" are one
 *   story in two bindings. A reader who owns both has read one manga. This collapses at the
 *   **identity** level: they are the same entry, not two entries in one family.
 *
 *   *Is this a different work in the same series?* "JoJo's Bizarre Adventure Part 4" is not Part 3
 *   republished; it is a separate reading decision with its own cast and premise. This collapses
 *   at the **family** level only, exactly as anime seasons do.
 *
 * Handling editions at the family level instead would leave a reader's two bindings of Berserk
 * looking like a two-instalment franchise, inflating its mass. Handling sequels at the identity
 * level would erase the fact that someone chose to keep going.
 *
 * As with anime, a subtitle is stripped only when the subtitle *is* a continuation or edition
 * marker. Anything else is kept, which is what stops unrelated works sharing a brand from
 * merging: "Fate/stay night" and "Fate/Zero" are not one manga, and neither are the dozen
 * unrelated series that share a Gundam or a Type-Moon licence.
 */

/**
 * Re-release and binding markers. The same story in different packaging.
 *
 * Stripped for the identity key, so an omnibus and its original collapse into one entry rather
 * than counting twice. Includes the Japanese binding vocabulary because MAL frequently romanises
 * rather than translates it.
 */
const EDITION_MARKERS: RegExp[] = [
  /^(the\s+)?(deluxe|perfect|ultimate|complete|collector'?s|definitive|master|big|new)\s+edition$/i,
  /^(colou?red|full\s+colou?r|digital\s+colou?red)(\s+(edition|comics|version))?$/i,
  /^omnibus(\s+edition)?$/i,
  /^(kanzenban|bunkoban|shinsouban|wideban|aizouban|soushuuhen|tankoubon|tankobon)$/i,
  /^(remastered|remaster|reprint|re-?release|anniversary(\s+edition)?)$/i,
  /^(official\s+)?translation$/i,
];

/** Trailing edition markers that appear without a separator: "Berserk Deluxe Edition". */
const TRAILING_EDITION_PATTERNS: RegExp[] = [
  /\s*[:–—-]?\s*\b(the\s+)?(deluxe|perfect|ultimate|complete|collector'?s|definitive|master)\s+edition\b\s*$/i,
  /\s*[:–—-]?\s*\b(colou?red|full\s+colou?r|digital\s+colou?red)(\s+(edition|comics|version))?\b\s*$/i,
  /\s*[:–—-]?\s*\bomnibus(\s+edition)?\b\s*$/i,
  /\s*[:–—-]?\s*\b(kanzenban|bunkoban|shinsouban|wideban|aizouban|soushuuhen)\b\s*$/i,
  /\s*[:–—-]?\s*\b(remastered|remaster|reprint|re-?release)\b\s*$/i,
];

/**
 * Subtitle-position markers meaning "a further instalment of the same series".
 *
 * Stripped for the family key only. Manga names its continuations less regularly than anime names
 * its seasons — the Japanese prefixes (`Shin`, `Zoku`, `Shinsou`) and the English suffixes
 * (`Returns`, `Next`, `Second Stage`) both appear — so both shapes are recognised.
 */
const CONTINUATION_MARKERS: RegExp[] = [
  /^part\s+\w+$/i,
  /^(the\s+)?final\s+(arc|chapter|part|saga)(\s+\w+)?$/i,
  /^(second|third|fourth|fifth)\s+(stage|season|part|series)$/i,
  /^season\s+\w+$/i,
  /^\d+(st|nd|rd|th)\s+(stage|season|series)$/i,
  /^(returns|next|kai|reloaded|continuation|the\s+sequel)$/i,
  /^(zoku|shin|shinsou)$/i,
];

/** Trailing continuation markers without a separator: "Vagabond Part 2", "Slam Dunk Returns". */
const TRAILING_CONTINUATION_PATTERNS: RegExp[] = [
  /\s+part\s+(\d+|i{1,3}|iv|v|vi{0,3}|ix|x)$/i,
  /\s+(the\s+)?final\s+(arc|chapter|part|saga)$/i,
  /\s+(second|third|fourth|fifth)\s+(stage|season|part|series)$/i,
  /\s+season\s+\w+$/i,
  /\s+\d+(st|nd|rd|th)\s+(stage|season|series)$/i,
  /\s+(returns|kai|reloaded)$/i,
];

/**
 * Derivative markers: side stories, spin-offs, gag versions and anthologies.
 *
 * Stripped for the family key — a gaiden belongs to its parent's family — and separately used to
 * damp the entry's weight. The two uses are distinct and both matter. Leaving a gaiden as its own
 * family would let one series contribute an extra independent endorsement per side product;
 * counting it at full weight would let a four-panel gag spin-off argue that a reader of a bleak
 * historical drama enjoys comedy.
 */
const DERIVATIVE_TITLE_MARKERS: RegExp[] = [
  /\bgaiden\b/i,
  /\bbangaihen\b/i,
  /\bside\s+stor(y|ies)\b/i,
  /\bspin[\s-]?off\b/i,
  /\banthology\b/i,
  /\b(yon|4)[\s-]?koma\b/i,
  /\bdoujinshi\b/i,
  /\bextra\s+chapters?\b/i,
  /\bshort\s+stories\b/i,
  /\bspecial\s+edition\s+stories\b/i,
  /\bchibi\b/i,
];

/** Trailing derivative markers, stripped so a side story joins its parent's family. */
const TRAILING_DERIVATIVE_PATTERNS: RegExp[] = [
  /\s*[:–—-]?\s*\b(gaiden|bangaihen)\b\s*$/i,
  /\s*[:–—-]?\s*\bside\s+stor(y|ies)\b\s*$/i,
  /\s*[:–—-]?\s*\bspin[\s-]?off\b\s*$/i,
  /\s*[:–—-]?\s*\banthology\b\s*$/i,
  /\s*[:–—-]?\s*\b(yon|4)[\s-]?koma\b\s*$/i,
  /\s*[:–—-]?\s*\bextra\s+chapters?\b\s*$/i,
];

/**
 * Formats whose entries are derivative of a larger body of work.
 *
 * `one_shot` is here for a reason worth stating: a one-shot is a complete work, but completing one
 * is a twenty-minute commitment against the dozens of hours a serialised manga asks for. Counting
 * the two as equal evidence would let a reader clear the evidence threshold on ten one-shots
 * while having read almost nothing. `doujinshi` is a fan work and carries a different kind of
 * signal from a commercially serialised series.
 */
const DERIVATIVE_FORMATS = new Set(['one_shot', 'one-shot', 'oneshot', 'doujinshi']);

/** Trailing bare instalment numbers: "Berserk 2", "Gantz II". */
const TRAILING_NUMERAL = /\s+(\d{1,2}|i{1,3}|iv|v|vi{0,3}|ix|x)$/i;

/** Japanese continuation prefixes: "Shin Getter Robo", "Zoku Owarimonogatari". */
const LEADING_CONTINUATION_PREFIX = /^(shin|zoku|shinsou)\s+/i;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Bracketed qualifiers MAL appends: "(2019)", "(Digital)", "(Official)".
    .replace(/\((digital|official|dub|sub|colou?red|\d{4})\)/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-');
}

/**
 * Identity of one work, with editions of it collapsed onto the same key.
 *
 * Sequels and parts keep distinct identities — reading Part 4 after Part 3 is a real, separate
 * decision and the profile should be able to see it. Only re-releases of the *same* story merge
 * here, which is the level at which they actually are the same thing.
 */
export function normalizeMangaIdentityKey(title: string): string {
  let working = title.trim();

  for (let pass = 0; pass < 3; pass += 1) {
    const before = working;

    for (const pattern of TRAILING_EDITION_PATTERNS) {
      // Never reduce a title to nothing: "Omnibus" alone would otherwise vanish.
      const stripped = working.replace(pattern, '');
      if (stripped.trim().length > 0) {
        working = stripped;
      }
    }

    const separator = working.match(/^(.*?)[\s]*[:–—-]\s+(.+)$/);
    if (separator) {
      const [, head, tail] = separator;
      if (head.trim() && EDITION_MARKERS.some(marker => marker.test(tail.trim()))) {
        working = head;
      }
    }

    if (working === before) {
      break;
    }
  }

  return slugify(working) || slugify(title);
}

/**
 * Family key grouping every work of one series: sequels, numbered parts, and side stories.
 *
 * Built on top of the identity key, so editions are already gone by the time continuation markers
 * are considered. A subtitle that is neither an edition nor a continuation marker is kept, which
 * is what keeps unrelated works under a shared licence apart.
 */
export function normalizeMangaFamilyKey(title: string): string {
  let working = title.trim();

  // Peel repeatedly: "JoJo's Bizarre Adventure Part 5: Golden Wind" needs more than one pass.
  for (let pass = 0; pass < 4; pass += 1) {
    const before = working;

    for (const pattern of TRAILING_EDITION_PATTERNS) {
      const stripped = working.replace(pattern, '');
      if (stripped.trim().length > 0) {
        working = stripped;
      }
    }

    for (const pattern of TRAILING_CONTINUATION_PATTERNS) {
      const stripped = working.replace(pattern, '');
      if (stripped.trim().length > 0) {
        working = stripped;
      }
    }

    for (const pattern of TRAILING_DERIVATIVE_PATTERNS) {
      const stripped = working.replace(pattern, '');
      if (stripped.trim().length > 0) {
        working = stripped;
      }
    }

    const separator = working.match(/^(.*?)[\s]*[:–—-]\s+(.+)$/);
    if (separator) {
      const [, head, tail] = separator;
      const subtitle = tail.trim();
      const isInstalment =
        CONTINUATION_MARKERS.some(marker => marker.test(subtitle)) ||
        EDITION_MARKERS.some(marker => marker.test(subtitle)) ||
        // "...: Part 5: Golden Wind" — an instalment marker leading a descriptive subtitle.
        /^part\s+(\d+|i{1,3}|iv|v|vi{0,3}|ix|x)\b/i.test(subtitle) ||
        // "JoJo's Bizarre Adventure Part 5: Golden Wind" — the marker sits in the head instead,
        // and the subtitle names the arc. Dropping the subtitle leaves a head that the trailing
        // patterns strip on the next pass, so the two shapes converge on one family key.
        TRAILING_CONTINUATION_PATTERNS.some(pattern => pattern.test(head));
      if (head.trim() && isInstalment) {
        working = head;
      }
    }

    const withoutPrefix = working.replace(LEADING_CONTINUATION_PREFIX, '');
    if (withoutPrefix.trim().length > 0) {
      working = withoutPrefix;
    }

    if (working === before) {
      break;
    }
  }

  // Bare trailing numerals last, so "Part 2" has already gone and this only catches
  // "Gantz 2" style naming.
  const withoutNumeral = working.replace(TRAILING_NUMERAL, '');
  // Never reduce a title to nothing: "20th Century Boys" ends in a word, but "5" is a real title.
  if (withoutNumeral.trim().length > 0) {
    working = withoutNumeral;
  }

  return slugify(working) || normalizeMangaIdentityKey(title);
}

/**
 * Whether an entry is derivative of a larger work rather than a work in its own right.
 *
 * Format is trusted over the title when it says so: MAL's `media_type` is structured data and a
 * title match is a guess. A `novel` or `light_novel` is deliberately *not* derivative — reading
 * the light novel is a full and often longer commitment than reading the manga, and treating it
 * as a footnote would discard the strongest evidence some libraries contain.
 */
export function isDerivativeMangaEntry(title: string, format: string | null): boolean {
  const normalizedFormat = format?.trim().toLowerCase() ?? '';
  if (normalizedFormat && DERIVATIVE_FORMATS.has(normalizedFormat)) {
    return true;
  }
  return DERIVATIVE_TITLE_MARKERS.some(marker => marker.test(title));
}

/**
 * Shortest family key a title may be absorbed into by prefix matching.
 *
 * Guards against a very short key acting as a magnet: a library holding a title normalising to
 * "ao" should not swallow "aoashi" — and the hyphen requirement below means it would not, but the
 * length floor makes the intent explicit and covers the pathological cases.
 */
const MIN_PREFIX_MERGE_LENGTH = 5;

/**
 * Merges family keys that are word-boundary prefixes of one another.
 *
 * The patterns above only recognise instalments that *announce* themselves. Manga frequently does
 * not: "Vinland Saga" and "Vinland Saga: Farmland Saga" are one work's two publication arcs, and
 * nothing in the second title says "part two".
 *
 * Resolving this against the library rather than against a pattern is what makes it safe. A title
 * is absorbed only when another title the reader actually owns is a prefix of it at a word
 * boundary. So a reader holding "Vinland Saga" claims its arcs, while "Fate/stay night" and
 * "Fate/Zero" stay apart — neither is a prefix of the other, and a bare "Fate" is not in the
 * library to merge them.
 *
 * Returns key → canonical key, mapping every key to the shortest prefix that claims it.
 */
export function buildMangaFamilyPrefixAliases(keys: Iterable<string>): Map<string, string> {
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

/**
 * Demographic tokens, which describe a magazine's readership rather than a reader's taste.
 *
 * Kept here rather than in the validator because both the evidence layer and the validator need
 * the same list, and a pillar named after one of these is the single most likely way a manga
 * profile degenerates into restating what MAL already prints on the cover.
 */
export const MANGA_DEMOGRAPHIC_TOKENS = new Set([
  'shounen',
  'shonen',
  'shoujo',
  'shojo',
  'seinen',
  'josei',
  'kodomomuke',
  'kodomo',
]);

/**
 * Filler words that carry no meaning in a pillar name.
 *
 * Stripped before the demographic test, so "Seinen manga" and "Shounen series" are recognised as
 * the bare demographic labels they are.
 */
const PILLAR_NAME_FILLER = new Set([
  'manga',
  'manhwa',
  'manhua',
  'comics',
  'comic',
  'series',
  'stories',
  'story',
  'titles',
  'works',
  'fiction',
  'reading',
  'reads',
  'and',
  'or',
  'the',
  'a',
  'of',
]);

/**
 * Whether a label says nothing except which demographic bracket its titles were published for.
 *
 * "Seinen", "Shounen manga" and "Shoujo and Josei stories" are all this. "Seinen psychological
 * tension" is not — it carries a real observation and merely happens to mention a bracket, which
 * is allowed. A demographic may be evidence; it may not be the whole claim.
 */
export function isDemographicOnlyLabel(label: string): boolean {
  const tokens = label
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter(token => !PILLAR_NAME_FILLER.has(token));

  if (tokens.length === 0) {
    return false;
  }
  return tokens.every(token => MANGA_DEMOGRAPHIC_TOKENS.has(token));
}
