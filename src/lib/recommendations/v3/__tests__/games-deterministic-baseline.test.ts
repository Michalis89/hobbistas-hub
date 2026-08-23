import { buildGamesRecommendations } from '../games/games-recommendation-engine';
import { buildBaselineInput } from '../__fixtures__/games-baseline';

/**
 * Pins the exact deterministic output for a fixed library + candidate pool.
 *
 * This snapshot is the contract that the Phase 2 foundation work (selection-helper extraction,
 * shadow-only shortlist, widened candidate metadata) is not allowed to move. It intentionally
 * asserts titles, subtypes, ordering AND scores: a change to any of them is a change to what a
 * user sees.
 */
describe('games deterministic baseline', () => {
  it('produces the pinned backlog picks', () => {
    const result = buildGamesRecommendations(buildBaselineInput());

    expect(
      result.backlogPicks.map(item => ({
        title: item.title,
        subtype: item.subtype,
        score: item.score,
      })),
    ).toEqual(BASELINE_BACKLOG);
  });

  it('produces the pinned possible-next picks', () => {
    const result = buildGamesRecommendations(buildBaselineInput());

    expect(
      result.possibleNext.map(item => ({
        mediaId: item.mediaId,
        title: item.title,
        subtype: item.subtype,
        score: item.score,
        confidence: item.confidence,
      })),
    ).toEqual(BASELINE_POSSIBLE_NEXT);
  });

  it('is stable across repeated invocations', () => {
    const first = buildGamesRecommendations(buildBaselineInput());
    const second = buildGamesRecommendations(buildBaselineInput());

    expect(JSON.stringify(second.possibleNext)).toEqual(JSON.stringify(first.possibleNext));
    expect(JSON.stringify(second.backlogPicks)).toEqual(JSON.stringify(first.backlogPicks));
  });
});

const BASELINE_BACKLOG: Array<{ title: string; subtype: string; score: number }> = [
  { title: 'Final Fantasy VII Remake', subtype: 'best_fit', score: 82 },
  { title: 'Sekiro: Shadows Die Twice', subtype: 'best_fit', score: 100 },
  { title: 'Returnal', subtype: 'best_fit', score: 62 },
  { title: 'Death Stranding', subtype: 'best_fit', score: 50 },
];

const BASELINE_POSSIBLE_NEXT: Array<{
  mediaId: number;
  title: string;
  subtype: string;
  score: number;
  confidence: number;
}> = [
  {
    mediaId: 1001,
    title: 'God of War Ragnarök',
    subtype: 'continuation',
    score: 100,
    confidence: 1,
  },
  {
    mediaId: 1002,
    title: 'Horizon Forbidden West',
    subtype: 'continuation',
    score: 100,
    confidence: 1,
  },
  {
    mediaId: 1005,
    title: 'Mass Effect Legendary Edition',
    subtype: 'discovery',
    score: 100,
    confidence: 1,
  },
  { mediaId: 1014, title: 'Lies of P', subtype: 'discovery', score: 100, confidence: 1 },
];
