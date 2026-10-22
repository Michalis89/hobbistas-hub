import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminUserEmailComposer, { type EmailRecipient } from '../AdminUserEmailComposer.client';

const RECIPIENT: EmailRecipient = {
  id: 'user-1',
  username: 'maria89',
  display_name: 'Maria',
  email: 'maria@example.com',
};

type Deferred = { resolve: (value: unknown) => void };

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body };
}

describe('AdminUserEmailComposer', () => {
  let uuidCounter = 0;

  // jsdom has no <dialog> modal API and may lack crypto.randomUUID
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });

  beforeEach(() => {
    uuidCounter = 0;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => `00000000-0000-4000-8000-00000000000${++uuidCounter}`,
    });
    global.fetch = jest.fn();
  });

  const setup = (recipient: EmailRecipient = RECIPIENT) => {
    const onClose = jest.fn();
    const onSent = jest.fn();
    render(<AdminUserEmailComposer recipient={recipient} onClose={onClose} onSent={onSent} />);
    return { onClose, onSent, user: userEvent.setup() };
  };

  const compose = async (
    user: ReturnType<typeof userEvent.setup>,
    subject = 'Hello {{displayName}}',
    message = 'Hi {{displayName}}, welcome.',
  ) => {
    await user.type(screen.getByLabelText('Subject'), subject.replaceAll('{', '{{'));
    await user.type(screen.getByLabelText('Message'), message.replaceAll('{', '{{'));
    await user.click(screen.getByRole('button', { name: 'Review' }));
  };

  const sentBodies = () =>
    (global.fetch as jest.Mock).mock.calls.map(([, init]) => JSON.parse(init.body));

  it('renders nothing without a recipient', () => {
    render(<AdminUserEmailComposer recipient={null} onClose={jest.fn()} onSent={jest.fn()} />);
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
  });

  it('shows the read-only recipient', () => {
    setup();
    const recipient = screen.getByTestId('email-recipient');
    expect(recipient).toHaveTextContent('Maria');
    expect(recipient).toHaveTextContent('@maria89');
    expect(recipient).toHaveTextContent('maria@example.com');
  });

  it('requires a subject and a message before review', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('Subject is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Subject'), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('Message is required.')).toBeInTheDocument();
    expect(screen.queryByTestId('email-preview')).not.toBeInTheDocument();
  });

  it('previews the personalized email, falling back to the username', async () => {
    const { user } = setup({ ...RECIPIENT, display_name: null });

    await compose(user);

    const preview = screen.getByTestId('email-preview');
    expect(preview).toHaveTextContent('Hello maria89');
    expect(preview).toHaveTextContent('Hi maria89, welcome.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders a hostile display name as text in the preview', async () => {
    const { user } = setup({ ...RECIPIENT, display_name: '<img src=x onerror=alert(1)>' });

    await compose(user);

    const preview = screen.getByTestId('email-preview');
    expect(preview.querySelector('img')).toBeNull();
    expect(preview).toHaveTextContent('Hello <img src=x onerror=alert(1)>');
  });

  it('sends only subject, message and key, then reports success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(true, { data: { id: 'log-1', status: 'accepted' } }),
    );
    const { user, onSent } = setup();

    await compose(user);
    await user.click(screen.getByRole('button', { name: 'Send email' }));

    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith('Email to "maria89" accepted for delivery.'),
    );
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/admin/support/users/user-1/email');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      subject: 'Hello {{displayName}}',
      message: 'Hi {{displayName}}, welcome.',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('says when development only logged the email', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(true, { data: { id: 'log-1', status: 'simulated' } }),
    );
    const { user, onSent } = setup();

    await compose(user);
    await user.click(screen.getByRole('button', { name: 'Send email' }));

    await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.stringContaining('not sent')));
  });

  it('shows a loading state and ignores repeated clicks while sending', async () => {
    const pending: Deferred = { resolve: () => {} };
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise(resolve => {
        pending.resolve = resolve;
      }),
    );
    const { user, onSent } = setup();

    await compose(user);
    const sendButton = screen.getByRole('button', { name: 'Send email' });
    await user.click(sendButton);

    const sending = screen.getByRole('button', { name: 'Sending...' });
    expect(sending).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    await user.click(sending);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    pending.resolve(jsonResponse(true, { data: { status: 'accepted' } }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it('shows a provider failure and retries with a new key', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse(false, {
          error: 'The email provider rejected the message. Nothing was sent.',
          code: 'EMAIL_PROVIDER_ERROR',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(true, { data: { status: 'accepted' } }));
    const { user, onSent } = setup();

    await compose(user);
    await user.click(screen.getByRole('button', { name: 'Send email' }));

    expect(
      await screen.findByText('The email provider rejected the message. Nothing was sent.'),
    ).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Send email' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const [first, second] = sentBodies();
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('keeps the key after a network error or a duplicate, so a retry cannot send twice', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(
        jsonResponse(false, {
          error: 'This email has already been submitted.',
          code: 'DUPLICATE_SUBMISSION',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(false, { error: 'Still a duplicate' }));
    const { user } = setup();

    await compose(user);
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(await screen.findByText('Network down')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(await screen.findByText('This email has already been submitted.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send email' }));
    const keys = sentBodies().map(body => body.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
  });

  it('cancels from the compose step and edits from the review step', async () => {
    const { user, onClose } = setup();

    await compose(user);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Subject')).toHaveValue('Hello {{displayName}}');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
