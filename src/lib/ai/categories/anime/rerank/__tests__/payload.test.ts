import {
  buildAnimeCandidatePayload,
  buildAnimeRerankRequestPayload,
  buildAnimeTastePayload,
  buildAnimeTokenMap,
  fingerprintAnimeCandidates,
  shuffleAnimeCandidates,
  truncateSynopsis,
} from '../payload';
import { ANIME_RERANK_SYNOPSIS_MAX_CHARS } from '../types';
import type { AnimeDiscoveryShortlistEntry } from '@/lib/recommendations/v3/anime/anime-types';
import type { EnrichedAiAnimeTasteProfile } from '@/lib/ai/categories/anime/taste/types';

function entry(id: number, title: string, score = 80): AnimeDiscoveryShortlistEntry {
  return {
    candidate: {
      id,
      title,
      cover: 'https://example.test/cover.jpg',
      slug: `anime-${id}`,
      category: 'anime',
      genres: ['Action', 'Drama'],
      themes: [],
      platforms: [],
      popularityScore: 42,
    },
    score,
    matchedSignals: ['genre alignment'],
    familyKey: `family-${id}`,
    deterministicRank: 1,
  };
}

const DETAIL = {
  synopsis: 'A quiet series about a travelling doctor.',
  format: 'TV',
  episodes: 26,
  seasonYear: 2005,
};

describe('buildAnimeCandidatePayload', () => {
  it('sends the token, never the media id or anything that identifies the row', () => {
    const payload = buildAnimeCandidatePayload(entry(77, 'Mushishi'), 'c01', DETAIL);

    expect(payload.token).toBe('c01');
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('77');
    expect(serialised).not.toContain('anime-77');
    expect(serialised).not.toContain('cover.jpg');
  });

  it('withholds everything the deterministic engine ranked on', () => {
    const payload = buildAnimeCandidatePayload(entry(77, 'Mushishi', 93), 'c01', DETAIL);

    expect(payload).not.toHaveProperty('score');
    expect(payload).not.toHaveProperty('deterministicRank');
    expect(payload).not.toHaveProperty('familyKey');
    expect(payload).not.toHaveProperty('matchedSignals');
    expect(payload).not.toHaveProperty('popularityScore');
  });

  it('carries format and episodes, which is the commitment signal the scorer has no access to', () => {
    const payload = buildAnimeCandidatePayload(entry(1, 'Mushishi'), 'c01', DETAIL);

    expect(payload.format).toBe('TV');
    expect(payload.episodes).toBe(26);
    expect(payload.seasonYear).toBe(2005);
  });

  it('nulls missing details rather than dropping the candidate', () => {
    // A candidate whose detail row never loaded must still be ranked: a shorter ai_order than
    // deterministic_order would silently corrupt the blend.
    const payload = buildAnimeCandidatePayload(entry(1, 'Mushishi'), 'c01', undefined);

    expect(payload.title).toBe('Mushishi');
    expect(payload.format).toBeNull();
    expect(payload.episodes).toBeNull();
    expect(payload.seasonYear).toBeNull();
    expect(payload.synopsis).toBeNull();
  });
});

describe('truncateSynopsis', () => {
  it('leaves a short synopsis exactly as it is', () => {
    expect(truncateSynopsis('Short enough.')).toBe('Short enough.');
  });

  it('collapses whitespace', () => {
    expect(truncateSynopsis('  two   words  ')).toBe('two words');
  });

  it('returns null for empty or missing text', () => {
    expect(truncateSynopsis(null)).toBeNull();
    expect(truncateSynopsis('   ')).toBeNull();
  });

  it('truncates at a word boundary and marks the cut', () => {
    const long = `${'word '.repeat(200)}end`;
    const result = truncateSynopsis(long);

    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(ANIME_RERANK_SYNOPSIS_MAX_CHARS + 1);
    expect(result!.endsWith('…')).toBe(true);
    expect(result).not.toContain('  ');
  });
});

describe('buildAnimeTastePayload', () => {
  const profile = {
    identity: { label: 'Quiet Character Study', description: 'Prefers restraint to spectacle.' },
    pillars: [
      {
        name: 'Episodic introspection',
        kind: 'form' as const,
        description: 'Standalone episodes that resolve emotionally rather than narratively.',
        evidenceTitles: ['Mushishi', 'Kino no Tabi'],
        strengthBand: 'Defining' as const,
      },
    ],
    negativeSignals: [
      { name: 'Tournament escalation', description: 'Abandons power-ladder shows.', evidenceTitles: ['Some Show'] },
    ],
    summary: 'Watches for atmosphere.',
    openQuestions: ['Unclear whether long runs are avoided or untried.'],
    dataQuality: { sufficiency: 'rich' },
  } as unknown as EnrichedAiAnimeTasteProfile;

  it('keeps the pillar taxonomy anime actually uses', () => {
    expect(buildAnimeTastePayload(profile).pillars[0].kind).toBe('form');
  });

  it('strips evidence titles, so the model cannot be steered toward look-alikes', () => {
    const serialised = JSON.stringify(buildAnimeTastePayload(profile));

    expect(serialised).not.toContain('Kino no Tabi');
    expect(serialised).not.toContain('evidenceTitles');
  });

  it('strips open questions, so a stated uncertainty cannot become a ranking criterion', () => {
    expect(JSON.stringify(buildAnimeTastePayload(profile))).not.toContain('untried');
  });

  it('flattens sufficiency onto the payload', () => {
    expect(buildAnimeTastePayload(profile).sufficiency).toBe('rich');
  });
});

describe('the request envelope', () => {
  const taste = buildAnimeTastePayload({
    identity: { label: 'L', description: 'D' },
    pillars: [],
    negativeSignals: [],
    summary: 'S',
    dataQuality: { sufficiency: 'rich' },
  } as unknown as EnrichedAiAnimeTasteProfile);

  const candidates = ['Monster', 'Mushishi', 'Pluto', 'Kaiba'].map((title, index) =>
    buildAnimeCandidatePayload(entry(index + 1, title), `c0${index + 1}`, DETAIL),
  );

  it('issues tokens in deterministic shortlist order', () => {
    const map = buildAnimeTokenMap([entry(5, 'A'), entry(9, 'B')]);

    expect(map.tokens).toEqual(['c01', 'c02']);
    expect(map.toMediaId.get('c01')).toBe(5);
    expect(map.toMediaId.get('c02')).toBe(9);
  });

  it('shuffles candidates so input position cannot leak the deterministic ordering', () => {
    const shuffled = shuffleAnimeCandidates(candidates, 'seed-a');

    expect(shuffled.map(item => item.token).sort()).toEqual(
      candidates.map(item => item.token).sort(),
    );
    expect(shuffled).not.toEqual(candidates);
  });

  it('shuffles reproducibly, so a refresh cannot reshuffle its way to a new answer', () => {
    expect(shuffleAnimeCandidates(candidates, 'seed-a')).toEqual(
      shuffleAnimeCandidates(candidates, 'seed-a'),
    );
    expect(shuffleAnimeCandidates(candidates, 'seed-a')).not.toEqual(
      shuffleAnimeCandidates(candidates, 'seed-b'),
    );
  });

  it('stamps the payload version', () => {
    expect(buildAnimeRerankRequestPayload(taste, candidates, 'seed').payloadVersion).toBe(
      'anime-rerank-payload-v1',
    );
  });

  it('fingerprints the sent fields, not the order they were shuffled into', () => {
    const digest = fingerprintAnimeCandidates(candidates);

    expect(digest).toHaveLength(64);
    expect(fingerprintAnimeCandidates(candidates)).toBe(digest);
    expect(fingerprintAnimeCandidates(candidates.slice(0, 3))).not.toBe(digest);
  });
});
