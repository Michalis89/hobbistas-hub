/**
 * @jest-environment node
 */
const sendMock = jest.fn();

jest.mock('../resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
}));

import { NEW_USER_NOTIFICATION_SUBJECT, renderNewUserNotificationEmail } from '../templates';
import { sendNewUserNotificationEmail } from '../send';

const env = process.env as Record<string, string | undefined>;
const ENV_NAMES = [
  'ADMIN_REGISTRATION_NOTIFICATION_EMAIL',
  'ADMIN_EMAIL_FROM',
  'ADMIN_EMAIL_REPLY_TO',
] as const;
const originalEnv = ENV_NAMES.map(name => [name, env[name]] as const);

const NOTIFICATION = {
  userId: 'user-1',
  username: 'maria89',
  displayName: 'Maria',
  registeredAtUtc: '2026-10-22 18:04 UTC',
  adminUsersUrl: 'https://hobbistas-hub.com/admin/support/users',
};

beforeEach(() => {
  for (const name of ENV_NAMES) {
    delete env[name];
  }
  sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
});

afterAll(() => {
  for (const [name, value] of originalEnv) {
    if (value !== undefined) {
      env[name] = value;
    }
  }
});

describe('renderNewUserNotificationEmail', () => {
  it('lists username, display name, UTC time and the admin link', () => {
    const html = renderNewUserNotificationEmail(NOTIFICATION);

    expect(html).toContain('A new user just joined Hobbistas Hub!');
    expect(html).toContain('@maria89');
    expect(html).toContain('Display name');
    expect(html).toContain('Maria');
    expect(html).toContain('2026-10-22 18:04 UTC');
    expect(html).toContain('href="https://hobbistas-hub.com/admin/support/users"');
    expect(html).toContain('#8c5cff');
  });

  it('omits the display name row when there is none', () => {
    const html = renderNewUserNotificationEmail({ ...NOTIFICATION, displayName: null });
    expect(html).not.toContain('Display name');
  });

  it('escapes user-chosen values', () => {
    const html = renderNewUserNotificationEmail({
      ...NOTIFICATION,
      displayName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('loads nothing remote on open', () => {
    const html = renderNewUserNotificationEmail(NOTIFICATION);
    expect(html).not.toMatch(/<img|<link|url\(|@import/i);
  });
});

describe('sendNewUserNotificationEmail', () => {
  const sent = () => sendMock.mock.calls[0][0];

  it('sends to support@hobbistas-hub.com from the transactional sender', async () => {
    await expect(sendNewUserNotificationEmail(NOTIFICATION)).resolves.toEqual({
      status: 'accepted',
      providerMessageId: 'msg_1',
    });

    expect(sent()).toEqual(
      expect.objectContaining({
        from: 'Hobbistas <no-reply@mail.hobbistas-hub.com>',
        to: ['support@hobbistas-hub.com'],
        subject: '🎉 New Hobbistas user registered!',
      }),
    );
    expect(sent().subject).toBe(NEW_USER_NOTIFICATION_SUBJECT);
    expect(sent()).not.toHaveProperty('replyTo');
    expect(sent().text).toContain('Username: @maria89');
    expect(sent().text).toContain('Registered: 2026-10-22 18:04 UTC');
  });

  it('uses one idempotency key per user, so retries cannot notify twice', async () => {
    await sendNewUserNotificationEmail(NOTIFICATION);
    await sendNewUserNotificationEmail(NOTIFICATION);

    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: 'new-user-registration/user-1' });
    expect(sendMock.mock.calls[1][1]).toEqual(sendMock.mock.calls[0][1]);
  });

  it('uses ADMIN_REGISTRATION_NOTIFICATION_EMAIL when it is one valid address', async () => {
    env.ADMIN_REGISTRATION_NOTIFICATION_EMAIL = ' owner@example.com ';
    await sendNewUserNotificationEmail(NOTIFICATION);
    expect(sent().to).toEqual(['owner@example.com']);
  });

  it.each([['not an address'], ['a@b.com, c@d.com'], ['a@b.com\r\nBcc: x@y.com']])(
    'falls back to the default recipient for %p',
    async value => {
      env.ADMIN_REGISTRATION_NOTIFICATION_EMAIL = value;
      await sendNewUserNotificationEmail(NOTIFICATION);
      expect(sent().to).toEqual(['support@hobbistas-hub.com']);
    },
  );

  it('is unaffected by the admin composer sender settings', async () => {
    env.ADMIN_EMAIL_FROM = 'Michail <michail@mail.hobbistas-hub.com>';
    env.ADMIN_EMAIL_REPLY_TO = 'owner@example.com';
    await sendNewUserNotificationEmail(NOTIFICATION);

    expect(sent().from).toBe('Hobbistas <no-reply@mail.hobbistas-hub.com>');
    expect(sent()).not.toHaveProperty('replyTo');
  });

  it('reports provider errors and exceptions instead of throwing', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many', statusCode: 429 },
    });
    await expect(sendNewUserNotificationEmail(NOTIFICATION)).resolves.toEqual(
      expect.objectContaining({ status: 'failed', errorCode: 'rate_limit_exceeded' }),
    );

    sendMock.mockRejectedValueOnce(new Error('network down'));
    await expect(sendNewUserNotificationEmail(NOTIFICATION)).resolves.toEqual(
      expect.objectContaining({ status: 'failed', errorCode: 'send_exception' }),
    );
  });
});
