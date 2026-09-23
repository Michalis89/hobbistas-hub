import {
  buildCandidatePayload,
  buildRerankRequestPayload,
  buildTastePayload,
  buildTokenMap,
  fingerprintCandidates,
  shuffleCandidates,
  truncateSummary,
} from '../payload';
import { GAME_RERANK_SUMMARY_MAX_CHARS } from '../types';
import type { GamesDiscoveryShortlistEntry } from '@/lib/recommendations/v3/games/games-types';
import type { EnrichedAiGamingTasteProfile } from '@/lib/ai/categories/games/taste/types';

function entry(id: number, title: string, overrides = {}): GamesDiscoveryShortlistEntry {
  return {
    candidate: {
      id,
      title,
      slug: `slug-${id}`,
      genres: ['Role-playing (RPG)'],
      themes: ['Fantasy'],
      platforms: ['PlayStation 5'],
      cover: `cover-${id}`,
      popularityScore: 77,
      developer: 'FromSoftware',
      studios: ['Bandai Namco'],
      releaseDate: '2022-02-25',
      gameModes: ['Single player'],
      playerPerspectives: ['Third person'],
      summary: null,
      ...overrides,
    },
    score: 90,
    confidence: 0.9,
    matchedSignals: ['core genre alignment'],
    debug: { coreMatch: 2 },
    familyKey: `family-${id}`,
    deterministicRank: 1,
  };
}

const PROFILE = {
  identity: { label: 'Authored Drama', description: 'Prefers authored stories.' },
  pillars: [
    {
      name: 'Authored Character-Driven Drama',
      kind: 'content' as const,
      description: 'Follows a written arc.',
      evidenceTitles: ['The Witcher 3', 'God of War'],
      strengthBand: 'Strong' as const,
    },
  ],
  negativeSignals: [
    {
      name: 'Low-Interaction Cozy Tasks',
      description: 'Abandons chore loops.',
      evidenceTitles: ['Stardew Valley'],
    },
  ],
  summary: 'Authored drama, methodical combat.',
  openQuestions: ['Does difficulty matter more than story?'],
  dataQuality: { titleCount: 30, ratedRatio: 0.7, favoriteCount: 6, sufficiency: 'rich' as const },
  source: 'ai' as const,
  model: 'gemini-3.6-flash',
  inputHash: 'abc123',
} as unknown as EnrichedAiGamingTasteProfile;

describe('buildTokenMap', () => {
  it('issues zero-padded sequential tokens in shortlist order', () => {
    const map = buildTokenMap([entry(11, 'A'), entry(22, 'B'), entry(33, 'C')]);

    expect(map.tokens).toEqual(['c01', 'c02', 'c03']);
    expect(map.toMediaId.get('c02')).toBe(22);
    expect(map.toToken.get(33)).toBe('c03');
  });

  it('caps at the shortlist maximum', () => {
    const map = buildTokenMap(Array.from({ length: 40 }, (_, i) => entry(i + 1, `T${i}`)));

    expect(map.tokens).toHaveLength(20);
    expect(map.tokens[19]).toBe('c20');
  });
});

describe('truncateSummary', () => {
  it('leaves a short summary alone', () => {
    expect(truncateSummary('A short summary.')).toBe('A short summary.');
  });

  it('collapses whitespace', () => {
    expect(truncateSummary('  a\n\n  b  ')).toBe('a b');
  });

  it('returns null for empty or missing input', () => {
    expect(truncateSummary(null)).toBeNull();
    expect(truncateSummary('   ')).toBeNull();
  });

  it('truncates past the limit and marks the cut', () => {
    const long = `${'word '.repeat(200)}end`;
    const result = truncateSummary(long)!;

    expect(result.length).toBeLessThanOrEqual(GAME_RERANK_SUMMARY_MAX_CHARS + 1);
    expect(result.endsWith('…')).toBe(true);
  });

  it('cuts at a word boundary rather than mid-word', () => {
    const long = `${'alpha '.repeat(100)}omega`;
    const result = truncateSummary(long)!;

    expect(result).not.toMatch(/alph…$/);
  });
});

describe('buildCandidatePayload', () => {
  const payload = buildCandidatePayload(entry(11, 'Elden Ring'), 'c01', 'A vast dark fantasy world.');

  it('carries only semantic fields', () => {
    expect(payload).toEqual({
      token: 'c01',
      title: 'Elden Ring',
      genres: ['Role-playing (RPG)'],
      themes: ['Fantasy'],
      gameModes: ['Single player'],
      playerPerspectives: ['Third person'],
      developer: 'FromSoftware',
      releaseYear: 2022,
      summary: 'A vast dark fantasy world.',
    });
  });

  it('leaks no deterministic signal or row identity', () => {
    const serialised = JSON.stringify(payload);

    expect(serialised).not.toContain('score');
    expect(serialised).not.toContain('popularity');
    expect(serialised).not.toContain('deterministicRank');
    expect(serialised).not.toContain('cover');
    expect(serialised).not.toContain('slug');
    expect(serialised).not.toContain('"id"');
  });

  it('falls back to the first studio when developer is absent', () => {
    const payloadWithoutDeveloper = buildCandidatePayload(
      entry(12, 'X', { developer: null }),
      'c02',
      null,
    );

    expect(payloadWithoutDeveloper.developer).toBe('Bandai Namco');
  });

  it('yields a null release year for an unparseable date', () => {
    expect(buildCandidatePayload(entry(13, 'Y', { releaseDate: 'soon' }), 'c03', null).releaseYear)
      .toBeNull();
  });
});

describe('buildTastePayload', () => {
  const taste = buildTastePayload(PROFILE);

  it('sends identity, pillars with bands, negative signals, summary and sufficiency', () => {
    expect(taste.identity.label).toBe('Authored Drama');
    expect(taste.pillars[0]).toEqual({
      name: 'Authored Character-Driven Drama',
      kind: 'content',
      description: 'Follows a written arc.',
      strengthBand: 'Strong',
    });
    expect(taste.negativeSignals[0]).toEqual({
      name: 'Low-Interaction Cozy Tasks',
      description: 'Abandons chore loops.',
    });
    expect(taste.sufficiency).toBe('rich');
  });

  it('omits evidence titles, open questions and provenance', () => {
    const serialised = JSON.stringify(taste);

    expect(serialised).not.toContain('evidenceTitles');
    expect(serialised).not.toContain('The Witcher 3');
    expect(serialised).not.toContain('Stardew Valley');
    expect(serialised).not.toContain('openQuestions');
    expect(serialised).not.toContain('inputHash');
    expect(serialised).not.toContain('abc123');
    expect(serialised).not.toContain('gemini');
  });
});

describe('shuffleCandidates', () => {
  const candidates = Array.from({ length: 12 }, (_, i) =>
    buildCandidatePayload(entry(i + 1, `Title ${i + 1}`), `c${String(i + 1).padStart(2, '0')}`, null),
  );

  it('is reproducible for the same seed', () => {
    const a = shuffleCandidates(candidates, 'seed-1');
    const b = shuffleCandidates(candidates, 'seed-1');

    expect(a.map(c => c.token)).toEqual(b.map(c => c.token));
  });

  it('differs for a different seed', () => {
    const a = shuffleCandidates(candidates, 'seed-1');
    const b = shuffleCandidates(candidates, 'seed-2');

    expect(a.map(c => c.token)).not.toEqual(b.map(c => c.token));
  });

  it('actually reorders, so deterministic rank cannot be read off list position', () => {
    const shuffled = shuffleCandidates(candidates, 'seed-1');

    expect(shuffled.map(c => c.token)).not.toEqual(candidates.map(c => c.token));
  });

  it('preserves every candidate exactly once', () => {
    const shuffled = shuffleCandidates(candidates, 'seed-1');

    expect(shuffled).toHaveLength(candidates.length);
    expect(new Set(shuffled.map(c => c.token)).size).toBe(candidates.length);
  });

  it('does not mutate the input', () => {
    const before = candidates.map(c => c.token);
    shuffleCandidates(candidates, 'seed-1');

    expect(candidates.map(c => c.token)).toEqual(before);
  });
});

describe('buildRerankRequestPayload', () => {
  it('stamps the payload version and shuffles the candidates', () => {
    const candidates = Array.from({ length: 6 }, (_, i) =>
      buildCandidatePayload(entry(i + 1, `T${i}`), `c0${i + 1}`, null),
    );
    const payload = buildRerankRequestPayload(buildTastePayload(PROFILE), candidates, 'seed');

    expect(payload.payloadVersion).toBe('games-rerank-payload-v1');
    expect(payload.candidates).toHaveLength(6);
    expect(new Set(payload.candidates.map(c => c.token)).size).toBe(6);
  });
});

describe('fingerprintCandidates', () => {
  it('is stable for identical content', () => {
    const a = [buildCandidatePayload(entry(1, 'A'), 'c01', 'x')];
    const b = [buildCandidatePayload(entry(1, 'A'), 'c01', 'x')];

    expect(fingerprintCandidates(a)).toBe(fingerprintCandidates(b));
  });

  it('changes when any sent field changes', () => {
    const base = [buildCandidatePayload(entry(1, 'A'), 'c01', 'x')];
    const changed = [buildCandidatePayload(entry(1, 'A', { developer: 'Other' }), 'c01', 'x')];

    expect(fingerprintCandidates(base)).not.toBe(fingerprintCandidates(changed));
  });
});
