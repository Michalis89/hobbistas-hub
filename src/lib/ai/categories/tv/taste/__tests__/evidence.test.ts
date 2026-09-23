/**
 * The television evidence layer, and the collapse that makes it honest.
 *
 * A viewer who tracked five seasons of one show as five rows has made one decision about one show.
 * Left uncollapsed those rows would supply five citations and could carry a pillar alone, which is
 * the same failure Track A found on the movies side with actors. So seasons merge at the *identity*
 * level here — the most aggressive collapse in the app — and the arithmetic of that merge is what
 * most of these tests are about.
 */

import {
  buildTvAiEvidenceDocument,
  hashTvAiEvidence,
  isNearlyFinished,
} from '../evidence';
import { normalizeTvFamilyKey, normalizeTvIdentityKey } from '../normalizers';
import type { TvHistory, TvHistoryEntry } from '../history';

function entry(
  id: number,
  title: string,
  overrides: Partial<TvHistoryEntry> = {},
  media: Partial<TvHistoryEntry['media']> = {},
): TvHistoryEntry {
  return {
    id,
    mediaId: id,
    status: 'completed',
    score: 9,
    progress: null,
    isFavorite: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
    media: {
      id,
      title,
      genres: ['Drama'],
      totalEpisodes: 60,
      totalSeasons: 5,
      firstAirYear: 2008,
      ...media,
    },
  };
}

function history(
  entries: TvHistoryEntry[],
  authorship: TvHistory['authorship'] = { directors: [], actors: [] },
): TvHistory {
  return { entries, authorship };
}

describe('normalizeTvIdentityKey', () => {
  it.each([
    'Better Call Saul Season 3',
    'Better Call Saul: Season 3',
    'Better Call Saul S3',
    'Better Call Saul (Season 3)',
    'Better Call Saul - The Final Season',
    'Better Call Saul (2015)',
  ])('collapses %s onto the bare series key', variant => {
    expect(normalizeTvIdentityKey(variant)).toBe(normalizeTvIdentityKey('Better Call Saul'));
  });

  it('keeps unrelated shows apart', () => {
    expect(normalizeTvIdentityKey('Better Call Saul')).not.toBe(
      normalizeTvIdentityKey('Breaking Bad'),
    );
  });

  it('never reduces a title to nothing', () => {
    expect(normalizeTvIdentityKey('Season 1')).toBeTruthy();
  });
});

describe('normalizeTvFamilyKey', () => {
  it('groups franchise siblings that announce themselves', () => {
    expect(normalizeTvFamilyKey('Star Trek: Deep Space Nine')).toBe(
      normalizeTvFamilyKey('Star Trek: Voyager'),
    );
  });

  it('keeps a spin-off with a different name in its own family', () => {
    // Under-collapsing is the safe direction: it costs a guard, not a correctness claim.
    expect(normalizeTvFamilyKey('Better Call Saul')).not.toBe(normalizeTvFamilyKey('Breaking Bad'));
  });
});

describe('buildTvAiEvidenceDocument', () => {
  it('merges season rows into one series entry', () => {
    const document = buildTvAiEvidenceDocument(
      history([
        entry(1, 'The Wire Season 1'),
        entry(2, 'The Wire Season 2'),
        entry(3, 'The Wire Season 3'),
      ]),
    );

    expect(document.entries).toHaveLength(1);
    expect(document.entries[0].collapsedRowCount).toBe(3);
  });

  it('cites the series, not a season, so every entry names the same kind of thing', () => {
    const document = buildTvAiEvidenceDocument(history([entry(1, 'The Wire Season 2')]));

    expect(document.entries[0].representativeTitle).toBe('The Wire');
    // The row title stays citable, so a model quoting what it was shown still resolves.
    expect(document.entries[0].titles).toContain('The Wire Season 2');
  });

  it('sums episodes watched across merged rows rather than taking the maximum', () => {
    // Three seasons at ten episodes each is thirty watched, not ten.
    const document = buildTvAiEvidenceDocument(
      history([
        entry(1, 'The Wire Season 1', { progress: 10 }),
        entry(2, 'The Wire Season 2', { progress: 10 }),
        entry(3, 'The Wire Season 3', { progress: 10 }),
      ]),
    );

    expect(document.entries[0].episodesWatched).toBe(30);
    expect(document.entries[0].watchedRatio).toBe(0.5);
  });

  it('takes the episode total rather than summing it, because it is a series total per row', () => {
    const document = buildTvAiEvidenceDocument(
      history([
        entry(1, 'The Wire Season 1', { progress: 13 }, { totalEpisodes: 60 }),
        entry(2, 'The Wire Season 2', { progress: 12 }, { totalEpisodes: 60 }),
      ]),
    );

    expect(document.entries[0].totalEpisodes).toBe(60);
  });

  it('clamps the watched ratio when seasons were logged inconsistently', () => {
    const document = buildTvAiEvidenceDocument(
      history([
        entry(1, 'Show Season 1', { progress: 50 }, { totalEpisodes: 20 }),
        entry(2, 'Show Season 2', { progress: 50 }, { totalEpisodes: 20 }),
      ]),
    );

    expect(document.entries[0].watchedRatio).toBe(1);
  });

  it('keeps the most settled status when a finished season sits beside an abandoned one', () => {
    const document = buildTvAiEvidenceDocument(
      history([
        entry(1, 'Show Season 1', { status: 'dropped' }),
        entry(2, 'Show Season 2', { status: 'completed' }),
      ]),
    );

    expect(document.entries[0].status).toBe('completed');
  });

  it('treats a deep in-progress series as near-completion evidence, not half a signal', () => {
    const deep = buildTvAiEvidenceDocument(
      history([entry(1, 'Show', { status: 'current', score: null, progress: 50 })]),
    );
    const early = buildTvAiEvidenceDocument(
      history([entry(1, 'Show', { status: 'current', score: null, progress: 2 })]),
    );

    expect(deep.entries[0].weight).toBeGreaterThan(early.entries[0].weight * 2);
  });

  it('recomputes the aversion grade after a merge rather than inheriting it', () => {
    const document = buildTvAiEvidenceDocument(
      history([
        entry(1, 'Show Season 1', { status: 'dropped', score: null, progress: 2 }),
        entry(2, 'Show Season 2', { isFavorite: true }),
      ]),
    );

    expect(document.entries[0].aversionEvidence).toBe('none');
  });

  it('excludes planned entries', () => {
    const document = buildTvAiEvidenceDocument(
      history([entry(1, 'Show A'), entry(2, 'Show B', { status: 'planned' })]),
    );

    expect(document.entries).toHaveLength(1);
  });

  it('reports how much of the library has an episode total at all', () => {
    const document = buildTvAiEvidenceDocument(
      history([entry(1, 'Show A'), entry(2, 'Show B', {}, { totalEpisodes: null })]),
    );

    expect(document.dataQuality.episodeDataRatio).toBe(0.5);
  });

  it('carries derived authorship and says whether it had anything in it', () => {
    const withCredits = buildTvAiEvidenceDocument(
      history([entry(1, 'Show')], { directors: ['Vince Gilligan'], actors: [] }),
    );

    expect(withCredits.authorship.directors).toEqual(['Vince Gilligan']);
    expect(withCredits.dataQuality.hasAuthorship).toBe(true);
    expect(buildTvAiEvidenceDocument(history([entry(1, 'Show')])).dataQuality.hasAuthorship).toBe(
      false,
    );
  });

  it('hashes the same library the same way regardless of row order', () => {
    const forward = buildTvAiEvidenceDocument(
      history([entry(1, 'Show A', { score: 6 }), entry(2, 'Show B', { score: 10 })]),
    );
    const reversed = buildTvAiEvidenceDocument(
      history([entry(2, 'Show B', { score: 10 }), entry(1, 'Show A', { score: 6 })]),
    );

    expect(hashTvAiEvidence(forward, 'model-a')).toBe(hashTvAiEvidence(reversed, 'model-a'));
    expect(hashTvAiEvidence(forward, 'model-a')).not.toBe(hashTvAiEvidence(forward, 'model-b'));
  });
});

describe('isNearlyFinished', () => {
  it('treats stopping two thirds of the way in as a real verdict', () => {
    expect(isNearlyFinished(0.65)).toBe(false);
  });

  it('treats stopping past seventy percent as a stall', () => {
    // Looser than films: a viewer four seasons into six has run out of momentum, not patience.
    expect(isNearlyFinished(0.75)).toBe(true);
  });

  it('answers null when no episode total is known', () => {
    expect(isNearlyFinished(null)).toBeNull();
  });
});
