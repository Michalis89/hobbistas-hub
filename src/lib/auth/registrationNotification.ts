import { after } from 'next/server';
import { sendNewUserNotificationEmail } from '@/lib/email/send';

export const ADMIN_USERS_PATH = '/admin/support/users';

export type NewUserRegistration = {
  userId: string;
  username: string;
  displayName: string | null;
  /** `created_at` of the auth user; falls back to the current time. */
  createdAt: string | null | undefined;
  siteUrl: string;
};

/** "2026-10-22 18:04 UTC" */
export function formatRegistrationTimeUtc(createdAt: string | null | undefined): string {
  const parsed = createdAt ? new Date(createdAt) : null;
  const date = parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * Sends the owner notification for one new account. Never throws: a
 * notification problem is logged (user id and error code only) and dropped.
 */
export async function notifyOwnerOfNewUser(registration: NewUserRegistration): Promise<void> {
  const { userId, username, displayName, createdAt, siteUrl } = registration;
  try {
    // Signup defaults the display name to the username; repeating it adds nothing.
    const distinctDisplayName =
      displayName && displayName.trim() && displayName.trim() !== username
        ? displayName.trim()
        : null;

    const result = await sendNewUserNotificationEmail({
      userId,
      username,
      displayName: distinctDisplayName,
      registeredAtUtc: formatRegistrationTimeUtc(createdAt),
      adminUsersUrl: `${siteUrl}${ADMIN_USERS_PATH}`,
    });

    if (result.status === 'failed') {
      console.error('New user notification failed:', { userId, errorCode: result.errorCode });
    }
  } catch (error) {
    console.error('New user notification threw:', {
      userId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/**
 * Queues the owner notification to run after the signup response is sent,
 * so it can neither delay nor fail the registration. Call it only once the
 * account and its profile row are persisted.
 */
export function scheduleOwnerNewUserNotification(registration: NewUserRegistration): void {
  try {
    after(() => notifyOwnerOfNewUser(registration));
  } catch (error) {
    // `after` throws outside a request scope. Registration has succeeded
    // either way, so the notification is skipped rather than surfaced.
    console.error('New user notification could not be scheduled:', {
      userId: registration.userId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}
