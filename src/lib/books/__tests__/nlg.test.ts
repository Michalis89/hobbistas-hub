/**
 * @jest-environment node
 */

const mockCachedExternalFetch = jest.fn();

jest.mock('@/lib/api-cache/external', () => ({
  cachedExternalFetch: (...args: unknown[]) => mockCachedExternalFetch(...args),
  ExternalFetchError: class ExternalFetchError extends Error {},
}));

jest.mock('../nlgTransport', () => ({ fetchNlgText: jest.fn() }));

import {
  hasGreekLetters,
  invertName,
  mapMarcRecord,
  parseMarcXml,
  parseNlgRss,
  searchNlg,
  toNlgQuery,
} from '../nlg';

// Trimmed from a real catalogue.nlg.gr OpenSearch RSS response
const RSS = `<?xml version='1.0' encoding='utf-8' ?>
<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<item>
  <title>
    Ο άρχοντας των δαχτυλιδιών :


    Οι δύο πύργοι : Πρόσωπα και τόποι της Μέσης-Γης /
  </title>
  <dc:identifier>ISBN:960521136X</dc:identifier>
  <link>https://catalogue.nlg.gr/cgi-bin/koha/opac-detail.pl?biblionumber=420122</link>
  <description><![CDATA[
    <img alt="Cover image" src="https://covers.nlg.gr/?isbn=960521136X&wm=yes&size=small" />
    <p>By Fisher, Jude.
    Αθήνα : Αίολος, 2002
                        . 63,[8]σ. :
                        , Εγχειρίδιο για την δεύτερη ταινία της τριλογίας
                         31εκ..
    </p>
  ]]></description>
</item>
<item>
  <title>Ο άρχοντας των δακτυλιδιών /</title>
  <dc:identifier>ISBN:9789600403664 | 9789600403671 | 9789600404388</dc:identifier>
  <link>https://catalogue.nlg.gr/cgi-bin/koha/opac-detail.pl?biblionumber=562948</link>
  <description><![CDATA[<p>By Tolkien, J. R. R.
    Αθήνα : Κέδρος, 1985
    . 3τ. ; 21εκ.</p>]]></description>
</item>
<item>
  <title>Ο άρχοντας των δαχτυλιδιών</title>
  <dc:identifier>ISBN:9608162726</dc:identifier>
  <link>https://catalogue.nlg.gr/cgi-bin/koha/opac-detail.pl?biblionumber=289018</link>
  <description><![CDATA[<p>[Αθήνα] : Δημοσιογραφικός Οργανισμός Λαμπράκη, c2002
    . 1 βιντεοδίσκος (DVD, 53 λεπτ.)</p>]]></description>
</item>
<item>
  <title>Ο άρχοντας των δαχτυλιδιών</title>
  <dc:identifier>ISBN:</dc:identifier>
  <link>https://catalogue.nlg.gr/cgi-bin/koha/opac-detail.pl?biblionumber=624151</link>
  <description><![CDATA[<p>Αθήνα : Καπνιστός, Π., 2004
    . τ. ; , Υπάρχουν τα έτη: 2004 με τα τεύχη 1-15</p>]]></description>
</item>
</channel>
</rss>`;

describe('parseNlgRss', () => {
  const books = parseNlgRss(RSS);

  it('keeps books and drops films and periodicals', () => {
    expect(books.map(book => book.nlgId)).toEqual([420122, 562948]);
  });

  it('splits title and subtitle and reads the imprint', () => {
    expect(books[0]).toMatchObject({
      title: 'Ο άρχοντας των δαχτυλιδιών',
      subtitle: 'Οι δύο πύργοι : Πρόσωπα και τόποι της Μέσης-Γης',
      authors: ['Jude Fisher'],
      publisher: 'Αίολος',
      publishedDate: '2002',
      pageCount: 63,
      isbn13: '9789605211363',
      coverLarge: 'https://covers.nlg.gr/?isbn=9789605211363&size=large',
      googleBooksId: null,
      openLibraryId: null,
    });
  });

  it('keeps every ISBN of a multi-volume set and initials intact', () => {
    expect(books[1]).toMatchObject({
      title: 'Ο άρχοντας των δακτυλιδιών',
      authors: ['J. R. R. Tolkien'],
      publisher: 'Κέδρος',
      publishedDate: '1985',
      pageCount: null,
      isbns: ['9789600403664', '9789600403671', '9789600404388'],
      isbn13: '9789600403664',
    });
  });
});

describe('MARC record', () => {
  const MARC = `<record xmlns="http://www.loc.gov/MARC21/slim">
    <datafield tag="020" ind1=" " ind2=" "><subfield code="a">9789600403664</subfield></datafield>
    <datafield tag="100" ind1="1" ind2=" "><subfield code="a">Tolkien, J. R. R.</subfield><subfield code="d">1892-1973</subfield></datafield>
    <datafield tag="260" ind1=" " ind2=" "><subfield code="a">&#x391;&#x3B8;&#x3AE;&#x3BD;&#x3B1; :</subfield><subfield code="b">&#x39A;&#x3AD;&#x3B4;&#x3C1;&#x3BF;&#x3C2;,</subfield><subfield code="c">1985</subfield></datafield>
    <datafield tag="300" ind1=" " ind2=" "><subfield code="a">589 σ. ;</subfield></datafield>
    <datafield tag="650" ind1=" " ind2="4"><subfield code="a">Φανταστική λογοτεχνία</subfield></datafield>
    <datafield tag="650" ind1=" " ind2="4"><subfield code="a">Αγγλικό μυθιστόρημα</subfield></datafield>
    <datafield tag="700" ind1="1" ind2=" "><subfield code="a">Χατζηθανάση-Κόλλια, Ευγενία</subfield><subfield code="4">trl</subfield></datafield>
  </record>`;

  it('maps the details the search result lacks', () => {
    expect(mapMarcRecord(parseMarcXml(MARC))).toEqual({
      isbns: ['9789600403664'],
      pageCount: 589,
      publisher: 'Κέδρος',
      summary: null,
      genres: ['Fantasy', 'Fiction'],
      translators: ['Ευγενία Χατζηθανάση-Κόλλια'],
    });
  });
});

describe('helpers', () => {
  it('detects Greek queries', () => {
    expect(hasGreekLetters('Ζορμπάς')).toBe(true);
    expect(hasGreekLetters('Ὁ ἀληθινὸς')).toBe(true);
    expect(hasGreekLetters('lord of the rings')).toBe(false);
  });

  it('matches both spellings of χτ/κτ and φτ/πτ inside words', () => {
    expect(toNlgQuery('ο άρχοντας των δαχτυλιδιών')).toBe('ο άρχοντας των δα?τυλιδιών');
    expect(toNlgQuery('δακτυλίδι')).toBe('δα?τυλίδι');
    // Only inside a word: a leading κτ/πτ is left alone
    expect(toNlgQuery('κτήμα πτήση')).toBe('κτήμα πτήση');
  });

  it('inverts catalogue names', () => {
    expect(invertName('Tolkien, J. R. R., 1892-1973')).toBe('J. R. R. Tolkien');
    expect(invertName('Fisher, Jude.')).toBe('Jude Fisher');
    // The RSS summary adds its own full stop after the field's
    expect(invertName('Tolkien, J. R. R..')).toBe('J. R. R. Tolkien');
    expect(invertName('Καζαντζάκης, Νίκος,')).toBe('Νίκος Καζαντζάκης');
    expect(invertName(null)).toBeNull();
  });
});

describe('searchNlg', () => {
  beforeEach(() => mockCachedExternalFetch.mockReset());

  it('queries by ISBN index for ISBN searches and caches the parsed result', async () => {
    mockCachedExternalFetch.mockResolvedValue([]);

    await searchNlg('978-960-04-0366-4', { limit: 5, isbn: '9789600403664' });

    const call = mockCachedExternalFetch.mock.calls[0][0];
    const url = new URL(call.endpoint);
    expect(url.hostname).toBe('catalogue.nlg.gr');
    expect(url.searchParams.get('q')).toBe('nb:9789600403664');
    expect(url.searchParams.get('format')).toBe('rss');
    expect(typeof call.fetchImpl).toBe('function');
  });

  it('returns nothing when the catalogue is down', async () => {
    mockCachedExternalFetch.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(searchNlg('Ζορμπάς', { limit: 5 })).resolves.toEqual([]);
  });
});
