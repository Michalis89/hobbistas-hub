import type { MediaCandidate, MediaHistoryEntry, ScoredItem } from '../../types';
import {
  buildTvReason,
  buildTvSeriesProfile,
  calibrateTvConfidence,
  filterTvCandidates,
  scoreTvBacklogItem,
  scoreTvDiscoveryCandidate,
} from '../tv-series-engine';

function historyEntry(params: {
  id: number;
  title: string;
  status: MediaHistoryEntry['status'];
  genres: string[];
  score?: number | null;
  favorite?: boolean;
  progress?: number | null;
}): MediaHistoryEntry {
  return {
    id: params.id,
    mediaId: params.id,
    status: params.status,
    score: params.score ?? null,
    progress: params.progress ?? null,
    priority: null,
    isFavorite: params.favorite ?? false,
    pinnedRank: null,
    updatedAt: '2026-04-08T00:00:00.000Z',
    media: {
      id: params.id,
      title: params.title,
      category: 'tv',
      genres: params.genres,
    },
  };
}

function candidate(id: number, title: string, genres: string[], popularityScore = 70): MediaCandidate {
  return {
    id,
    title,
    slug: `tv-${id}`,
    cover: '',
    category: 'tv',
    genres,
    themes: [],
    platforms: [],
    popularityScore,
  };
}

function scoredFromCandidate(input: MediaCandidate): ScoredItem {
  return {
    mediaDbId: input.id,
    title: input.title,
    cover: input.cover,
    slug: input.slug,
    genres: input.genres,
    themes: [],
    platforms: [],
    source: 'discovery',
    rawScore: 82,
    confidence: 0.85,
    clusterMatch: null,
    toneMatch: null,
    franchiseKey: null,
    matchedSignals: [],
    reason: '',
  };
}

describe('tv series engine', () => {
  const history: MediaHistoryEntry[] = [
    historyEntry({
      id: 1,
      title: 'Game of Thrones Season 1',
      status: 'completed',
      genres: ['Drama', 'Fantasy', 'Adventure'],
      score: 10,
      favorite: true,
      progress: 100,
    }),
    historyEntry({
      id: 2,
      title: 'Game of Thrones Season 2',
      status: 'completed',
      genres: ['Drama', 'Fantasy', 'Adventure'],
      score: 9.5,
      favorite: true,
      progress: 100,
    }),
    historyEntry({
      id: 3,
      title: 'Dark Season 1',
      status: 'completed',
      genres: ['Drama', 'Mystery', 'Science Fiction', 'Thriller'],
      score: 9.5,
      favorite: true,
      progress: 100,
    }),
    historyEntry({
      id: 4,
      title: 'Dark Season 2',
      status: 'current',
      genres: ['Drama', 'Mystery', 'Science Fiction', 'Thriller'],
      score: 9,
      progress: 78,
    }),
    historyEntry({
      id: 5,
      title: 'The Crown Season 1',
      status: 'completed',
      genres: ['Drama', 'History'],
      score: 9,
      progress: 100,
    }),
    historyEntry({
      id: 6,
      title: 'Random Sitcom Pilot',
      status: 'current',
      genres: ['Comedy'],
      score: 5.5,
      progress: 10,
    }),
  ];

  it('builds core tv profile with strong retention and anti-drift', () => {
    const profile = buildTvSeriesProfile(history);

    expect(profile.normalizedAxes.mythicFantasySaga).toBeGreaterThan(0.4);
    expect(profile.normalizedAxes.prestigeReflectiveSciFi).toBeGreaterThan(0.5);
    expect(profile.retention.seasonLoyalty).toBeGreaterThanOrEqual(0.4);
    expect(profile.retention.multiSeasonPatience).toBeGreaterThanOrEqual(0.5);
    expect(profile.peripheralAxes.comfortAdventureSerial).toBeLessThan(
      profile.coreAxes.comfortAdventureSerial,
    );
  });

  it('prioritizes continuation and long-form commitment in backlog', () => {
    const profile = buildTvSeriesProfile(history);

    const continuation = historyEntry({
      id: 100,
      title: 'Dark Season 3',
      status: 'planned',
      genres: ['Drama', 'Mystery', 'Science Fiction', 'Thriller'],
    });
    const lowCommitment = historyEntry({
      id: 101,
      title: 'New Light Sitcom',
      status: 'planned',
      genres: ['Comedy'],
    });

    const continuationScore = scoreTvBacklogItem(
      continuation,
      { history, favoriteRate: 0.3 } as unknown as Parameters<typeof scoreTvBacklogItem>[1],
      profile,
    );
    const lowCommitmentScore = scoreTvBacklogItem(
      lowCommitment,
      { history, favoriteRate: 0.3 } as unknown as Parameters<typeof scoreTvBacklogItem>[1],
      profile,
    );

    expect(continuationScore).toBeGreaterThan(lowCommitmentScore);
    expect(continuationScore).toBeGreaterThan(60);
  });

  it('filters mismatched candidates and keeps tv-native quality gates', () => {
    const profile = buildTvSeriesProfile(history);

    const filtered = filterTvCandidates(
      [
        candidate(200, 'Foundation', ['Science Fiction', 'Drama', 'Mystery'], 82),
        candidate(201, 'Kids Laugh Club', ['Animation', 'Family', 'Comedy'], 88),
        candidate(202, 'Unknown Low Signal', ['Comedy'], 28),
      ],
      {
        history,
        clusters: [],
        toneProfile: { primaryTone: 'x', toneLabels: [], confidence: 0.5 },
        topGenres: [],
        topThemes: [],
        topPlayerStyles: [],
        topPlatforms: [],
        completionRate: 0,
        favoriteRate: 0,
        completedFranchiseKeys: new Set(),
        libraryIds: new Set(),
        avoidedGenreKeys: new Set(),
        loveGenreKeys: new Set(['drama', 'mystery', 'sci-fi-fantasy', 'fantasy']),
      },
      profile,
    );

    expect(filtered.some(item => item.id === 200)).toBe(true);
    expect(filtered.some(item => item.id === 201)).toBe(false);
    expect(filtered.some(item => item.id === 202)).toBe(false);
  });

  it('calibrates confidence in healthy ranges and keeps tv-native explanation language', () => {
    const profile = buildTvSeriesProfile(history);
    const strong = candidate(300, 'Severance', ['Drama', 'Mystery', 'Science Fiction', 'Thriller'], 84);
    const weaker = candidate(301, 'Action Weekly', ['Action', 'Adventure'], 78);

    const strongScore = scoreTvDiscoveryCandidate(strong, 40, profile);
    const weakScore = scoreTvDiscoveryCandidate(weaker, 40, profile);

    const strongConfidence = calibrateTvConfidence(scoredFromCandidate(strong), profile);
    const weakConfidence = calibrateTvConfidence(scoredFromCandidate(weaker), profile);
    const reason = buildTvReason(scoredFromCandidate(strong), profile).toLowerCase();

    expect(strongScore).toBeGreaterThan(weakScore);
    expect(strongConfidence).toBeGreaterThanOrEqual(0.75);
    expect(weakConfidence).toBeLessThan(strongConfidence);
    expect(reason).toContain('retention');
    expect(reason).not.toContain('cinematic scale');
  });

  it('demotes animation-family mismatch candidates for this profile', () => {
    const profile = buildTvSeriesProfile(history);
    const doraemonLike = candidate(400, 'Doraemon', ['Animation', 'Family', 'Comedy'], 90);
    const mysteryFit = candidate(401, 'The Mentalist', ['Crime', 'Drama', 'Mystery'], 82);

    const doraemonScore = scoreTvDiscoveryCandidate(doraemonLike, 40, profile);
    const mentalistScore = scoreTvDiscoveryCandidate(mysteryFit, 40, profile);
    const doraemonConfidence = calibrateTvConfidence(scoredFromCandidate(doraemonLike), profile);
    const doraemonReason = buildTvReason(scoredFromCandidate(doraemonLike), profile).toLowerCase();

    expect(doraemonScore).toBeLessThan(60);
    expect(doraemonConfidence).toBeLessThan(0.6);
    expect(doraemonScore).toBeLessThan(mentalistScore);
    expect(doraemonReason).toContain('family-animation');
  });

  it('does not label non-sci-fi crime drama as reflective sci-fi', () => {
    const profile = buildTvSeriesProfile(history);
    const peakyLike = candidate(402, 'Peaky Blinders', ['Crime', 'Drama'], 84);
    const reason = buildTvReason(scoredFromCandidate(peakyLike), profile).toLowerCase();

    expect(reason).not.toContain('reflective sci-fi');
  });
});
