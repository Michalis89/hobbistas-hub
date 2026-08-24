/** @jest-environment node */

import { buildAnimeAiEvidenceDocument } from '../evidence';
import {
  isDerivativeAnimeEntry,
  isNonNarrativeAnimeEntry,
  normalizeAnimeFranchiseKey,
  normalizeAnimeIdentityKey,
} from '../normalizers';
import { animeEntry } from '../../__fixtures__/anime-history.fixture';

describe('season, cour and instalment collapse', () => {
  it.each([
    ['Attack on Titan', 'Attack on Titan Season 2'],
    ['Attack on Titan', 'Attack on Titan: The Final Season'],
    ['Attack on Titan', 'Attack on Titan: The Final Season Part 2'],
    ['Attack on Titan', 'Attack on Titan 2nd Season'],
    ['Jujutsu Kaisen', 'Jujutsu Kaisen S2'],
    ['Spy x Family', 'Spy x Family Cour 2'],
    ['Psycho-Pass', 'Psycho-Pass 2'],
    ['Mushoku Tensei', 'Mushoku Tensei II'],
    ['Code Geass', 'Code Geass R2'],
  ])('collapses %s and %s into one family', (base, instalment) => {
    expect(normalizeAnimeFranchiseKey(instalment)).toBe(normalizeAnimeFranchiseKey(base));
  });

  it.each([
    ['Clannad', 'Clannad Recap'],
    ['Clannad', 'Clannad OVA'],
    ['Gintama', 'Gintama Specials'],
    ['Fate/Zero', 'Fate/Zero: The Movie'],
  ])('collapses %s and its side entry %s', (base, derivative) => {
    expect(normalizeAnimeFranchiseKey(derivative)).toBe(normalizeAnimeFranchiseKey(base));
  });

  it('keeps seasons distinct at the identity level, since each is a real viewing decision', () => {
    expect(normalizeAnimeIdentityKey('Attack on Titan Season 2')).not.toBe(
      normalizeAnimeIdentityKey('Attack on Titan'),
    );
  });
});

describe('over-collapse guards', () => {
  /**
   * The reason this module exists instead of reusing the generic franchise helper. Anime brands
   * name unrelated works with a colon, so stripping every subtitle would merge shows that share
   * nothing but a licence.
   */
  it('keeps unrelated works that merely share a brand apart', () => {
    expect(normalizeAnimeFranchiseKey('Mobile Suit Gundam: Iron-Blooded Orphans')).not.toBe(
      normalizeAnimeFranchiseKey('Mobile Suit Gundam: The Witch from Mercury'),
    );
  });

  it('keeps distinct entries in an anthology-style franchise apart', () => {
    expect(normalizeAnimeFranchiseKey('Fate/Zero')).not.toBe(
      normalizeAnimeFranchiseKey('Fate/stay night'),
    );
    expect(normalizeAnimeFranchiseKey('Monogatari Series: Bakemonogatari')).not.toBe(
      normalizeAnimeFranchiseKey('Monogatari Series: Owarimonogatari'),
    );
  });

  it('never reduces a numeric title to an empty key', () => {
    expect(normalizeAnimeFranchiseKey('86')).toBeTruthy();
    expect(normalizeAnimeFranchiseKey('5')).toBeTruthy();
  });

  it('does not merge two different series that both start with a common word', () => {
    expect(normalizeAnimeFranchiseKey('Sword Art Online')).not.toBe(
      normalizeAnimeFranchiseKey('Sword of the Stranger'),
    );
  });
});

describe('derivative and non-narrative classification', () => {
  it('trusts the structured format over the title', () => {
    expect(isDerivativeAnimeEntry('Some Show', 'ova')).toBe(true);
    expect(isDerivativeAnimeEntry('Some Show', 'special')).toBe(true);
    // A film is a full work, not a footnote.
    expect(isDerivativeAnimeEntry('Some Show', 'movie')).toBe(false);
    expect(isDerivativeAnimeEntry('Some Show', 'tv')).toBe(false);
  });

  it('falls back to title markers when the format is missing', () => {
    expect(isDerivativeAnimeEntry('Some Show Recap', null)).toBe(true);
    expect(isDerivativeAnimeEntry('Some Show', null)).toBe(false);
  });

  it('marks only genuinely non-narrative formats for exclusion', () => {
    expect(isNonNarrativeAnimeEntry('music')).toBe(true);
    expect(isNonNarrativeAnimeEntry('ova')).toBe(false);
    expect(isNonNarrativeAnimeEntry(null)).toBe(false);
  });
});

describe('franchise dominance prevention', () => {
  /**
   * The failure this whole collapse step exists to stop: a viewer with one long-running series
   * and a handful of other shows should not get a profile that is entirely about that series.
   */
  const longFranchise = [
    animeEntry({ id: 1, title: 'Attack on Titan', status: 'completed', score: 10, isFavorite: true }),
    animeEntry({ id: 2, title: 'Attack on Titan Season 2', status: 'completed', score: 10, isFavorite: true }),
    animeEntry({ id: 3, title: 'Attack on Titan Season 3', status: 'completed', score: 10, isFavorite: true }),
    animeEntry({ id: 4, title: 'Attack on Titan: The Final Season', status: 'completed', score: 10, isFavorite: true }),
    animeEntry({ id: 5, title: 'Attack on Titan: The Final Season Part 2', status: 'completed', score: 10, isFavorite: true }),
    animeEntry({ id: 6, title: 'Attack on Titan OVA', status: 'completed', score: 9, media: { format: 'ova' } }),
    animeEntry({ id: 7, title: 'Monster', status: 'completed', score: 9 }),
    animeEntry({ id: 8, title: 'Steins;Gate', status: 'completed', score: 8 }),
  ];

  it('reduces a six-entry franchise to a single evidence entry', () => {
    const document = buildAnimeAiEvidenceDocument(longFranchise);
    const titanEntries = document.entries.filter(entry =>
      entry.franchiseKey.includes('attack-on-titan'),
    );
    expect(titanEntries).toHaveLength(1);
    expect(titanEntries[0].titles.length).toBeGreaterThan(1);
  });

  it('records how many instalments the family held, so the collapse is visible', () => {
    const document = buildAnimeAiEvidenceDocument(longFranchise);
    const family = document.franchises.find(f => f.franchiseKey.includes('attack-on-titan'));
    expect(family?.entryCount).toBe(6);
  });

  it('caps what one franchise contributes even when every season is a favourite', () => {
    const document = buildAnimeAiEvidenceDocument(longFranchise);
    const family = document.franchises.find(f => f.franchiseKey.includes('attack-on-titan'));
    // Raw family mass is enormous — five favourited 10s plus an OVA.
    expect(family?.positiveMass ?? 0).toBeGreaterThan(45);

    const titan = document.entries.find(entry => entry.franchiseKey.includes('attack-on-titan'));
    // What the entry actually carries into the document is one entry's weight, not the sum.
    expect(titan?.weight).toBe(10);
  });

  it('counts a long franchise as one title towards the evidence threshold', () => {
    const document = buildAnimeAiEvidenceDocument(longFranchise);
    // Eight rows in, but only three distinct series.
    expect(document.dataQuality.titleCount).toBe(3);
    expect(document.dataQuality.sufficiency).toBe('sparse');
  });
});
