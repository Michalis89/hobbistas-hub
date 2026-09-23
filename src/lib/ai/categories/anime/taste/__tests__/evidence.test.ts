/** @jest-environment node */

import { ANIME_MIN_TASTE_EVIDENCE_TITLES } from '@/lib/ai/capabilities';
import { ANIME_FIXTURE_HISTORY, animeEntry } from '../../__fixtures__/anime-history.fixture';
import {
  bandAnimeProgress,
  buildAnimeAiEvidenceDocument,
  computeAnimeEvidenceWeight,
  hashAnimeAiEvidence,
} from '../evidence';
import { ANIME_AI_EVIDENCE_WEIGHTS } from '../types';

function build(history = ANIME_FIXTURE_HISTORY) {
  return buildAnimeAiEvidenceDocument(history);
}

function titlesOf(document: ReturnType<typeof build>): string[] {
  return document.entries.flatMap(entry => entry.titles);
}

describe('status handling', () => {
  it('excludes planned entries entirely — a backlog is intent, not taste', () => {
    expect(titlesOf(build())).not.toContain('Ping Pong the Animation');
  });

  it('includes completed, current and dropped entries', () => {
    const titles = titlesOf(build());
    expect(titles).toContain('Attack on Titan');
    expect(titles).toContain('Frieren');
    expect(titles).toContain('Sword Art Online');
  });

  it('excludes music videos and promos, which are not storytelling', () => {
    const document = build([
      ...ANIME_FIXTURE_HISTORY,
      animeEntry({
        id: 90,
        title: 'Some Band MV',
        status: 'completed',
        score: 9,
        media: { format: 'music', episodes: 1 },
      }),
    ]);
    expect(titlesOf(document)).not.toContain('Some Band MV');
  });
});

describe('positive evidence weighting', () => {
  it('rates a favourited 10 as the strongest signal available', () => {
    const weight = computeAnimeEvidenceWeight(
      animeEntry({ id: 1, title: 'X', status: 'completed', score: 10, isFavorite: true }),
    );
    expect(weight).toBe(ANIME_AI_EVIDENCE_WEIGHTS.completedFavoriteScore9);
  });

  it('ranks a favourite above an unfavourited 9', () => {
    const favorite = computeAnimeEvidenceWeight(
      animeEntry({ id: 1, title: 'X', status: 'completed', score: 7, isFavorite: true }),
    );
    const highScore = computeAnimeEvidenceWeight(
      animeEntry({ id: 2, title: 'Y', status: 'completed', score: 9 }),
    );
    expect(favorite).toBeGreaterThan(highScore);
  });

  it('treats an unrated completion as mildly positive, not neutral', () => {
    const weight = computeAnimeEvidenceWeight(
      animeEntry({ id: 1, title: 'X', status: 'completed' }),
    );
    expect(weight).toBe(ANIME_AI_EVIDENCE_WEIGHTS.completedUnrated);
    expect(weight).toBeGreaterThan(0);
  });

  it('treats a completed low score as negative evidence', () => {
    const weight = computeAnimeEvidenceWeight(
      animeEntry({ id: 1, title: 'X', status: 'completed', score: 3 }),
    );
    expect(weight).toBeLessThan(0);
  });

  it('weights an in-progress series by how far in the viewer is', () => {
    const deep = computeAnimeEvidenceWeight(
      animeEntry({
        id: 1,
        title: 'X',
        status: 'current',
        progress: 20,
        media: { episodes: 24 },
      }),
    );
    const shallow = computeAnimeEvidenceWeight(
      animeEntry({
        id: 2,
        title: 'Y',
        status: 'current',
        progress: 1,
        media: { episodes: 24 },
      }),
    );
    expect(deep).toBe(ANIME_AI_EVIDENCE_WEIGHTS.currentPastHalf);
    expect(shallow).toBe(ANIME_AI_EVIDENCE_WEIGHTS.currentEarly);
    expect(deep).toBeGreaterThan(shallow);
  });
});

describe('progress-aware dropped signal', () => {
  const dropped = (progress: number | null, episodes: number | null) =>
    computeAnimeEvidenceWeight(
      animeEntry({ id: 1, title: 'X', status: 'dropped', progress, media: { episodes } }),
    );

  it('treats an early bail as the strongest unrated aversion signal', () => {
    expect(dropped(2, 12)).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedBailed);
  });

  it('treats a late drop as much weaker evidence than an early one', () => {
    // The core anime claim: 40/50 watched means the show largely worked. Reading that as equal
    // dislike to an episode-2 bail would manufacture an aversion out of a stall.
    expect(dropped(40, 50)).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedLate);
    expect(Math.abs(dropped(40, 50))).toBeLessThan(Math.abs(dropped(1, 12)));
  });

  it('places a mid-series drop between the two', () => {
    const early = Math.abs(dropped(1, 12));
    const mid = Math.abs(dropped(5, 12));
    const late = Math.abs(dropped(11, 12));
    expect(mid).toBeLessThan(early);
    expect(mid).toBeGreaterThan(late);
  });

  it('grades episode 3 of 12 and episode 18 of 24 differently', () => {
    expect(Math.abs(dropped(3, 12))).toBeGreaterThan(Math.abs(dropped(18, 24)));
  });

  it('lets a stated score override the drop point in both directions', () => {
    const hatedLate = computeAnimeEvidenceWeight(
      animeEntry({
        id: 1,
        title: 'X',
        status: 'dropped',
        score: 2,
        progress: 40,
        media: { episodes: 50 },
      }),
    );
    const likedEarly = computeAnimeEvidenceWeight(
      animeEntry({
        id: 2,
        title: 'Y',
        status: 'dropped',
        score: 8,
        progress: 1,
        media: { episodes: 50 },
      }),
    );
    expect(hatedLate).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedScore4OrLower);
    expect(likedEarly).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedScore7OrHigher);
  });

  it('falls back to raw episode counts when the total is unknown', () => {
    // No completion percentage is invented: "stopped after 2 episodes" stands on its own.
    expect(dropped(2, null)).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedBailed);
    expect(dropped(8, null)).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedMidway);
    expect(dropped(60, null)).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedLate);
  });

  it('uses an unqualified weight when no progress was recorded at all', () => {
    expect(dropped(null, 12)).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedUnknownProgress);
    expect(dropped(null, null)).toBe(ANIME_AI_EVIDENCE_WEIGHTS.droppedUnratedUnknownProgress);
  });

  it('bands progress without fabricating a ratio when the total is missing', () => {
    expect(bandAnimeProgress('dropped', null, null)).toBe('unknown');
    expect(bandAnimeProgress('dropped', 2, null)).toBe('bailed');
    // Exactly a quarter is still a bail — the band is documented as "a quarter or less".
    expect(bandAnimeProgress('dropped', 6, 24)).toBe('bailed');
    expect(bandAnimeProgress('dropped', 8, 24)).toBe('partial');
    expect(bandAnimeProgress('dropped', 20, 24)).toBe('most');
    expect(bandAnimeProgress('completed', null, null)).toBe('complete');
  });
});

describe('derivative entries', () => {
  it('halves the weight of an OVA relative to the same verdict on a series', () => {
    const series = computeAnimeEvidenceWeight(
      animeEntry({ id: 1, title: 'X', status: 'completed', score: 9 }),
    );
    const ova = computeAnimeEvidenceWeight(
      animeEntry({
        id: 2,
        title: 'X OVA',
        status: 'completed',
        score: 9,
        media: { format: 'ova' },
      }),
    );
    expect(ova).toBeCloseTo(series * 0.5, 5);
  });

  it('does not let a recap represent a family that has a real entry', () => {
    const document = build([
      animeEntry({
        id: 1,
        title: 'Clannad Recap',
        status: 'completed',
        score: 10,
        isFavorite: true,
        media: { format: 'special' },
      }),
      animeEntry({ id: 2, title: 'Clannad', status: 'completed', score: 8 }),
    ]);
    const family = document.entries.find(entry => entry.franchiseKey.startsWith('clannad'));
    expect(family?.representativeTitle).toBe('Clannad');
    expect(family?.derivative).toBe(false);
  });

  it('treats a film as a real work rather than a derivative', () => {
    const weight = computeAnimeEvidenceWeight(
      animeEntry({
        id: 1,
        title: 'A Silent Voice',
        status: 'completed',
        score: 9,
        media: { format: 'movie', episodes: 1 },
      }),
    );
    expect(weight).toBe(ANIME_AI_EVIDENCE_WEIGHTS.completedScore9);
  });
});

describe('data quality', () => {
  it('counts collapsed families rather than raw library rows', () => {
    const document = build();
    // Thirteen rows in, one planned, and three Attack on Titan seasons collapsed to one.
    expect(document.dataQuality.titleCount).toBe(document.entries.length);
    expect(document.dataQuality.titleCount).toBeLessThan(ANIME_FIXTURE_HISTORY.length);
  });

  it('reports the fixture library as adequate or better', () => {
    expect(build().dataQuality.sufficiency).not.toBe('sparse');
  });

  it('reports sparse below the anime threshold', () => {
    const small = build(ANIME_FIXTURE_HISTORY.slice(0, 4));
    expect(small.dataQuality.titleCount).toBeLessThan(ANIME_MIN_TASTE_EVIDENCE_TITLES);
    expect(small.dataQuality.sufficiency).toBe('sparse');
  });

  it('surfaces how much episode-total data backed the drop reasoning', () => {
    const document = build([
      ...ANIME_FIXTURE_HISTORY,
      animeEntry({
        id: 91,
        title: 'Unknown Length Show',
        status: 'dropped',
        progress: 4,
        media: { episodes: null },
      }),
    ]);
    expect(document.dataQuality.episodeDataRatio).toBeGreaterThan(0);
    expect(document.dataQuality.episodeDataRatio).toBeLessThan(1);
  });
});

describe('evidence hash', () => {
  it('is stable for an unchanged library, so a repeat load cache-hits', () => {
    expect(hashAnimeAiEvidence(build(), 'gemini-3.6-flash')).toBe(
      hashAnimeAiEvidence(build(), 'gemini-3.6-flash'),
    );
  });

  it('is unaffected by the order rows arrive in', () => {
    const reversed = [...ANIME_FIXTURE_HISTORY].reverse();
    expect(hashAnimeAiEvidence(build(reversed))).toBe(hashAnimeAiEvidence(build()));
  });

  it('changes when the library changes', () => {
    const extended = build([
      ...ANIME_FIXTURE_HISTORY,
      animeEntry({ id: 40, title: 'Ping Pong the Animation', status: 'completed', score: 9 }),
    ]);
    expect(hashAnimeAiEvidence(extended)).not.toBe(hashAnimeAiEvidence(build()));
  });

  it('changes when a rating changes without any title changing', () => {
    const rerated = ANIME_FIXTURE_HISTORY.map(entry =>
      entry.id === 6 ? { ...entry, score: 5 } : entry,
    );
    expect(hashAnimeAiEvidence(build(rerated))).not.toBe(hashAnimeAiEvidence(build()));
  });

  it('changes when the model changes', () => {
    expect(hashAnimeAiEvidence(build(), 'model-a')).not.toBe(
      hashAnimeAiEvidence(build(), 'model-b'),
    );
  });

  it('does not collide with the games hash for a comparable library', () => {
    // Different preprocessing versions and different document shapes; asserted because both
    // categories share one table and one `input_hash` column.
    expect(hashAnimeAiEvidence(build())).toHaveLength(64);
  });
});
