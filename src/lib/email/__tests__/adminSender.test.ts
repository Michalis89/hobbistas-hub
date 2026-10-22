/**
 * @jest-environment node
 */
import {
  DEFAULT_ADMIN_EMAIL_FROM,
  DEFAULT_ADMIN_EMAIL_REPLY_TO,
  VERIFIED_SENDING_DOMAIN,
  resolveAdminEmailFrom,
  resolveAdminEmailReplyTo,
} from '../adminSender';

const env = process.env as Record<string, string | undefined>;
const original = { from: env.ADMIN_EMAIL_FROM, replyTo: env.ADMIN_EMAIL_REPLY_TO };

beforeEach(() => {
  delete env.ADMIN_EMAIL_FROM;
  delete env.ADMIN_EMAIL_REPLY_TO;
});

afterAll(() => {
  if (original.from !== undefined) {
    env.ADMIN_EMAIL_FROM = original.from;
  }
  if (original.replyTo !== undefined) {
    env.ADMIN_EMAIL_REPLY_TO = original.replyTo;
  }
});

describe('resolveAdminEmailFrom', () => {
  it('defaults to the personal sender on the verified Resend domain', () => {
    expect(resolveAdminEmailFrom()).toBe('Michail from Hobbistas <hello@mail.hobbistas-hub.com>');
    expect(DEFAULT_ADMIN_EMAIL_FROM.endsWith(`@${VERIFIED_SENDING_DOMAIN}>`)).toBe(true);
  });

  it.each([
    ['a named address', 'Michail <michail@mail.hobbistas-hub.com>'],
    ['a bare address', 'hello@mail.hobbistas-hub.com'],
    ['a mixed-case domain', 'Team <team@MAIL.Hobbistas-Hub.com>'],
  ])('accepts %s on the verified domain', (_label, value) => {
    env.ADMIN_EMAIL_FROM = value;
    expect(resolveAdminEmailFrom()).toBe(value);
  });

  it('trims surrounding whitespace', () => {
    env.ADMIN_EMAIL_FROM = '  Michail   <michail@mail.hobbistas-hub.com>  ';
    expect(resolveAdminEmailFrom()).toBe('Michail <michail@mail.hobbistas-hub.com>');
  });

  it.each([
    ['empty', ''],
    ['an unverified domain', 'Michail <michail@gmail.com>'],
    ['the parent domain', 'Michail <michail@hobbistas-hub.com>'],
    ['a look-alike domain', 'Michail <michail@mail.hobbistas-hub.com.evil.io>'],
    ['header injection in the name', 'Michail\r\nBcc: x@y.com <hello@mail.hobbistas-hub.com>'],
    ['quotes in the name', '"Michail" <hello@mail.hobbistas-hub.com>'],
    ['a list', 'hello@mail.hobbistas-hub.com, other@mail.hobbistas-hub.com'],
    ['an overlong name', `${'x'.repeat(65)} <hello@mail.hobbistas-hub.com>`],
    ['not an address', 'Michail'],
  ])('falls back to the default for %s', (_label, value) => {
    env.ADMIN_EMAIL_FROM = value;
    expect(resolveAdminEmailFrom()).toBe(DEFAULT_ADMIN_EMAIL_FROM);
  });
});

describe('resolveAdminEmailReplyTo', () => {
  it('defaults to support@hobbistas-hub.com', () => {
    expect(resolveAdminEmailReplyTo()).toBe(DEFAULT_ADMIN_EMAIL_REPLY_TO);
    expect(DEFAULT_ADMIN_EMAIL_REPLY_TO).toBe('support@hobbistas-hub.com');
  });

  it('accepts one bare address on any domain', () => {
    env.ADMIN_EMAIL_REPLY_TO = ' owner@example.com ';
    expect(resolveAdminEmailReplyTo()).toBe('owner@example.com');
  });

  it.each([
    ['a display name', 'Support <support@hobbistas-hub.com>'],
    ['header injection', 'a@b.com\r\nBcc: x@y.com'],
    ['a list', 'a@b.com, c@d.com'],
  ])('falls back to the default for %s', (_label, value) => {
    env.ADMIN_EMAIL_REPLY_TO = value;
    expect(resolveAdminEmailReplyTo()).toBe(DEFAULT_ADMIN_EMAIL_REPLY_TO);
  });
});
