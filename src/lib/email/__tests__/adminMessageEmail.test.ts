/**
 * @jest-environment node
 */
const sendMock = jest.fn();

jest.mock('../resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
}));

import { renderAdminMessageEmail } from '../templates';
import { sendAdminMessageEmail, sendConfirmEmail, sendResetPasswordEmail } from '../send';

const env = process.env as Record<string, string | undefined>;
const SENDER_ENV = ['ADMIN_EMAIL_FROM', 'ADMIN_EMAIL_REPLY_TO'] as const;
const originalSenderEnv = SENDER_ENV.map(name => [name, env[name]] as const);

const DEFAULT_FROM = 'Michail from Hobbistas <hello@mail.hobbistas-hub.com>';
const TRANSACTIONAL_FROM = 'Hobbistas <no-reply@mail.hobbistas-hub.com>';

beforeEach(() => {
  for (const name of SENDER_ENV) {
    delete env[name];
  }
});

afterAll(() => {
  for (const [name, value] of originalSenderEnv) {
    if (value !== undefined) {
      env[name] = value;
    }
  }
});

const params = {
  to: 'maria@example.com',
  subject: 'Hello Maria',
  message: 'Line one',
  idempotencyKey: '0b9a3c3e-6f0a-4f43-9d9e-6a0c2f1b7e11',
};

describe('renderAdminMessageEmail', () => {
  it('escapes subject and body, so a hostile display name stays text', () => {
    const html = renderAdminMessageEmail({
      subject: 'Hi <img src=x onerror=alert(1)>',
      message: 'Dear <script>alert("x")</script> & co',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
    expect(html).toContain('<title>Hi &lt;img src=x onerror=alert(1)&gt;</title>');
  });

  it('turns blank lines into paragraphs and single newlines into breaks', () => {
    const html = renderAdminMessageEmail({ subject: 's', message: 'a\nb\r\n\r\nc' });
    expect(html).toMatch(/>a<br \/>b<\/p>/);
    expect(html).toMatch(/>c<\/p>/);
  });

  it('loads nothing remote on open: no images, stylesheets or fonts', () => {
    const html = renderAdminMessageEmail({ subject: 's', message: 'm' });
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/@import/i);
  });

  it('uses the violet-bloom brand color', () => {
    expect(renderAdminMessageEmail({ subject: 's', message: 'm' })).toContain('#8c5cff');
  });

  it('presents the email as a personal note from the creator', () => {
    const html = renderAdminMessageEmail({ subject: 's', message: 'm' });
    expect(html).toContain('A personal note from the creator of Hobbistas');
    expect(html).not.toContain('A message from the Hobbistas team');
  });
});

describe('admin email sender identity', () => {
  const sent = () => sendMock.mock.calls[0][0];
  const sentReplyTo = () => sent().replyTo;

  beforeEach(() => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
  });

  it('sets Reply-To to support@hobbistas-hub.com in the provider request by default', async () => {
    await sendAdminMessageEmail(params);
    expect(sentReplyTo()).toBe('support@hobbistas-hub.com');
  });

  it('uses ADMIN_EMAIL_REPLY_TO when it is a single valid address', async () => {
    env.ADMIN_EMAIL_REPLY_TO = '  owner@hobbistas-hub.com ';
    await sendAdminMessageEmail(params);
    expect(sentReplyTo()).toBe('owner@hobbistas-hub.com');
  });

  it.each([
    ['empty', ''],
    ['not an address', 'support'],
    ['header injection', 'a@b.com\r\nBcc: x@y.com'],
    ['a list', 'a@b.com, c@d.com'],
    ['a display name', 'Support <support@hobbistas-hub.com>'],
  ])('falls back to the default when ADMIN_EMAIL_REPLY_TO is %s', async (_label, value) => {
    env.ADMIN_EMAIL_REPLY_TO = value;
    await sendAdminMessageEmail(params);
    expect(sentReplyTo()).toBe('support@hobbistas-hub.com');
  });

  it('sends from the personal sender on the verified domain by default', async () => {
    await sendAdminMessageEmail(params);
    expect(sent().from).toBe(DEFAULT_FROM);
    expect(sentReplyTo()).toBe('support@hobbistas-hub.com');
  });

  it('uses ADMIN_EMAIL_FROM when it is on the verified domain', async () => {
    env.ADMIN_EMAIL_FROM = 'Michail at Hobbistas <michail@mail.hobbistas-hub.com>';
    await sendAdminMessageEmail(params);
    expect(sent().from).toBe('Michail at Hobbistas <michail@mail.hobbistas-hub.com>');
  });

  it('falls back to the default sender when ADMIN_EMAIL_FROM is on another domain', async () => {
    env.ADMIN_EMAIL_FROM = 'Michail <michail@gmail.com>';
    await sendAdminMessageEmail(params);
    expect(sent().from).toBe(DEFAULT_FROM);
  });

  it('leaves transactional emails on the no-reply sender with no Reply-To', async () => {
    env.ADMIN_EMAIL_FROM = 'Michail at Hobbistas <michail@mail.hobbistas-hub.com>';
    env.ADMIN_EMAIL_REPLY_TO = 'owner@hobbistas-hub.com';
    await sendConfirmEmail('maria@example.com', 'https://example.com/confirm');
    await sendResetPasswordEmail('maria@example.com', 'https://example.com/reset');

    expect(sendMock).toHaveBeenCalledTimes(2);
    for (const [payload] of sendMock.mock.calls) {
      expect(payload.from).toBe(TRANSACTIONAL_FROM);
      expect(payload).not.toHaveProperty('replyTo');
    }
  });
});

describe('sendAdminMessageEmail', () => {
  it('sends through Resend with text, html, reply-to and the idempotency key', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await expect(sendAdminMessageEmail(params)).resolves.toEqual({
      status: 'accepted',
      providerMessageId: 'msg_1',
    });

    const [payload, options] = sendMock.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        from: DEFAULT_FROM,
        to: ['maria@example.com'],
        replyTo: 'support@hobbistas-hub.com',
        subject: 'Hello Maria',
        text: 'Line one',
        html: expect.stringContaining('Line one'),
      }),
    );
    expect(options).toEqual({ idempotencyKey: params.idempotencyKey });
  });

  it('reports a provider error with a sanitized message', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Bad to: maria@example.com', statusCode: 422 },
    });

    await expect(sendAdminMessageEmail(params)).resolves.toEqual({
      status: 'failed',
      errorCode: 'validation_error',
      errorMessage: 'Bad to: [redacted]',
    });
  });

  it('only simulates in development without a mail key', async () => {
    const env = process.env as Record<string, string | undefined>;
    const original = { NODE_ENV: env.NODE_ENV, RESEND_API_KEY: env.RESEND_API_KEY };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    env.NODE_ENV = 'development';
    delete env.RESEND_API_KEY;
    try {
      let devSend: typeof sendAdminMessageEmail | undefined;
      jest.isolateModules(() => {
        devSend = (jest.requireActual('../send') as typeof import('../send')).sendAdminMessageEmail;
      });
      await expect(devSend!(params)).resolves.toEqual({ status: 'simulated' });
      expect(sendMock).not.toHaveBeenCalled();
      // Recipient and subject only: the body is never logged.
      expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('Line one');
    } finally {
      env.NODE_ENV = original.NODE_ENV;
      if (original.RESEND_API_KEY !== undefined) {
        env.RESEND_API_KEY = original.RESEND_API_KEY;
      }
      warnSpy.mockRestore();
    }
  });

  it('reports a thrown error instead of propagating it', async () => {
    sendMock.mockRejectedValue(new Error('Missing RESEND_API_KEY environment variable'));

    await expect(sendAdminMessageEmail(params)).resolves.toEqual({
      status: 'failed',
      errorCode: 'send_exception',
      errorMessage: 'Missing RESEND_API_KEY environment variable',
    });
  });
});
