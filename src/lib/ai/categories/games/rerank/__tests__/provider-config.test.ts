/**
 * Generation-config knobs, pinned because three live runs turned on them.
 *
 * Latency here is dominated by reasoning tokens, not by the ranking: cutting the candidate list
 * from twenty to twelve moved a run by seven milliseconds, while the only run that completed did
 * so because it hit a token cap and stopped generating.
 */
jest.mock('server-only', () => ({}), { virtual: true });

import {
  DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS,
  DEFAULT_GEMINI_RERANK_THINKING_BUDGET,
  getGeminiRerankMaxOutputTokens,
  getGeminiRerankThinkingBudget,
} from '../provider';
import { getRerankShortlistSize } from '../service';
import { GAME_RERANK_MAX_SHORTLIST, GAME_RERANK_MIN_SHORTLIST } from '../types';

describe('getGeminiRerankThinkingBudget', () => {
  const original = process.env.GEMINI_RERANK_THINKING_BUDGET;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GEMINI_RERANK_THINKING_BUDGET;
    } else {
      process.env.GEMINI_RERANK_THINKING_BUDGET = original;
    }
  });

  it('asks for no reasoning by default', () => {
    delete process.env.GEMINI_RERANK_THINKING_BUDGET;
    expect(getGeminiRerankThinkingBudget()).toBe(DEFAULT_GEMINI_RERANK_THINKING_BUDGET);
    expect(DEFAULT_GEMINI_RERANK_THINKING_BUDGET).toBe(0);
  });

  it('omits the field entirely when switched off', () => {
    // The escape hatch: a model that rejects thinkingConfig should not need a code change.
    process.env.GEMINI_RERANK_THINKING_BUDGET = 'off';
    expect(getGeminiRerankThinkingBudget()).toBeNull();
  });

  it('honours an explicit budget', () => {
    process.env.GEMINI_RERANK_THINKING_BUDGET = '512';
    expect(getGeminiRerankThinkingBudget()).toBe(512);
  });

  it('clamps an absurd budget', () => {
    process.env.GEMINI_RERANK_THINKING_BUDGET = '999999';
    expect(getGeminiRerankThinkingBudget()).toBe(8_192);
  });

  it('falls back to the default on nonsense or a negative value', () => {
    process.env.GEMINI_RERANK_THINKING_BUDGET = 'banana';
    expect(getGeminiRerankThinkingBudget()).toBe(DEFAULT_GEMINI_RERANK_THINKING_BUDGET);
    process.env.GEMINI_RERANK_THINKING_BUDGET = '-5';
    expect(getGeminiRerankThinkingBudget()).toBe(DEFAULT_GEMINI_RERANK_THINKING_BUDGET);
  });
});

describe('getGeminiRerankMaxOutputTokens', () => {
  const original = process.env.GEMINI_RERANK_MAX_OUTPUT_TOKENS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GEMINI_RERANK_MAX_OUTPUT_TOKENS;
    } else {
      process.env.GEMINI_RERANK_MAX_OUTPUT_TOKENS = original;
    }
  });

  it('leaves room for reasoning as well as the JSON', () => {
    delete process.env.GEMINI_RERANK_MAX_OUTPUT_TOKENS;
    // A cap sized for the visible answer alone truncated a live run mid-structure.
    expect(getGeminiRerankMaxOutputTokens()).toBe(DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS);
    expect(DEFAULT_GEMINI_RERANK_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(6_000);
  });

  it('clamps a configured value into a workable range', () => {
    process.env.GEMINI_RERANK_MAX_OUTPUT_TOKENS = '50';
    expect(getGeminiRerankMaxOutputTokens()).toBe(1_500);
    process.env.GEMINI_RERANK_MAX_OUTPUT_TOKENS = '999999';
    expect(getGeminiRerankMaxOutputTokens()).toBe(12_000);
  });
});

describe('getRerankShortlistSize', () => {
  const original = process.env.GAMES_RERANK_SHORTLIST_SIZE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GAMES_RERANK_SHORTLIST_SIZE;
    } else {
      process.env.GAMES_RERANK_SHORTLIST_SIZE = original;
    }
  });

  it('sends the full shortlist by default', () => {
    delete process.env.GAMES_RERANK_SHORTLIST_SIZE;
    expect(getRerankShortlistSize()).toBe(GAME_RERANK_MAX_SHORTLIST);
  });

  it('clamps between the usable minimum and the ceiling', () => {
    process.env.GAMES_RERANK_SHORTLIST_SIZE = '1';
    expect(getRerankShortlistSize()).toBe(GAME_RERANK_MIN_SHORTLIST);
    process.env.GAMES_RERANK_SHORTLIST_SIZE = '99';
    expect(getRerankShortlistSize()).toBe(GAME_RERANK_MAX_SHORTLIST);
  });
});
