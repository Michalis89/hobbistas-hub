/**
 * The manga rerank payload, and the two manga-specific caveats it has to carry correctly.
 *
 * A chapter count that is really somebody's bookmark, and a label list that mixes demographic
 * brackets in with genres. Both are properties of the rows rather than of the ranking, and both
 * would quietly degrade the ordering if the payload presented them as something they are not.
 */

jest.mock('server-only', () => ({}), { virtual: true });

import {
  buildMangaCandidatePayload,
  buildMangaRerankRequestPayload,
  buildMangaTastePayload,
  buildMangaTokenMap,
  shuffleMangaCandidates,
  truncateMangaSynopsis,
} from '../payload';
import { loadMangaCandidateDetails } from '../candidate-details';
import { buildMangaRerankPrompt } from '../prompt';
import { MANGA_RERANK_SYNOPSIS_MAX_CHARS, type MangaRerankRequestPayload } from '../types';
import type { PipelineDiscoveryShortlistEntry } from '@/lib/recommendations/v3/pipeline/shadow-context';
import type { EnrichedAiMangaTasteProfile } from '@/lib/ai/categories/manga/taste/types';

function entry(id: number, title: string, rawScore = 80): PipelineDiscoveryShortlistEntry {
  return {
    item: {
      mediaDbId: id,
      title,
      cover: 'https://example.test/cover.jpg',
      slug: `manga-${id}`,
      genres: ['Action', 'Psychological', 'Seinen'],
      themes: [],
      platforms: [],
      source: 'discovery',
      rawScore,
      confidence: rawScore / 100,
      clusterMatch: 'dark-psychological',
      toneMatch: null,
      franchiseKey: null,
      matchedSignals: ['cluster affinity'],
      reason: 'Matches your dark psychological cluster',
    },
    deterministicRank: 1,
  };
}

const DETAIL = {
  synopsis: 'A detective pursues a killer across post-war Europe.',
  format: 'manga',
  totalChapters: 162,
  totalVolumes: 18,
  publicationStatus: 'finished',
  startYear: 1994,
};

describe('buildMangaCandidatePayload', () => {
  it('sends the token, never the media id or anything that identifies the row', () => {
    const payload = buildMangaCandidatePayload(entry(77, 'Monster'), 'c01', DETAIL);

    expect(payload.token).toBe('c01');
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('manga-77');
    expect(serialised).not.toContain('cover.jpg');
  });

  it('withholds everything the deterministic pipeline ranked on', () => {
    const payload = buildMangaCandidatePayload(entry(77, 'Monster', 93), 'c01', DETAIL);

    expect(payload).not.toHaveProperty('rawScore');
    expect(payload).not.toHaveProperty('clusterMatch');
    expect(payload).not.toHaveProperty('deterministicRank');
    expect(payload).not.toHaveProperty('matchedSignals');
    expect(payload).not.toHaveProperty('reason');
  });

  it('names the flat MAL list `labels`, not `genres`', () => {
    // The list mixes genre, theme and demographic bracket. Calling it `genres` would invite the
    // model to treat a magazine's readership as a taste signal.
    const payload = buildMangaCandidatePayload(entry(1, 'Monster'), 'c01', DETAIL);

    expect(payload).not.toHaveProperty('genres');
    expect(payload.labels).toEqual(['Action', 'Psychological', 'Seinen']);
  });

  it('carries length and publication status, which the scorer has no access to', () => {
    const payload = buildMangaCandidatePayload(entry(1, 'Monster'), 'c01', DETAIL);

    expect(payload.totalChapters).toBe(162);
    expect(payload.totalVolumes).toBe(18);
    expect(payload.publicationStatus).toBe('finished');
    expect(payload.startYear).toBe(1994);
  });

  it('nulls missing details rather than dropping the candidate', () => {
    const payload = buildMangaCandidatePayload(entry(1, 'Monster'), 'c01', undefined);

    expect(payload.title).toBe('Monster');
    expect(payload.totalChapters).toBeNull();
    expect(payload.publicationStatus).toBeNull();
    expect(payload.synopsis).toBeNull();
  });
});

describe('loadMangaCandidateDetails', () => {
  function supabaseReturning(rows: unknown[], error: unknown = null) {
    const inSpy = jest.fn().mockResolvedValue({ data: rows, error });
    const selectSpy = jest.fn().mockReturnValue({ in: inSpy });
    const fromSpy = jest.fn().mockReturnValue({ select: selectSpy });
    return { client: { from: fromSpy } as never, fromSpy, selectSpy, inSpy };
  }

  it('reads a chapter total only when volumes stands beside it', async () => {
    // A populated `chapters` with a null `volumes` is the signature of the OAuth sync, and the
    // number in it is somebody's bookmark. A missing total is honest; a wrong one is fiction.
    const { client } = supabaseReturning([
      { id: 1, description: null, format: 'manga', chapters: 162, volumes: 18, status: 'finished', start_date: '1994-12-05' },
      { id: 2, description: null, format: 'manga', chapters: 20, volumes: null, status: 'currently_publishing', start_date: '2019-01-01' },
    ]);

    const details = await loadMangaCandidateDetails(client, [1, 2]);

    expect(details.get(1)?.totalChapters).toBe(162);
    expect(details.get(2)?.totalChapters).toBeNull();
    expect(details.get(2)?.publicationStatus).toBe('currently_publishing');
  });

  it('asks only for the ids it was given', async () => {
    const { client, inSpy } = supabaseReturning([]);

    await loadMangaCandidateDetails(client, [7, 8, 9]);

    expect(inSpy).toHaveBeenCalledWith('id', [7, 8, 9]);
  });

  it('does not query at all for an empty shortlist', async () => {
    const { client, fromSpy } = supabaseReturning([]);

    await expect(loadMangaCandidateDetails(client, [])).resolves.toEqual(new Map());
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('degrades to an empty map on a query failure rather than throwing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client } = supabaseReturning([], { message: 'boom' });

    await expect(loadMangaCandidateDetails(client, [1])).resolves.toEqual(new Map());
    jest.restoreAllMocks();
  });
});

describe('truncateMangaSynopsis', () => {
  it('truncates at a word boundary and marks the cut', () => {
    const result = truncateMangaSynopsis(`${'word '.repeat(200)}end`);

    expect(result!.length).toBeLessThanOrEqual(MANGA_RERANK_SYNOPSIS_MAX_CHARS + 1);
    expect(result!.endsWith('…')).toBe(true);
  });

  it('returns null for empty or missing text', () => {
    expect(truncateMangaSynopsis(null)).toBeNull();
    expect(truncateMangaSynopsis('  ')).toBeNull();
  });
});

describe('buildMangaTastePayload', () => {
  const profile = {
    identity: { label: 'Slow-burn Realist', description: 'Reads for accumulation.' },
    pillars: [
      {
        name: 'Long-form accumulation',
        kind: 'form' as const,
        description: 'Finishes long serialised runs.',
        evidenceTitles: ['Vinland Saga', 'Vagabond'],
        strengthBand: 'Defining' as const,
      },
    ],
    negativeSignals: [],
    summary: 'Reads long and finishes.',
    openQuestions: ['Unclear whether short series are avoided.'],
    dataQuality: { sufficiency: 'rich' },
  } as unknown as EnrichedAiMangaTasteProfile;

  it('keeps the pillar taxonomy manga actually uses', () => {
    expect(buildMangaTastePayload(profile).pillars[0].kind).toBe('form');
  });

  it('strips evidence titles and open questions', () => {
    const serialised = JSON.stringify(buildMangaTastePayload(profile));

    expect(serialised).not.toContain('Vagabond');
    expect(serialised).not.toContain('avoided');
  });
});

describe('the request envelope', () => {
  const candidates = ['Monster', 'Pluto', 'Vinland Saga', 'Vagabond'].map((title, index) =>
    buildMangaCandidatePayload(entry(index + 1, title), `c0${index + 1}`, DETAIL),
  );

  it('issues tokens in deterministic shortlist order', () => {
    const map = buildMangaTokenMap([entry(5, 'A'), entry(9, 'B')]);

    expect(map.tokens).toEqual(['c01', 'c02']);
    expect(map.toMediaId.get('c01')).toBe(5);
  });

  it('shuffles reproducibly, so a refresh cannot reshuffle its way to a new answer', () => {
    expect(shuffleMangaCandidates(candidates, 'seed-a')).toEqual(
      shuffleMangaCandidates(candidates, 'seed-a'),
    );
    expect(shuffleMangaCandidates(candidates, 'seed-a')).not.toEqual(
      shuffleMangaCandidates(candidates, 'seed-b'),
    );
  });

  it('stamps the payload version', () => {
    const taste = buildMangaTastePayload({
      identity: { label: 'L', description: 'D' },
      pillars: [],
      negativeSignals: [],
      summary: 'S',
      dataQuality: { sufficiency: 'rich' },
    } as unknown as EnrichedAiMangaTasteProfile);

    expect(buildMangaRerankRequestPayload(taste, candidates, 'seed').payloadVersion).toBe(
      'manga-rerank-payload-v1',
    );
  });
});

describe('buildMangaRerankPrompt', () => {
  const payload: MangaRerankRequestPayload = {
    payloadVersion: 'manga-rerank-payload-v1',
    taste: {
      identity: { label: 'L', description: 'D' },
      pillars: [],
      negativeSignals: [],
      summary: 'S',
      sufficiency: 'rich',
    },
    candidates: [],
  };

  it('forbids ranking on a demographic bracket', () => {
    const prompt = buildMangaRerankPrompt(payload);

    expect(prompt).toContain('Shounen, Seinen, Shoujo, Josei');
    expect(prompt).toContain('not a reader');
  });

  it('forbids reading a missing chapter total as a short series', () => {
    expect(buildMangaRerankPrompt(payload)).toContain(
      'Treat a null totalChapters as unknown, never as short',
    );
  });

  it('asks about publication status as a commitment decision', () => {
    expect(buildMangaRerankPrompt(payload)).toContain('currently-publishing');
  });

  it('forbids changing the candidate set', () => {
    expect(buildMangaRerankPrompt(payload)).toContain(
      'Do not add, remove, merge, rename or invent entries',
    );
  });

  it('demotes on negative signals rather than excluding', () => {
    expect(buildMangaRerankPrompt(payload)).toContain('demotion criterion, not an exclusion');
  });
});
