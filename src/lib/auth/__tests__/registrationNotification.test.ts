/**
 * @jest-environment node
 */
const afterMock = jest.fn();
const sendNewUserNotificationEmailMock = jest.fn();

jest.mock('next/server', () => ({
  after: (...args: unknown[]) => afterMock(...args),
}));

jest.mock('@/lib/email/send', () => ({
  sendNewUserNotificationEmail: (...args: unknown[]) => sendNewUserNotificationEmailMock(...args),
}));

import {
  formatRegistrationTimeUtc,
  notifyOwnerOfNewUser,
  scheduleOwnerNewUserNotification,
} from '../registrationNotification';

const REGISTRATION = {
  userId: 'user-1',
  username: 'maria89',
  displayName: 'Maria Papadopoulou',
  createdAt: '2026-10-22T18:04:59.123Z',
  siteUrl: 'https://hobbistas-hub.com',
};

describe('registrationNotification', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    sendNewUserNotificationEmailMock.mockResolvedValue({
      status: 'accepted',
      providerMessageId: 'm',
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('formatRegistrationTimeUtc', () => {
    it('formats to the minute in UTC', () => {
      expect(formatRegistrationTimeUtc('2026-10-22T18:04:59.123Z')).toBe('2026-10-22 18:04 UTC');
      expect(formatRegistrationTimeUtc('2026-10-22T21:04:00+03:00')).toBe('2026-10-22 18:04 UTC');
    });

    it('falls back to now for a missing or invalid timestamp', () => {
      expect(formatRegistrationTimeUtc(null)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
      expect(formatRegistrationTimeUtc('not a date')).toMatch(/ UTC$/);
    });
  });

  describe('notifyOwnerOfNewUser', () => {
    it('sends username, display name, UTC time and the admin users link', async () => {
      await notifyOwnerOfNewUser(REGISTRATION);

      expect(sendNewUserNotificationEmailMock).toHaveBeenCalledWith({
        userId: 'user-1',
        username: 'maria89',
        displayName: 'Maria Papadopoulou',
        registeredAtUtc: '2026-10-22 18:04 UTC',
        adminUsersUrl: 'https://hobbistas-hub.com/admin/support/users',
      });
    });

    it('omits a display name that only repeats the username', async () => {
      await notifyOwnerOfNewUser({ ...REGISTRATION, displayName: 'maria89' });
      await notifyOwnerOfNewUser({ ...REGISTRATION, displayName: '  ' });

      for (const [payload] of sendNewUserNotificationEmailMock.mock.calls) {
        expect(payload.displayName).toBeNull();
      }
    });

    it('logs a provider failure by user id and error code only', async () => {
      sendNewUserNotificationEmailMock.mockResolvedValue({
        status: 'failed',
        errorCode: 'validation_error',
        errorMessage: 'details',
      });

      await expect(notifyOwnerOfNewUser(REGISTRATION)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('New user notification failed:', {
        userId: 'user-1',
        errorCode: 'validation_error',
      });
    });

    it('never throws, even if sending throws', async () => {
      sendNewUserNotificationEmailMock.mockRejectedValue(new TypeError('boom'));

      await expect(notifyOwnerOfNewUser(REGISTRATION)).resolves.toBeUndefined();
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('maria89');
    });
  });

  describe('scheduleOwnerNewUserNotification', () => {
    it('defers sending until after the response', async () => {
      scheduleOwnerNewUserNotification(REGISTRATION);

      expect(afterMock).toHaveBeenCalledTimes(1);
      expect(sendNewUserNotificationEmailMock).not.toHaveBeenCalled();

      await afterMock.mock.calls[0][0]();
      expect(sendNewUserNotificationEmailMock).toHaveBeenCalledTimes(1);
    });

    it('does not throw when after() cannot be used', () => {
      afterMock.mockImplementation(() => {
        throw new Error('`after` was called outside a request scope');
      });

      expect(() => scheduleOwnerNewUserNotification(REGISTRATION)).not.toThrow();
      expect(sendNewUserNotificationEmailMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'New user notification could not be scheduled:',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });
});
