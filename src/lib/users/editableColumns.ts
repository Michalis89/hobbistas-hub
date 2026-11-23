import type { User } from '@/types/user';

/**
 * The `public.users` columns a signed-in user may change on their own row with
 * their own JWT.
 *
 * This list is the application half of a database rule: the
 * `users_privileged_columns` migration grants `authenticated` UPDATE on exactly
 * these columns and nothing else. A test parses that migration and fails if the
 * two lists drift apart.
 *
 * Everything else on the row (roles, account_status, is_demo, email,
 * email_verified, username, last_login, ...) is server-owned and only changes
 * through service-role code or SECURITY DEFINER functions.
 */
export const USER_SELF_EDITABLE_COLUMNS = [
  'full_name',
  'display_name',
  'bio',
  'avatar_url',
  'date_of_birth',
  'country',
  'timezone',
  'language_preference',
  'location_city',
  'privacy_settings',
  'social_links',
] as const;

export type UserSelfEditableColumn = (typeof USER_SELF_EDITABLE_COLUMNS)[number];

export type UserSelfUpdate = Partial<Pick<User, UserSelfEditableColumn>>;

const EDITABLE = new Set<string>(USER_SELF_EDITABLE_COLUMNS);

/**
 * Keeps only the self-editable columns of an update payload.
 *
 * The type already rejects other keys at compile time; this is the runtime
 * half, for callers that build payloads from wider objects.
 */
export function pickSelfEditableUserFields(updates: Record<string, unknown>): UserSelfUpdate {
  return Object.fromEntries(
    Object.entries(updates).filter(([key]) => EDITABLE.has(key)),
  ) as UserSelfUpdate;
}
