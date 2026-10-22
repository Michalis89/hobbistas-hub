/**
 * What the admin users table shows about how an account is really used.
 *
 * public.users.account_status is the moderation state an admin sets
 * (active, suspended, banned, deleted), so on its own it reads "active" for
 * almost everyone. The status here combines it with what the account did:
 * whether the email was ever confirmed and when the user last signed in.
 */

export type UserActivityStatus =
  'active' | 'dormant' | 'never_signed_in' | 'unverified' | 'suspended' | 'banned' | 'deleted';

/** Moderation states an admin can set from the table. */
export const ACCOUNT_STATUS_OPTIONS = ['active', 'suspended', 'banned'] as const;

/** No sign-in for this long and an otherwise healthy account counts as dormant. */
export const DORMANT_AFTER_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

const MODERATION_STATES = new Set<UserActivityStatus>(['suspended', 'banned', 'deleted']);

const toTime = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

/**
 * The most recent sign-in we know of. auth.users.last_sign_in_at covers every
 * sign-in method; public.users.last_login is only written by the password
 * login route, so either can be missing or behind.
 */
export function latestSignIn(...values: (string | null | undefined)[]): string | null {
  let latest: number | null = null;
  for (const value of values) {
    const time = toTime(value);
    if (time !== null && (latest === null || time > latest)) {
      latest = time;
    }
  }
  return latest === null ? null : new Date(latest).toISOString();
}

/**
 * First match wins, most important first: a moderation state an admin set,
 * then an email never confirmed, then never signed in, then dormant.
 */
export function deriveUserActivityStatus(input: {
  accountStatus: string | null | undefined;
  emailConfirmedAt: string | null | undefined;
  lastSignInAt: string | null | undefined;
  now?: number;
}): UserActivityStatus {
  const moderation = (input.accountStatus ?? '').trim().toLowerCase() as UserActivityStatus;
  if (MODERATION_STATES.has(moderation)) {
    return moderation;
  }
  if (!toTime(input.emailConfirmedAt)) {
    return 'unverified';
  }
  const lastSignIn = toTime(input.lastSignInAt);
  if (lastSignIn === null) {
    return 'never_signed_in';
  }
  const now = input.now ?? Date.now();
  if (now - lastSignIn > DORMANT_AFTER_DAYS * DAY_MS) {
    return 'dormant';
  }
  return 'active';
}

export type UserContentCounts = {
  library: number;
  diary: number;
  articles: number;
  comments: number;
  characterSheets: number;
  total: number;
};

export function toContentCounts(row: {
  library_count?: number | string | null;
  diary_count?: number | string | null;
  article_count?: number | string | null;
  comment_count?: number | string | null;
  character_sheet_count?: number | string | null;
}): UserContentCounts {
  // bigint counts can arrive as strings from PostgREST
  const n = (value: number | string | null | undefined) => {
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : (value ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const counts = {
    library: n(row.library_count),
    diary: n(row.diary_count),
    articles: n(row.article_count),
    comments: n(row.comment_count),
    characterSheets: n(row.character_sheet_count),
  };
  return {
    ...counts,
    total:
      counts.library + counts.diary + counts.articles + counts.comments + counts.characterSheets,
  };
}
