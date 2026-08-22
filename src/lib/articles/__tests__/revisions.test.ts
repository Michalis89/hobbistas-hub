import { REVISION_MIN_INTERVAL_MS, shouldSnapshot } from '@/lib/articles/revisions';

const NOW = new Date('2026-08-23T12:00:00Z').getTime();

const decide = (overrides: Partial<Parameters<typeof shouldSnapshot>[0]> = {}) =>
  shouldSnapshot({
    existingStatus: 'published',
    lastRevisionAt: null,
    contentChanging: true,
    now: NOW,
    ...overrides,
  });

describe('shouldSnapshot', () => {
  it('keeps the first snapshot of a published article', () => {
    expect(decide()).toBe(true);
  });

  it('ignores updates that do not touch the writing', () => {
    // Re-tagging or changing a cover is not something to recover from.
    expect(decide({ contentChanging: false })).toBe(false);
  });

  it('does not snapshot drafts', () => {
    // A draft has no version a reader has seen; its autosaves are the history.
    expect(decide({ existingStatus: 'draft' })).toBe(false);
    expect(decide({ existingStatus: 'scheduled' })).toBe(false);
    expect(decide({ existingStatus: null })).toBe(false);
  });

  it('spaces snapshots out so autosaves cannot flood the history', () => {
    const justNow = new Date(NOW - 1000).toISOString();
    expect(decide({ lastRevisionAt: justNow })).toBe(false);

    const halfWindow = new Date(NOW - REVISION_MIN_INTERVAL_MS / 2).toISOString();
    expect(decide({ lastRevisionAt: halfWindow })).toBe(false);
  });

  it('snapshots again once the interval has passed', () => {
    const old = new Date(NOW - REVISION_MIN_INTERVAL_MS).toISOString();
    expect(decide({ lastRevisionAt: old })).toBe(true);

    const older = new Date(NOW - REVISION_MIN_INTERVAL_MS * 3).toISOString();
    expect(decide({ lastRevisionAt: older })).toBe(true);
  });

  it('snapshots when the previous timestamp is unreadable', () => {
    // Better a redundant revision than a silently skipped one.
    expect(decide({ lastRevisionAt: 'not a date' })).toBe(true);
  });
});
