/**
 * @jest-environment node
 */

import {
  buildImpressionRows,
  buildRecommendationServe,
  recordRecommendationImpressions,
  RECOMMENDATION_SERVE_BUCKET_MS,
} from '../serve';

const SLOTS = [
  { mediaId: 1001, source: 'continuation', subtype: 'continuation', deterministicRank: 1 },
  { mediaId: 1005, source: 'discovery', subtype: 'discovery', deterministicRank: 2 },
];

function serveAt(now: number, slots = SLOTS) {
  return buildRecommendationServe({
    userId: 'user-1',
    category: 'games',
    surface: 'dashboard_media_suggestions',
    slots,
    now,
  });
}

describe('buildRecommendationServe', () => {
  it('produces a syntactically valid uuid', () => {
    expect(serveAt(0).serveId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('gives re-renders inside one time bucket the same serve id', () => {
    const first = serveAt(0);
    const second = serveAt(RECOMMENDATION_SERVE_BUCKET_MS - 1);

    expect(second.serveId).toBe(first.serveId);
  });

  it('starts a new serve in the next time bucket', () => {
    expect(serveAt(RECOMMENDATION_SERVE_BUCKET_MS).serveId).not.toBe(serveAt(0).serveId);
  });

  it('separates users, categories and surfaces', () => {
    const base = serveAt(0);

    expect(
      buildRecommendationServe({
        userId: 'user-2',
        category: 'games',
        surface: 'dashboard_media_suggestions',
        slots: SLOTS,
        now: 0,
      }).serveId,
    ).not.toBe(base.serveId);

    expect(
      buildRecommendationServe({
        userId: 'user-1',
        category: 'anime',
        surface: 'dashboard_media_suggestions',
        slots: SLOTS,
        now: 0,
      }).serveId,
    ).not.toBe(base.serveId);

    expect(
      buildRecommendationServe({
        userId: 'user-1',
        category: 'games',
        surface: 'backlog_personal_suggestions',
        slots: SLOTS,
        now: 0,
      }).serveId,
    ).not.toBe(base.serveId);
  });

  it('treats a different set or order of recommendations as a different serve', () => {
    const base = serveAt(0);

    expect(serveAt(0, [...SLOTS].reverse()).serveId).not.toBe(base.serveId);
    expect(serveAt(0, SLOTS.slice(0, 1)).serveId).not.toBe(base.serveId);
  });
});

describe('buildImpressionRows', () => {
  it('emits one impression row per slot, indexed by position', () => {
    expect(buildImpressionRows(serveAt(0))).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        media_id: 1001,
        category: 'games',
        surface: 'dashboard_media_suggestions',
        slot_index: 0,
        source: 'continuation',
        deterministic_rank: 1,
        event_type: 'impression',
      }),
      expect.objectContaining({ media_id: 1005, slot_index: 1, deterministic_rank: 2 }),
    ]);
  });

  it('stores no titles', () => {
    const serialised = JSON.stringify(buildImpressionRows(serveAt(0)));

    expect(serialised).not.toContain('title');
  });
});

describe('recordRecommendationImpressions', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  afterAll(() => {
    warn.mockRestore();
  });

  function client(upsert: jest.Mock) {
    return { from: jest.fn(() => ({ upsert })) } as never;
  }

  it('ignores duplicate rows at the database rather than pre-checking', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    await recordRecommendationImpressions(client(upsert), serveAt(0));

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][1]).toEqual({
      onConflict: 'serve_id,media_id,event_type',
      ignoreDuplicates: true,
    });
  });

  it('writes nothing when there are no slots', async () => {
    const upsert = jest.fn();
    await recordRecommendationImpressions(client(upsert), serveAt(0, []));

    expect(upsert).not.toHaveBeenCalled();
  });

  it('swallows a returned database error', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: { code: '23505', message: 'nope' } });

    await expect(
      recordRecommendationImpressions(client(upsert), serveAt(0)),
    ).resolves.toBeUndefined();
  });

  it('swallows a thrown error', async () => {
    const upsert = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(
      recordRecommendationImpressions(client(upsert), serveAt(0)),
    ).resolves.toBeUndefined();
  });
});
