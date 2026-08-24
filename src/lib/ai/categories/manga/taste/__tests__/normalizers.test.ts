import {
  buildMangaFamilyPrefixAliases,
  isDemographicOnlyLabel,
  isDerivativeMangaEntry,
  normalizeMangaFamilyKey,
  normalizeMangaIdentityKey,
} from '../normalizers';

/**
 * The two-tier collapse is the manga-specific part, so the tests are organised around the
 * distinction rather than around the functions: an edition is the *same work* and must merge at
 * the identity level; a sequel is a *different work in the same series* and must merge only at the
 * family level. Getting either one wrong is silent — the profile still generates, it just weighs
 * the library incorrectly — so both directions are asserted explicitly.
 */

describe('editions collapse at the identity level', () => {
  const base = normalizeMangaIdentityKey('Berserk');

  it.each([
    'Berserk: Deluxe Edition',
    'Berserk Deluxe Edition',
    'Berserk: Perfect Edition',
    'Berserk: Ultimate Edition',
    'Berserk Omnibus',
    'Berserk: Omnibus Edition',
    'Berserk Kanzenban',
    'Berserk Bunkoban',
    'Berserk: Remastered',
    'Berserk Full Color',
    'Berserk: Digital Colored Comics',
  ])('treats %s as the same work', title => {
    expect(normalizeMangaIdentityKey(title)).toBe(base);
  });

  it('does not merge two unrelated works that merely share a word', () => {
    expect(normalizeMangaIdentityKey('Berserk')).not.toBe(normalizeMangaIdentityKey('Berserk of Gluttony'));
  });

  it('never reduces an edition-named work to nothing', () => {
    expect(normalizeMangaIdentityKey('Omnibus')).not.toBe('');
  });
});

describe('sequels stay distinct works but share a family', () => {
  it.each([
    ["JoJo's Bizarre Adventure Part 3", "JoJo's Bizarre Adventure Part 4"],
    ['Vagabond Part 2', 'Vagabond Part 3'],
    ['Slam Dunk', 'Slam Dunk Returns'],
    ['Getter Robo', 'Shin Getter Robo'],
  ])('keeps %s and %s separate at the identity level', (left, right) => {
    expect(normalizeMangaIdentityKey(left)).not.toBe(normalizeMangaIdentityKey(right));
  });

  it.each([
    ["JoJo's Bizarre Adventure", "JoJo's Bizarre Adventure Part 5: Golden Wind"],
    ['Vagabond', 'Vagabond Part 2'],
    ['Slam Dunk', 'Slam Dunk Returns'],
    ['Getter Robo', 'Shin Getter Robo'],
    ['Gantz', 'Gantz 2'],
    ['Fullmetal Alchemist', 'Fullmetal Alchemist: The Final Arc'],
  ])('puts %s and %s in one family', (left, right) => {
    expect(normalizeMangaFamilyKey(left)).toBe(normalizeMangaFamilyKey(right));
  });
});

describe('unrelated works under a shared licence stay apart', () => {
  it.each([
    ['Fate/stay night', 'Fate/Zero'],
    ['Gundam: Iron-Blooded Orphans', 'Gundam: The Origin'],
    ['Monogatari: Bakemonogatari', 'Monogatari: Nisemonogatari'],
  ])('keeps %s and %s in different families', (left, right) => {
    expect(normalizeMangaFamilyKey(left)).not.toBe(normalizeMangaFamilyKey(right));
  });

  it('does not merge a title whose subtitle is descriptive rather than an instalment marker', () => {
    expect(normalizeMangaFamilyKey('Monster')).not.toBe(
      normalizeMangaFamilyKey('Monster: Another Monster'),
    );
  });
});

describe('side stories join their parent family', () => {
  it.each([
    ['Vinland Saga', 'Vinland Saga: Gaiden'],
    ['Vinland Saga', 'Vinland Saga: Extra Chapters'],
    ['Berserk', 'Berserk: Side Story'],
    ['Naruto', 'Naruto Spin-off'],
    ['Bleach', 'Bleach 4-koma'],
  ])('groups %s with %s', (parent, derivative) => {
    expect(normalizeMangaFamilyKey(derivative)).toBe(normalizeMangaFamilyKey(parent));
  });

  it('still marks them derivative rather than treating them as full works', () => {
    expect(isDerivativeMangaEntry('Vinland Saga: Gaiden', 'manga')).toBe(true);
    expect(isDerivativeMangaEntry('Bleach 4-koma', 'manga')).toBe(true);
    expect(isDerivativeMangaEntry('Vinland Saga', 'manga')).toBe(false);
  });
});

describe('format-driven derivative classification', () => {
  it('treats a one-shot as derivative', () => {
    // A one-shot is a complete work, but completing one is a twenty-minute commitment against a
    // serialised manga's dozens of hours. Weighting them equally would let a library of one-shots
    // clear the evidence threshold on almost no reading.
    expect(isDerivativeMangaEntry('Some Short Story', 'one_shot')).toBe(true);
  });

  it('treats doujinshi as derivative', () => {
    expect(isDerivativeMangaEntry('A Fan Work', 'doujinshi')).toBe(true);
  });

  it('does not treat a light novel as derivative', () => {
    // Reading the novel is a full and often longer commitment than reading the manga.
    expect(isDerivativeMangaEntry('Spice and Wolf', 'light_novel')).toBe(false);
    expect(isDerivativeMangaEntry('Kino no Tabi', 'novel')).toBe(false);
  });

  it('does not treat manhwa or manhua as derivative', () => {
    expect(isDerivativeMangaEntry('Solo Leveling', 'manhwa')).toBe(false);
    expect(isDerivativeMangaEntry('Tales of Demons and Gods', 'manhua')).toBe(false);
  });
});

describe('library-resolved prefix merging', () => {
  it('absorbs a publication arc into the series the reader also owns', () => {
    const aliases = buildMangaFamilyPrefixAliases([
      'vinland-saga',
      'vinland-saga-farmland-saga',
      'monster',
    ]);
    expect(aliases.get('vinland-saga-farmland-saga')).toBe('vinland-saga');
    expect(aliases.get('monster')).toBe('monster');
  });

  it('leaves sibling works apart when no shared parent is in the library', () => {
    const aliases = buildMangaFamilyPrefixAliases(['fate-stay-night', 'fate-zero']);
    expect(aliases.get('fate-stay-night')).toBe('fate-stay-night');
    expect(aliases.get('fate-zero')).toBe('fate-zero');
  });

  it('does not let a very short key act as a magnet', () => {
    const aliases = buildMangaFamilyPrefixAliases(['ao', 'ao-ashi', 'ao-no-exorcist']);
    expect(aliases.get('ao-ashi')).toBe('ao-ashi');
    expect(aliases.get('ao-no-exorcist')).toBe('ao-no-exorcist');
  });

  it('resolves a chain to one root in a single pass', () => {
    const aliases = buildMangaFamilyPrefixAliases(['berserk', 'berserk-gaiden', 'berserk-gaiden-two']);
    expect(aliases.get('berserk-gaiden-two')).toBe('berserk');
  });
});

describe('demographic labels are not taste', () => {
  it.each([
    'Shounen',
    'Seinen',
    'Shoujo manga',
    'Josei stories',
    'Seinen and Josei',
    'shonen comics',
  ])('rejects %s as a pillar name', label => {
    expect(isDemographicOnlyLabel(label)).toBe(true);
  });

  it.each([
    'Seinen psychological tension',
    'Battle escalation',
    'Long-form historical adventure',
    'Morally ambiguous protagonists',
    'Slow-burn romance structure',
  ])('accepts %s, which carries a real observation', label => {
    expect(isDemographicOnlyLabel(label)).toBe(false);
  });

  it('does not reject an empty or punctuation-only label here', () => {
    // Emptiness is the schema's job, not this rule's; this must not double as a length check.
    expect(isDemographicOnlyLabel('---')).toBe(false);
  });
});
