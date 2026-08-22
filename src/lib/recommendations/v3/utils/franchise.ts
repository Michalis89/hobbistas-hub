/**
 * Franchise key extraction utilities.
 */

const ROMAN_NUMERALS = new Map<string, number>([
  ['i', 1], ['ii', 2], ['iii', 3], ['iv', 4], ['v', 5],
  ['vi', 6], ['vii', 7], ['viii', 8], ['ix', 9], ['x', 10],
  ['xi', 11], ['xii', 12], ['xiii', 13], ['xiv', 14], ['xv', 15],
  ['xvi', 16], ['xvii', 17], ['xviii', 18], ['xix', 19], ['xx', 20],
]);

const SEQUEL_STOPWORDS = new Set([
  'the', 'of', 'and', 'a', 'an', 'to', 'for', 'in', 'on',
]);

const EDITION_SUFFIXES = [
  /[:\-]\s*(remastered|remaster|remake|definitive edition|complete edition|ultimate edition|enhanced edition|gold edition|anniversary edition|director.?s cut|goty|game of the year)$/i,
  /\s+(remastered|remaster|remake|definitive|complete|ultimate|enhanced|deluxe|gold|anniversary|special)\s+edition$/i,
  /\s+hd\s+remaster(ed)?$/i,
  /\s*[-:]\s*(free\s+)?next[\-\s]?gen\s+update$/i,
];

const VARIANT_MARKERS = [
  /\bremaster(ed)?\b/i,
  /\bremake\b/i,
  /\bdefinitive\s+edition\b/i,
  /\bcomplete\s+edition\b/i,
  /\bultimate\s+edition\b/i,
  /\benhanced\s+edition\b/i,
  /\bdeluxe\s+edition\b/i,
  /\bgold\s+edition\b/i,
  /\banniversary\s+edition\b/i,
  /\bdirector.?s\s+cut\b/i,
  /\bgame\s+of\s+the\s+year\b/i,
  /\bgoty\b/i,
  /\bnext[\-\s]?gen\b/i,
  /\bfree\s+next[\-\s]?gen\s+update\b/i,
  /\bcomplete\s+collection\b/i,
  /\bcollector.?s\s+edition\b/i,
  /\bredux\b/i,
];

const SEASON_PATTERN = /\s+season\s+\d+$/i;
const PART_PATTERN = /[:\-\s]+part\s+(i{1,3}|iv|vi{0,3}|\d+)$/i;
const COLON_SUBTITLE_PATTERN = /\s*:\s+.+$/;

/**
 * Extract a stable franchise base key for grouping series members.
 */
export function extractFranchiseKey(title: string): string {
  let t = title.toLowerCase().trim();

  for (const pattern of EDITION_SUFFIXES) {
    t = t.replace(pattern, '');
  }

  t = t.replace(SEASON_PATTERN, '');
  t = t.replace(PART_PATTERN, '');
  t = t.replace(COLON_SUBTITLE_PATTERN, '');

  const tokens = t
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const lastToken = tokens[tokens.length - 1];
  if (lastToken && (ROMAN_NUMERALS.has(lastToken) || /^\d+$/.test(lastToken))) {
    tokens.pop();
    while (tokens.length > 0 && SEQUEL_STOPWORDS.has(tokens[tokens.length - 1])) {
      tokens.pop();
    }
  }

  const key = tokens
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return key || slugify(title);
}

/**
 * Extract the numeric position of a title within its franchise (1-based).
 */
export function extractSequenceNumber(title: string): number | null {
  const t = title.toLowerCase();

  const seasonMatch = t.match(/\bseason\s+(\d+)\b/);
  if (seasonMatch) {return parseInt(seasonMatch[1], 10);}

  const partMatch = t.match(/\bpart\s+(i{1,3}|iv|vi{0,3}|\d+)\b/);
  if (partMatch) {
    const val = partMatch[1];
    return ROMAN_NUMERALS.get(val) ?? parseInt(val, 10);
  }

  const tokens = t
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (last && ROMAN_NUMERALS.has(last)) {return ROMAN_NUMERALS.get(last)!;}

  if (last && /^\d+$/.test(last)) {return parseInt(last, 10);}

  const colonMatch = title.match(/:\s*\w+.*?\b(\d+)\b/);
  if (colonMatch) {return parseInt(colonMatch[1], 10);}

  return null;
}

export type FranchiseMembership = {
  franchiseKey: string;
  maxCompletedNumber: number;
  hasCurrent: boolean;
};

export function buildFranchiseMembership(
  history: Array<{ title: string; status: string }>,
): Map<string, FranchiseMembership> {
  const map = new Map<string, FranchiseMembership>();

  for (const entry of history) {
    const key = extractFranchiseKey(entry.title);
    const seqNum = extractSequenceNumber(entry.title) ?? 1;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        franchiseKey: key,
        maxCompletedNumber: entry.status === 'completed' ? seqNum : 0,
        hasCurrent: entry.status === 'current',
      });
    } else {
      if (entry.status === 'completed' && seqNum > existing.maxCompletedNumber) {
        existing.maxCompletedNumber = seqNum;
      }
      if (entry.status === 'current') {
        existing.hasCurrent = true;
      }
    }
  }

  return map;
}

/**
 * Extract a normalized base title by stripping variant markers.
 */
export function extractBaseTitle(title: string): string {
  let t = title.toLowerCase().trim();

  for (const pattern of EDITION_SUFFIXES) {
    t = t.replace(pattern, '');
  }

  t = t.replace(
    /\s*[-:]\s*(free\s+next[\-\s]?gen\s+update|next[\-\s]?gen\s+update|patch\s+\d[.\d]*|hotfix)$/i,
    '',
  );

  for (const pattern of VARIANT_MARKERS) {
    t = t.replace(pattern, '');
  }

  return t
    .replace(/:/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-:]+$/g, '')
    .trim();
}

/**
 * True when the title looks like a remaster/remake/edition/update variant.
 */
export function isEditionVariant(title: string): boolean {
  return VARIANT_MARKERS.some(pattern => pattern.test(title)) ||
    EDITION_SUFFIXES.some(pattern => pattern.test(title));
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
