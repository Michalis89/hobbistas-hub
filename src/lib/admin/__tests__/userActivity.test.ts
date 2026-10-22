import {
  DORMANT_AFTER_DAYS,
  deriveUserActivityStatus,
  latestSignIn,
  toContentCounts,
} from '../userActivity';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const confirmed = '2026-01-01T00:00:00Z';

describe('deriveUserActivityStatus', () => {
  it('shows an admin moderation state before anything else', () => {
    for (const accountStatus of ['suspended', 'banned', 'deleted', ' Banned ']) {
      expect(
        deriveUserActivityStatus({
          accountStatus,
          emailConfirmedAt: confirmed,
          lastSignInAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe(accountStatus.trim().toLowerCase());
    }
  });

  it('flags an email that was never confirmed', () => {
    expect(
      deriveUserActivityStatus({
        accountStatus: 'active',
        emailConfirmedAt: null,
        lastSignInAt: null,
        now: NOW,
      }),
    ).toBe('unverified');
  });

  it('separates never signed in, dormant and active', () => {
    const base = { accountStatus: 'active', emailConfirmedAt: confirmed, now: NOW };

    expect(deriveUserActivityStatus({ ...base, lastSignInAt: null })).toBe('never_signed_in');
    expect(
      deriveUserActivityStatus({ ...base, lastSignInAt: daysAgo(DORMANT_AFTER_DAYS + 1) }),
    ).toBe('dormant');
    expect(
      deriveUserActivityStatus({ ...base, lastSignInAt: daysAgo(DORMANT_AFTER_DAYS - 1) }),
    ).toBe('active');
  });

  it('treats an unknown or empty account status as active', () => {
    expect(
      deriveUserActivityStatus({
        accountStatus: null,
        emailConfirmedAt: confirmed,
        lastSignInAt: daysAgo(3),
        now: NOW,
      }),
    ).toBe('active');
  });
});

describe('latestSignIn', () => {
  it('takes the most recent of the auth and profile sign-in times', () => {
    expect(latestSignIn('2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z', null)).toBe(
      '2026-05-01T00:00:00.000Z',
    );
    expect(latestSignIn(null, undefined, 'not a date')).toBeNull();
  });
});

describe('toContentCounts', () => {
  it('reads bigint counts that arrive as strings and totals them', () => {
    expect(
      toContentCounts({
        library_count: '120',
        diary_count: 3,
        article_count: 0,
        comment_count: null,
        character_sheet_count: '4',
      }),
    ).toEqual({ library: 120, diary: 3, articles: 0, comments: 0, characterSheets: 4, total: 127 });
  });
});
