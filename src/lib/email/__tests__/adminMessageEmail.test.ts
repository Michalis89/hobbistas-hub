/**
 * @jest-environment node
 */
const sendMock = jest.fn();

jest.mock('../resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
}));

import { renderAdminMessageEmail } from '../templates';
import { sendAdminMessageEmail } from '../send';

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
        from: 'Hobbistas <no-reply@mail.hobbistas-hub.com>',
        to: ['maria@example.com'],
        replyTo: expect.any(String),
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
