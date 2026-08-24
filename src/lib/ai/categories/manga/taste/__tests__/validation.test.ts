import { mangaEntry } from '../../__fixtures__/manga-history.fixture';
import { buildMangaAiEvidenceDocument } from '../evidence';
import type { MangaHistoryEntry } from '../history';
import {
  calculateMangaStrengthBand,
  calculateMangaStrengthDiagnostics,
  enrichAiMangaTasteProfile,
  findNegativeProse,
  validateAiMangaTasteProfile,
} from '../validation';
import {
  MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
  type AiMangaTasteProfile,
} from '../types';

/**
 * Two unrelated positives plus whatever a case needs, so a pillar can always cite across families
 * without the case having to construct a library first.
 */
const POSITIVE_BASE: MangaHistoryEntry[] = [
  mangaEntry({ id: 1, title: 'Berserk', status: 'completed', score: 9, isFavorite: true }),
  mangaEntry({ id: 2, title: 'Monster', status: 'completed', score: 9 }),
];

function evidenceFor(extra: MangaHistoryEntry[] = []) {
  return buildMangaAiEvidenceDocument([...POSITIVE_BASE, ...extra]);
}

function profile(overrides: Partial<AiMangaTasteProfile> = {}): AiMangaTasteProfile {
  return {
    schemaVersion: 1,
    identity: {
      label: 'Bleak Historical Epics',
      description: 'Drawn to long, morally heavy stories about violence and its cost.',
    },
    pillars: [
      {
        name: 'Morally ambiguous protagonists',
        kind: 'content',
        description: 'Leads whose methods the story refuses to endorse.',
        evidenceTitles: ['Berserk', 'Monster'],
      },
      {
        name: 'Long-form serialised arcs',
        kind: 'form',
        description: 'Stories that build across hundreds of chapters rather than resetting.',
        evidenceTitles: ['Berserk', 'Monster'],
      },
    ],
    negativeSignals: [],
    summary: 'A reader who returns to long, bleak, character-driven work.',
    openQuestions: [],
    ...overrides,
  };
}

describe('schema and content rules', () => {
  it('accepts a well-formed profile', () => {
    const result = validateAiMangaTasteProfile(profile(), evidenceFor());
    expect(result.success).toBe(true);
  });

  it('rejects a payload that does not match the contract', () => {
    const result = validateAiMangaTasteProfile({ schemaVersion: 2 }, evidenceFor());
    expect(result).toMatchObject({ success: false, category: 'schema' });
  });

  it('rejects an identity label longer than four words', () => {
    const result = validateAiMangaTasteProfile(
      profile({ identity: { label: 'One Two Three Four Five', description: 'x' } }),
      evidenceFor(),
    );
    expect(result).toMatchObject({ success: false, reason: 'identity_label_too_long' });
  });

  it('records no generated text in the logged schema issues', () => {
    const result = validateAiMangaTasteProfile(
      { ...profile(), summary: 'x'.repeat(500) },
      evidenceFor(),
    );
    expect(result.success).toBe(false);
    const issues = result.success ? [] : (result.issues ?? []);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(JSON.stringify(issue)).not.toContain('xxxx');
    }
  });
});

describe('demographic labels are never pillars', () => {
  it.each(['Shounen', 'Seinen manga', 'Josei stories', 'Shoujo'])(
    'rejects a pillar named %s',
    name => {
      const result = validateAiMangaTasteProfile(
        profile({
          pillars: [
            { ...profile().pillars[0], name },
            profile().pillars[1],
          ],
        }),
        evidenceFor(),
      );
      // A demographic names which magazine serialised a work. It is metadata the library already
      // holds, and restating it is not an observation about the reader.
      expect(result).toMatchObject({ success: false, reason: 'demographic_only_pillar' });
    },
  );

  it('accepts a pillar that mentions a demographic alongside a real observation', () => {
    const result = validateAiMangaTasteProfile(
      profile({
        pillars: [
          { ...profile().pillars[0], name: 'Seinen psychological tension' },
          profile().pillars[1],
        ],
      }),
      evidenceFor(),
    );
    expect(result.success).toBe(true);
  });
});

describe('evidence citation', () => {
  it('rejects a pillar citing a title the library never held', () => {
    const result = validateAiMangaTasteProfile(
      profile({
        pillars: [
          { ...profile().pillars[0], evidenceTitles: ['Berserk', 'Nonexistent Manga'] },
          profile().pillars[1],
        ],
      }),
      evidenceFor(),
    );
    expect(result).toMatchObject({ success: false, reason: 'hallucinated_pillar_evidence' });
  });

  it('resolves a cited edition back to the work it reprints', () => {
    const evidence = evidenceFor([
      mangaEntry({ id: 3, title: 'Berserk: Deluxe Edition', status: 'completed', score: 9 }),
    ]);
    const result = validateAiMangaTasteProfile(
      profile({
        pillars: [
          { ...profile().pillars[0], evidenceTitles: ['Berserk: Deluxe Edition', 'Monster'] },
          profile().pillars[1],
        ],
      }),
      evidence,
    );
    expect(result.success).toBe(true);
  });

  /** The third of the three defences against one franchise deciding a profile. */
  it('rejects a pillar whose every citation resolves to one family', () => {
    const evidence = evidenceFor([
      mangaEntry({ id: 3, title: 'Berserk: Deluxe Edition', status: 'completed', score: 9 }),
    ]);
    const result = validateAiMangaTasteProfile(
      profile({
        pillars: [
          { ...profile().pillars[0], evidenceTitles: ['Berserk', 'Berserk: Deluxe Edition'] },
          profile().pillars[1],
        ],
      }),
      evidence,
    );
    expect(result).toMatchObject({ success: false, reason: 'single_family_pillar' });
  });
});

describe('negative signals', () => {
  const earlyDrops: MangaHistoryEntry[] = [
    mangaEntry({ id: 10, title: 'Solo Leveling', status: 'dropped', progress: 2, progressUnit: 'chapters' }),
    mangaEntry({ id: 11, title: 'Tower of God', status: 'dropped', progress: 3, progressUnit: 'chapters' }),
  ];

  const signal = (evidenceTitles: string[]) => ({
    name: 'Repetitive power escalation',
    description: 'Progression fantasies where the ladder replaces the characters.',
    evidenceTitles,
  });

  it('accepts a signal built on early unrated drops', () => {
    const result = validateAiMangaTasteProfile(
      profile({ negativeSignals: [signal(['Solo Leveling', 'Tower of God'])] }),
      evidenceFor(earlyDrops),
    );
    expect(result.success).toBe(true);
    expect(result.success && result.profile.negativeSignals).toHaveLength(1);
  });

  it('discards the whole generation when a favourite is cited as a dislike', () => {
    const result = validateAiMangaTasteProfile(
      profile({ negativeSignals: [signal(['Berserk', 'Solo Leveling'])] }),
      evidenceFor(earlyDrops),
    );
    // The model asserted the opposite of what the reader said, so nothing it produced is trusted.
    expect(result).toMatchObject({ success: false, reason: expect.stringContaining('contradicted_negative_evidence') });
  });

  it('drops an unsupported signal without losing the pillars', () => {
    const lukewarm = mangaEntry({ id: 12, title: 'Bleach', status: 'completed', score: 6 });
    const result = validateAiMangaTasteProfile(
      profile({ negativeSignals: [signal(['Bleach'])] }),
      evidenceFor([lukewarm]),
    );
    expect(result.success).toBe(true);
    expect(result.success && result.profile.negativeSignals).toEqual([]);
    expect(result.success && result.profile.pillars).toHaveLength(2);
    expect(result.success && result.droppedNegativeSignals).toHaveLength(1);
  });

  it('rejects a signal citing a title the library never held', () => {
    const result = validateAiMangaTasteProfile(
      profile({ negativeSignals: [signal(['Imaginary Manga'])] }),
      evidenceFor(earlyDrops),
    );
    expect(result).toMatchObject({ success: false, reason: 'hallucinated_negative_evidence' });
  });

  it('will not let a deep drop carry a signal by itself', () => {
    const deepDrop = mangaEntry({
      id: 13,
      title: 'Bleach',
      status: 'dropped',
      progress: 600,
      progressUnit: 'chapters',
      media: { totalChapters: 686, totalVolumes: 74 },
    });
    const result = validateAiMangaTasteProfile(
      profile({ negativeSignals: [signal(['Bleach'])] }),
      evidenceFor([deepDrop]),
    );
    // Six hundred chapters before stopping is a stall, not a verdict.
    expect(result.success).toBe(true);
    expect(result.success && result.profile.negativeSignals).toEqual([]);
  });
});

/**
 * The prose guard.
 *
 * A negative *signal* that is unsupported can be dropped surgically. A rejection claim embedded in
 * the summary cannot: the sentence is load-bearing prose and there is no honest way to excise a
 * clause and hand the remainder to a reader as though the model wrote it. So when no signal
 * survives and the prose still asserts an aversion, the whole generation goes.
 */
describe('no rejection prose without a supported negative signal', () => {
  it('reports negativeSignals as empty when there is no aversion evidence', () => {
    const evidence = evidenceFor();
    expect(evidence.dataQuality.clearAversionCount).toBe(0);
    const result = validateAiMangaTasteProfile(profile(), evidence);
    expect(result.success && result.profile.negativeSignals).toEqual([]);
  });

  it.each([
    ['summary', 'A reader who avoids long-running battle series.'],
    ['summary', 'Shows little patience for episodic slice-of-life.'],
    ['summary', 'A clear aversion to romance built on misunderstandings.'],
    ['summary', 'Steers clear of anything that resets each chapter.'],
    ['summary', 'Not drawn to tournament arcs.'],
  ])('rejects a generation whose %s claims an unsupported rejection', (_field, summary) => {
    const result = validateAiMangaTasteProfile(profile({ summary }), evidenceFor());
    expect(result).toMatchObject({
      success: false,
      category: 'content',
      reason: expect.stringContaining('unsupported_negative_prose'),
    });
  });

  it('rejects unsupported rejection prose in the identity description', () => {
    const result = validateAiMangaTasteProfile(
      profile({
        identity: {
          label: 'Bleak Historical Epics',
          description: 'Drawn to heavy drama and dislikes lighthearted comedy.',
        },
      }),
      evidenceFor(),
    );
    expect(result).toMatchObject({ success: false, reason: expect.stringContaining('unsupported_negative_prose') });
  });

  it('rejects unsupported rejection prose in a pillar description', () => {
    const base = profile();
    const result = validateAiMangaTasteProfile(
      profile({
        pillars: [
          { ...base.pillars[0], description: 'Heavy drama; avoids anything comedic.' },
          base.pillars[1],
        ],
      }),
      evidenceFor(),
    );
    expect(result).toMatchObject({ success: false, reason: expect.stringContaining('unsupported_negative_prose') });
  });

  it('logs a field path and a rule index rather than the offending sentence', () => {
    const result = validateAiMangaTasteProfile(
      profile({ summary: 'A reader who avoids long-running battle series.' }),
      evidenceFor(),
    );
    expect(result.success).toBe(false);
    const reason = result.success ? '' : result.reason;
    expect(reason).toMatch(/summary#\d+/);
    expect(reason).not.toContain('battle series');
  });

  /**
   * The guard must not fire on prose describing the *stories*. "A protagonist who rejects easy
   * answers" is about the manga, not about what the reader will not read, and failing a profile
   * for saying something true would be a worse bug than the one being prevented.
   */
  it.each([
    'Drawn to protagonists who reject easy answers about violence.',
    'Stories where the hero abandons the quest and the book follows him anyway.',
    'A taste for slow, dialogue-heavy work that trusts the reader.',
    'Long historical arcs about people the world has no use for.',
  ])('accepts prose about the stories rather than the reader: %s', summary => {
    const result = validateAiMangaTasteProfile(profile({ summary }), evidenceFor());
    expect(result.success).toBe(true);
  });

  it('does not run the guard at all when a negative signal survives', () => {
    const earlyDrop = mangaEntry({
      id: 10,
      title: 'Solo Leveling',
      status: 'dropped',
      progress: 2,
      progressUnit: 'chapters',
    });
    const result = validateAiMangaTasteProfile(
      profile({
        summary: 'A reader who avoids repetitive power escalation.',
        negativeSignals: [
          {
            name: 'Repetitive power escalation',
            description: 'Progression fantasies where the ladder replaces the characters.',
            evidenceTitles: ['Solo Leveling'],
          },
        ],
      }),
      evidenceFor([earlyDrop]),
    );
    // The claim is supported here, so the prose stating it is legitimate.
    expect(result.success).toBe(true);
  });

  it('exposes the scan directly for every reader-visible field', () => {
    expect(findNegativeProse(profile())).toBeNull();
    expect(findNegativeProse(profile({ summary: 'Avoids comedy.' }))).toMatch(/^summary#/);
  });
});

describe('strength bands', () => {
  /** A flat library: every entry the same weight, so a pillar's ceiling is 5/10. */
  const flatLibrary = buildMangaAiEvidenceDocument(
    ['Berserk', 'Monster', 'Vagabond', 'Blame!', 'Pluto', 'Dorohedoro', 'Ajin', 'Gantz', 'Uzumaki', 'Akira'].map(
      (title, index) => mangaEntry({ id: index + 1, title, status: 'completed', score: 8 }),
    ),
  );

  /** A peaked library: three heavy favourites against seven light unrated completions. */
  const peakedLibrary = buildMangaAiEvidenceDocument([
    ...['Berserk', 'Monster', 'Vagabond'].map((title, index) =>
      mangaEntry({ id: index + 1, title, status: 'completed', score: 10, isFavorite: true }),
    ),
    ...['Blame!', 'Pluto', 'Dorohedoro', 'Ajin', 'Gantz', 'Uzumaki', 'Akira'].map((title, index) =>
      mangaEntry({ id: index + 10, title, status: 'completed' }),
    ),
  ]);

  it('draws the reference mass from at most ten entries', () => {
    const diagnostics = calculateMangaStrengthDiagnostics(['Berserk', 'Monster'], flatLibrary);
    expect(diagnostics.referenceEntryCount).toBeLessThanOrEqual(
      MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT,
    );
    expect(MANGA_AI_STRENGTH_REFERENCE_ENTRY_COUNT).toBe(10);
  });

  it('reaches Present, Strong and Defining — none of the bands is unreachable', () => {
    const present = calculateMangaStrengthBand(['Berserk', 'Monster'], flatLibrary);
    const strong = calculateMangaStrengthBand(
      ['Berserk', 'Monster', 'Vagabond', 'Blame!'],
      flatLibrary,
    );
    const defining = calculateMangaStrengthBand(
      ['Berserk', 'Monster', 'Vagabond', 'Blame!', 'Pluto'],
      peakedLibrary,
    );

    expect(present).toBe('Present');
    expect(strong).toBe('Strong');
    expect(defining).toBe('Defining');
  });

  /**
   * `Defining` must mean "these titles are heavier than this library's average", not "this pillar
   * cited a lot of titles". A pillar cites at most five, so in a flat library the ceiling is
   * 5/10 = 0.5 — inside `Strong`, short of the 0.6 `Defining` needs. If a flat library could
   * reach it, the band would carry no information.
   */
  it('cannot reach Defining in a library with no standout titles', () => {
    const everyTitleCited = calculateMangaStrengthBand(
      ['Berserk', 'Monster', 'Vagabond', 'Blame!', 'Pluto'],
      flatLibrary,
    );
    expect(everyTitleCited).not.toBe('Defining');
  });

  it('never returns a band above Emerging for a single cited title', () => {
    expect(calculateMangaStrengthBand(['Berserk'], peakedLibrary)).toBe('Emerging');
  });

  it('returns Emerging rather than dividing by zero on an all-negative library', () => {
    const negative = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'Berserk', status: 'dropped', progress: 2, progressUnit: 'chapters' }),
      mangaEntry({ id: 2, title: 'Monster', status: 'dropped', progress: 2, progressUnit: 'chapters' }),
    ]);
    expect(calculateMangaStrengthBand(['Berserk', 'Monster'], negative)).toBe('Emerging');
  });

  it('does not count one family twice when a pillar cites two of its instalments', () => {
    const library = buildMangaAiEvidenceDocument([
      mangaEntry({ id: 1, title: 'Berserk', status: 'completed', score: 9 }),
      mangaEntry({ id: 2, title: 'Berserk: Deluxe Edition', status: 'completed', score: 9 }),
      mangaEntry({ id: 3, title: 'Monster', status: 'completed', score: 9 }),
    ]);
    const diagnostics = calculateMangaStrengthDiagnostics(
      ['Berserk', 'Berserk: Deluxe Edition', 'Monster'],
      library,
    );
    expect(diagnostics.familyCount).toBe(2);
  });
});

describe('enrichment', () => {
  it('attaches a deterministic band to every pillar and never a model-supplied number', () => {
    const evidence = evidenceFor();
    const enriched = enrichAiMangaTasteProfile(profile(), evidence, 'test-model', 'hash-1');

    expect(enriched.pillars.every(pillar => typeof pillar.strengthBand === 'string')).toBe(true);
    expect(enriched.source).toBe('ai');
    expect(enriched.model).toBe('test-model');
    expect(enriched.inputHash).toBe('hash-1');
    expect(enriched.dataQuality).toBe(evidence.dataQuality);
    // No numeric confidence anywhere: every number on the profile is computed here, not generated.
    expect(JSON.stringify(enriched)).not.toMatch(/"confidence"/);
  });
});
