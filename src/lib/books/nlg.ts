import { EXTERNAL_API_REVALIDATE_SECONDS } from '@/lib/constants/cache';
import { cachedExternalFetch } from '@/lib/api-cache/external';
import { SITE_NAME, SITE_URL } from '@/config/site';
import { subjectsToGenres } from './genres';
import { pickEditionIsbn, toIsbn13 } from './isbn';
import { logProviderError } from './logProviderError';
import { fetchNlgText } from './nlgTransport';
import type { BookCandidate } from './types';

/**
 * National Library of Greece (Εθνική Βιβλιοθήκη της Ελλάδος) catalogue.
 *
 * Greek publishers must deposit every book with the library, so its catalogue
 * is the most complete record of Greek editions: Greek title, author,
 * publisher, translator, pages, ISBN. Google Books and Open Library have few
 * of these. It has no descriptions; covers come from the library's own cover
 * service by ISBN.
 *
 * The catalogue runs Koha, whose OPAC publishes machine-readable search
 * (OpenSearch RSS) and record export (MARCXML). No key or account needed.
 * It is a public service: it is only asked about Greek queries, and every
 * answer goes through the 6-hour external cache.
 */

const CATALOGUE_BASE = 'https://catalogue.nlg.gr/cgi-bin/koha';
const COVERS_BASE = 'https://covers.nlg.gr/';

/**
 * Formats that are not books: films, recordings, periodicals, maps.
 * "χάρτης" (map) is matched as a whole word: "χαρτόδετο" (paperback) starts
 * with the same letters and is on most book records.
 */
const NON_BOOK_PATTERN =
  /βιντεοδ[ιί]σκ|\bDVD\b|\bCD\b|ηχητικ|δ[ιί]σκος|τε[υύ]χη|χ[αά]ρτ(?:ης|ες|ων|ών)(?!\p{L})/iu;

const nlgHeaders = () => ({
  'User-Agent': `${SITE_NAME}/1.0 (+${SITE_URL})`,
  Accept: 'application/xml, text/xml',
});

export const nlgCoverUrl = (isbn: string, size: 'small' | 'large') =>
  `${COVERS_BASE}?isbn=${encodeURIComponent(isbn)}&size=${size}`;

/** True when a query contains Greek letters, i.e. is worth sending to NLG. */
export const hasGreekLetters = (value: string) => /\p{Script=Greek}/u.test(value);

const decodeXml = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** MARC punctuation ends fields with " /", " :", " ;", "," or "." */
const stripMarcPunctuation = (value: string) => collapse(value).replace(/[\s/:;,.=]+$/, '');

const firstTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1]) : null;
};

/** "Tolkien, J. R. R., 1892-1973" -> "J. R. R. Tolkien" */
export function invertName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  // Drop life dates and trailing MARC punctuation, but keep the full stop
  // of a trailing initial ("J. R. R.").
  const cleaned = collapse(value.replace(/,?\s*\d{4}-(\d{4})?\.?$/, ''))
    .replace(/[\s/:;,=]+$/, '')
    .replace(/\.{2,}$/, '.')
    .replace(/(\p{Ll}{2,})\.$/u, '$1');
  const parts = cleaned.split(/,\s*/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  return cleaned || null;
}

const parseIsbns = (value: string | null | undefined) =>
  Array.from(
    new Set(
      (value ?? '')
        .split(/[|,;\s]+/)
        .map(toIsbn13)
        .filter((isbn): isbn is string => !!isbn),
    ),
  );

/** "Ο άρχοντας των δαχτυλιδιών : Οι δύο πύργοι /" -> title + subtitle */
const splitTitle = (raw: string) => {
  const value = stripMarcPunctuation(raw).split(/\s+=\s+/)[0];
  const [title, ...rest] = value.split(/\s+:\s+/);
  return {
    title: stripMarcPunctuation(title ?? ''),
    subtitle: rest.length > 0 ? stripMarcPunctuation(rest.join(' : ')) : null,
  };
};

const toBiblionumber = (link: string | null) => {
  const match = link?.match(/biblionumber=(\d+)/);
  return match ? Number(match[1]) : null;
};

/**
 * Parses one OpenSearch RSS <item>. The description is Koha's HTML summary:
 * "By Fisher, Jude." on one line, then "Αθήνα : Αίολος, 2002", then the
 * physical description ("63,[8]σ."). It is parsed leniently: anything that
 * does not match is just left empty.
 */
export function parseNlgRssItem(item: string): BookCandidate | null {
  const nlgId = toBiblionumber(firstTag(item, 'link'));
  const rawTitle = firstTag(item, 'title');
  if (!nlgId || !rawTitle) {
    return null;
  }
  const { title, subtitle } = splitTitle(rawTitle);
  if (!title) {
    return null;
  }

  const description = firstTag(item, 'description') ?? '';
  if (NON_BOOK_PATTERN.test(description)) {
    return null;
  }
  const text = description.replace(/<[^>]+>/g, '\n');
  const author = text.match(/By\s+([^\n]+)/)?.[1];
  const imprint = text.match(/^\s*([^\n]*\S\s*:\s*[^\n]*?\b(1[5-9]\d\d|20\d\d)\b)/m);
  const publisher = imprint?.[1]
    .split(/\s*:\s*/)
    .slice(1)
    .join(' : ')
    .replace(/,?\s*c?\d{4}.*$/, '');
  const pages = text.match(/(\d+)\s*(?:,\s*\[\d+\])?\s*σ\./)?.[1];

  const isbns = parseIsbns(firstTag(item, 'dc:identifier')?.replace(/^ISBN:/, ''));
  const isbn13 = pickEditionIsbn(isbns);
  const authorName = invertName(author);

  return {
    googleBooksId: null,
    openLibraryId: null,
    nlgId,
    hardcoverId: null,
    sources: ['nlg'],
    isbn13,
    isbns,
    title,
    subtitle,
    authors: authorName ? [authorName] : [],
    categories: [],
    description: null,
    pageCount: pages ? Number(pages) : null,
    publishedDate: imprint?.[2] ?? null,
    publisher: publisher ? stripMarcPunctuation(publisher.replace(/^\[|\]$/g, '')) || null : null,
    popularity: null,
    coverLarge: isbn13 ? nlgCoverUrl(isbn13, 'large') : null,
    coverSmall: isbn13 ? nlgCoverUrl(isbn13, 'small') : null,
  };
}

export function parseNlgRss(xml: string): BookCandidate[] {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
    .map(match => parseNlgRssItem(match[1]))
    .filter((item): item is BookCandidate => item !== null);
}

type MarcRecord = Record<string, Record<string, string[]>[]>;

/** Parses MARCXML into tag -> occurrences -> subfield code -> values. */
export function parseMarcXml(xml: string): MarcRecord {
  const record: MarcRecord = {};
  for (const field of xml.matchAll(
    /<(?:marc:)?datafield[^>]*tag="(\d{3})"[^>]*>([\s\S]*?)<\/(?:marc:)?datafield>/g,
  )) {
    const subfields: Record<string, string[]> = {};
    for (const sub of field[2].matchAll(
      /<(?:marc:)?subfield[^>]*code="(.)"[^>]*>([\s\S]*?)<\/(?:marc:)?subfield>/g,
    )) {
      (subfields[sub[1]] ??= []).push(collapse(decodeXml(sub[2])));
    }
    (record[field[1]] ??= []).push(subfields);
  }
  return record;
}

export type NlgRecordDetails = {
  isbns: string[];
  pageCount: number | null;
  publisher: string | null;
  summary: string | null;
  genres: string[];
  translators: string[];
};

export function mapMarcRecord(record: MarcRecord): NlgRecordDetails {
  const first = (tag: string, code: string) => record[tag]?.[0]?.[code]?.[0] ?? null;
  const all = (tag: string, code: string) =>
    (record[tag] ?? []).flatMap(field => field[code] ?? []);

  const pages = (first('300', 'a') ?? '').match(/(\d+)\s*(?:,\s*\[\d+\])?\s*σ\./)?.[1];
  const publisher = first('264', 'b') ?? first('260', 'b');
  const translators = (record['700'] ?? [])
    .filter(field => (field['4'] ?? []).some(role => role.startsWith('trl')))
    .map(field => invertName(field.a?.[0]))
    .filter((name): name is string => !!name);

  return {
    isbns: parseIsbns(all('020', 'a').join(' ')),
    pageCount: pages ? Number(pages) : null,
    publisher: publisher ? stripMarcPunctuation(publisher) || null : null,
    summary: first('520', 'a'),
    genres: subjectsToGenres([...all('650', 'a'), ...all('655', 'a')]),
    translators,
  };
}

/**
 * Fetches a catalogue URL through the NLG transport and hands
 * cachedExternalFetch a JSON response, so what is cached is the parsed
 * result rather than raw XML.
 */
const nlgFetchAs =
  <T>(parse: (xml: string) => T) =>
  async (url: string): Promise<Response> => {
    const { status, body } = await fetchNlgText(url, nlgHeaders());
    if (status < 200 || status >= 300) {
      return new Response(body.slice(0, 500), { status });
    }
    return new Response(JSON.stringify(parse(body)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

/**
 * Greek spells several consonant pairs two ways, and the catalogue keeps
 * whichever the publisher printed: δαχτυλίδι / δακτυλίδι, φτερό / πτερό. A
 * single-character wildcard on the first letter of such a pair inside a word
 * matches both ("δα?τυλιδιών"), so the spelling the reader types does not
 * hide the other half of the records.
 */
export const toNlgQuery = (query: string) => query.replace(/(?<=\p{L})[χκφπ](?=τ)/giu, '?');

export async function searchNlg(
  query: string,
  { limit, isbn, page = 1 }: { limit: number; isbn?: string | null; page?: number },
): Promise<BookCandidate[]> {
  const url = new URL(`${CATALOGUE_BASE}/opac-search.pl`);
  url.searchParams.set('q', isbn ? `nb:${isbn}` : toNlgQuery(query));
  url.searchParams.set('format', 'rss');
  url.searchParams.set('count', String(limit));
  if (page > 1) {
    url.searchParams.set('offset', String((page - 1) * limit));
  }

  try {
    return await cachedExternalFetch<BookCandidate[]>({
      apiName: 'nlg-search',
      endpoint: url.toString(),
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
      fetchImpl: nlgFetchAs(parseNlgRss),
    });
  } catch (error) {
    logProviderError('NLG catalogue', error);
    return [];
  }
}

export async function fetchNlgRecord(nlgId: number): Promise<NlgRecordDetails | null> {
  if (!Number.isInteger(nlgId) || nlgId <= 0) {
    return null;
  }
  const url = `${CATALOGUE_BASE}/opac-export.pl?op=export&bib=${nlgId}&format=marcxml`;

  try {
    return await cachedExternalFetch<NlgRecordDetails>({
      apiName: 'nlg-record',
      endpoint: url,
      ttlSeconds: EXTERNAL_API_REVALIDATE_SECONDS,
      fetchImpl: nlgFetchAs(xml => mapMarcRecord(parseMarcXml(xml))),
    });
  } catch (error) {
    logProviderError('NLG record', error);
    return null;
  }
}
