/**
 * @jest-environment node
 *
 * Games behaviour is frozen.
 *
 * Every value asserted here was captured from the pre-refactor implementation and is a live
 * production identity: `evidenceHash` keys every stored `ai_taste_profiles` row and
 * `rerankInputHash` keys every `ai_rerank_cache` row. A change to any of them silently invalidates
 * a real cache and, in the rerank case, splits the shadow corpus into two incomparable halves.
 *
 * So a failure here is not "update the golden". It means either a genuine behaviour change was
 * introduced by accident, or a deliberate change was made that needs an explicit version bump and
 * a note about what happens to the existing rows.
 */

jest.mock('server-only', () => ({}), { virtual: true });

import { blendOrders } from '../rerank/blend';
import { computeRerankInputHash, computeShuffleSeed } from '../rerank/hash';
import {
  buildCandidatePayload,
  buildRerankRequestPayload,
  buildTastePayload,
  buildTokenMap,
  fingerprintCandidates,
  fingerprintTaste,
  shuffleCandidates,
} from '../rerank/payload';
import { buildGameAiEvidenceDocument, hashGameAiEvidence } from '../taste/evidence';
import goldens from '../__fixtures__/games-ai-goldens.json';
import {
  GAMES_FIXTURE_AI_ORDER,
  GAMES_FIXTURE_AI_WEIGHT,
  GAMES_FIXTURE_DETERMINISTIC_ORDER,
  GAMES_FIXTURE_HISTORY,
  GAMES_FIXTURE_MODEL,
  GAMES_FIXTURE_PROFILE,
  GAMES_FIXTURE_SHORTLIST,
  GAMES_FIXTURE_SHUFFLE_SEED,
  GAMES_FIXTURE_TASTE_INPUT_HASH,
} from '../__fixtures__/games-ai-fixture';

const evidence = buildGameAiEvidenceDocument(GAMES_FIXTURE_HISTORY);
const taste = buildTastePayload(GAMES_FIXTURE_PROFILE);
const tokenMap = buildTokenMap(GAMES_FIXTURE_SHORTLIST);
const candidates = GAMES_FIXTURE_SHORTLIST.map((entry, index) =>
  buildCandidatePayload(entry, tokenMap.tokens[index], entry.candidate.summary ?? null),
);
const rerankInputHash = computeRerankInputHash({
  tasteInputHash: GAMES_FIXTURE_TASTE_INPUT_HASH,
  taste,
  candidates,
  shortlistMediaIds: GAMES_FIXTURE_SHORTLIST.map(entry => entry.candidate.id),
  model: GAMES_FIXTURE_MODEL,
});

describe('games taste evidence', () => {
  it('produces the same evidence document for the fixture library', () => {
    expect(evidence).toEqual(goldens.evidence);
  });

  it('excludes planned entries from the evidence document', () => {
    const titles = evidence.entries.flatMap(entry => entry.titles);
    expect(titles).not.toContain('Stardew Valley');
  });

  it('produces the same evidence hash, which is the live taste cache key', () => {
    expect(hashGameAiEvidence(evidence, GAMES_FIXTURE_MODEL)).toBe(goldens.evidenceHash);
  });
});

describe('games rerank payload', () => {
  it('issues the same tokens in deterministic shortlist order', () => {
    expect(tokenMap.tokens).toEqual(goldens.tokens);
  });

  it('builds the same taste payload', () => {
    expect(taste).toEqual(goldens.tastePayload);
  });

  it('omits evidence titles and open questions from the taste payload', () => {
    expect(taste).not.toHaveProperty('openQuestions');
    for (const pillar of taste.pillars) {
      expect(pillar).not.toHaveProperty('evidenceTitles');
    }
  });

  it('builds the same candidate payloads', () => {
    expect(candidates).toEqual(goldens.candidates);
  });

  it('produces the same taste and candidate fingerprints', () => {
    expect(fingerprintTaste(taste)).toBe(goldens.tasteFingerprint);
    expect(fingerprintCandidates(candidates)).toBe(goldens.candidateFingerprint);
  });
});

describe('games rerank hashing and shuffle', () => {
  it('produces the same rerank input hash, which is the live rerank cache key', () => {
    expect(rerankInputHash).toBe(goldens.rerankInputHash);
  });

  it('derives the same shuffle seed', () => {
    expect(computeShuffleSeed(rerankInputHash)).toBe(goldens.shuffleSeed);
  });

  it('produces the same deterministic shuffle for a fixed seed', () => {
    expect(shuffleCandidates(candidates, GAMES_FIXTURE_SHUFFLE_SEED).map(c => c.token)).toEqual(
      goldens.fixedSeedShuffleTokens,
    );
  });

  it('sends the same shuffled request payload for the fixture question', () => {
    const payload = buildRerankRequestPayload(
      taste,
      candidates,
      computeShuffleSeed(rerankInputHash),
    );
    expect(payload.candidates.map(candidate => candidate.token)).toEqual(goldens.shuffledTokens);
    // Shuffled, not sorted: sending the list in rank order would make "the AI agrees"
    // indistinguishable from "the AI copied the order it was given".
    expect(payload.candidates.map(candidate => candidate.token)).not.toEqual(tokenMap.tokens);
  });
});

describe('games rerank blend', () => {
  const blend = blendOrders({
    deterministicOrder: GAMES_FIXTURE_DETERMINISTIC_ORDER,
    aiOrder: GAMES_FIXTURE_AI_ORDER,
    aiWeight: GAMES_FIXTURE_AI_WEIGHT,
  });

  it('produces the same blended order', () => {
    expect(blend.order).toEqual(goldens.blendOrder);
  });

  it('produces the same blended scores', () => {
    expect([...blend.scores.entries()]).toEqual(goldens.blendScores);
  });

  it('reports the same rank-one guard outcome and records the games blend version', () => {
    expect(blend.rankOneGuardTriggered).toBe(goldens.blendRankOneGuardTriggered);
    expect(blend.blendVersion).toBe('games-rerank-blend-v1');
    expect(blend.aiWeight).toBe(GAMES_FIXTURE_AI_WEIGHT);
  });
});
