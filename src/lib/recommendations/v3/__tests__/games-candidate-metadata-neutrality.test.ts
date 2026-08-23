/**
 * The semantic metadata added to GameCandidate exists to describe a candidate to something other
 * than the genre/theme matcher. It must not reach the matcher itself.
 *
 * This runs the whole engine twice over identical inputs — once with the new fields absent, once
 * with them populated with values chosen to be maximally tempting to a scorer (a beloved studio,
 * a recent release, a summary stuffed with the user's core genre words) — and asserts the output
 * is deeply identical, scores and shortlist included.
 */

import { buildGamesRecommendations } from '../games/games-recommendation-engine';
import { buildBaselineInput } from '../__fixtures__/games-baseline';
import type { GameCandidate, RecommendationEngineInput } from '../games/games-types';

function enrich(candidate: GameCandidate, index: number): GameCandidate {
  return {
    ...candidate,
    developer: index % 2 === 0 ? 'Santa Monica Studio' : 'FromSoftware',
    studios: ['Sony Interactive Entertainment', 'Guerrilla Games'],
    releaseDate: `20${10 + (index % 15)}-06-01`,
    gameModes: ['Single player', 'Co-operative'],
    playerPerspectives: ['Third person', 'First person'],
    summary:
      'A cinematic, authored, narrative-driven role-playing adventure with methodical combat, ' +
      'stealth traversal and dark fantasy themes.',
  };
}

function enrichedInput(): RecommendationEngineInput {
  const input = buildBaselineInput();
  return {
    ...input,
    databaseCandidates: input.databaseCandidates.map(enrich),
  };
}

/** The new fields ride along on the shortlist, so they are stripped before comparing. */
function stripCandidateMetadata(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, entry) => {
      if (
        key === 'developer' ||
        key === 'studios' ||
        key === 'releaseDate' ||
        key === 'gameModes' ||
        key === 'playerPerspectives' ||
        key === 'summary'
      ) {
        return undefined;
      }
      return entry;
    }),
  );
}

describe('GameCandidate semantic metadata is inert for deterministic scoring', () => {
  const bare = buildGamesRecommendations(buildBaselineInput());
  const enriched = buildGamesRecommendations(enrichedInput());

  it('produces identical possible-next picks', () => {
    expect(stripCandidateMetadata(enriched.possibleNext)).toEqual(
      stripCandidateMetadata(bare.possibleNext),
    );
  });

  it('produces identical backlog picks', () => {
    expect(stripCandidateMetadata(enriched.backlogPicks)).toEqual(
      stripCandidateMetadata(bare.backlogPicks),
    );
  });

  it('produces an identical discovery shortlist, order and scores included', () => {
    expect(stripCandidateMetadata(enriched.shadowContext.discoveryShortlist)).toEqual(
      stripCandidateMetadata(bare.shadowContext.discoveryShortlist),
    );
  });

  it('produces an identical continuation context', () => {
    expect(enriched.shadowContext.continuationContext).toEqual(
      bare.shadowContext.continuationContext,
    );
  });

  it('does carry the metadata through to the shortlist, so the test above is meaningful', () => {
    const entry = enriched.shadowContext.discoveryShortlist[0];

    expect(entry.candidate.developer).toBeTruthy();
    expect(entry.candidate.summary).toContain('narrative-driven');
    expect(entry.candidate.gameModes).toEqual(['Single player', 'Co-operative']);
  });
});
