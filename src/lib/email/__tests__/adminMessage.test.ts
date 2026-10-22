/**
 * @jest-environment node
 */
import {
  ADMIN_EMAIL_MESSAGE_MAX,
  ADMIN_EMAIL_SUBJECT_MAX,
  personalizeAdminMessage,
  resolveRecipientName,
  sanitizeProviderError,
  validateAdminEmailInput,
} from '../adminMessage';

const KEY = '0b9a3c3e-6f0a-4f43-9d9e-6a0c2f1b7e11';

describe('resolveRecipientName', () => {
  it('prefers the display name', () => {
    expect(resolveRecipientName({ display_name: 'Maria', username: 'maria89' })).toBe('Maria');
  });

  it('falls back to the username when the display name is missing or blank', () => {
    expect(resolveRecipientName({ display_name: null, username: 'maria89' })).toBe('maria89');
    expect(resolveRecipientName({ display_name: '   ', username: 'maria89' })).toBe('maria89');
  });

  it('strips control characters, including line breaks', () => {
    expect(resolveRecipientName({ display_name: 'Ma\r\nria\u0000', username: 'x' })).toBe('Maria');
  });
});

describe('personalizeAdminMessage', () => {
  it('replaces every placeholder, tolerating inner whitespace', () => {
    expect(personalizeAdminMessage('Hi {{displayName}}, {{ displayName }}!', 'Maria')).toBe(
      'Hi Maria, Maria!',
    );
  });

  it('inserts names literally (no $-pattern expansion) and leaves other braces alone', () => {
    expect(personalizeAdminMessage('Hi {{displayName}} {{email}}', '$& $1')).toBe(
      'Hi $& $1 {{email}}',
    );
  });
});

describe('validateAdminEmailInput', () => {
  const valid = { subject: ' Hello ', message: ' Body ', idempotencyKey: KEY.toUpperCase() };

  it('accepts and normalises a valid payload', () => {
    expect(validateAdminEmailInput(valid)).toEqual({
      ok: true,
      value: { subject: 'Hello', message: 'Body', idempotencyKey: KEY },
    });
  });

  it('never passes through a client-supplied recipient', () => {
    const result = validateAdminEmailInput({ ...valid, to: 'attacker@example.com' });
    expect(result.ok && Object.keys(result.value)).toEqual([
      'subject',
      'message',
      'idempotencyKey',
    ]);
  });

  it.each([
    [null, 'Invalid request body.'],
    [{ ...valid, subject: '' }, 'Subject is required.'],
    [{ ...valid, subject: 42 }, 'Subject is required.'],
    [{ ...valid, message: '   ' }, 'Message is required.'],
    [{ ...valid, idempotencyKey: 'nope' }, 'Invalid submission key.'],
    [{ ...valid, idempotencyKey: undefined }, 'Invalid submission key.'],
  ])('rejects %p', (body, error) => {
    expect(validateAdminEmailInput(body)).toEqual({ ok: false, error });
  });

  it('rejects header injection in the subject', () => {
    for (const subject of ['Hi\r\nBcc: x@y.z', 'Hi\nthere', 'Hi\u0007']) {
      expect(validateAdminEmailInput({ ...valid, subject })).toEqual({
        ok: false,
        error: 'Subject must be a single line of plain text.',
      });
    }
  });

  it('allows newlines in the message but not other control characters', () => {
    expect(validateAdminEmailInput({ ...valid, message: 'a\r\n\nb\tc' }).ok).toBe(true);
    expect(validateAdminEmailInput({ ...valid, message: 'a\u0000b' }).ok).toBe(false);
  });

  it('enforces length limits', () => {
    expect(
      validateAdminEmailInput({ ...valid, subject: 'x'.repeat(ADMIN_EMAIL_SUBJECT_MAX) }).ok,
    ).toBe(true);
    expect(
      validateAdminEmailInput({ ...valid, subject: 'x'.repeat(ADMIN_EMAIL_SUBJECT_MAX + 1) }).ok,
    ).toBe(false);
    expect(
      validateAdminEmailInput({ ...valid, message: 'x'.repeat(ADMIN_EMAIL_MESSAGE_MAX + 1) }).ok,
    ).toBe(false);
  });
});

describe('sanitizeProviderError', () => {
  it('redacts addresses, flattens control characters and truncates', () => {
    expect(sanitizeProviderError('Invalid `to` field: bob@example.com\nretry')).toBe(
      'Invalid `to` field: [redacted] retry',
    );
    expect(sanitizeProviderError('x'.repeat(500))).toHaveLength(300);
    expect(sanitizeProviderError(undefined)).toBe('Unknown provider error');
  });
});
