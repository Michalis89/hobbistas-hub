import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useSelectorMock = jest.fn();

jest.mock('@/context/LocaleContext', () => ({ useLocale: () => 'en-US' }));
jest.mock('react-redux', () => ({ useSelector: () => useSelectorMock() }));
jest.mock('@/store/slices/authSlice', () => ({ selectUser: jest.fn() }));

import AdminUsersManagementTable from '../AdminUsersManagementTable.client';

const content = { library: 0, diary: 0, articles: 0, comments: 0, characterSheets: 0, total: 0 };

const row = (id: string, username: string, emailConfirmed: boolean, accountStatus = 'active') => ({
  id,
  username,
  display_name: null,
  full_name: null,
  email: `${username}@example.com`,
  account_status: accountStatus,
  country: null,
  roles: ['user'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  last_login: null,
  activity: { status: 'active', emailConfirmed, lastSignInAt: null, content },
});

const ROWS = [
  row('1', 'reader', true),
  row('2', 'pending', false),
  row('3', 'gone', true, 'deleted'),
];

describe('AdminUsersManagementTable send email action', () => {
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: ROWS,
        meta: { total: 3, limit: 20, offset: 0, filters: { roles: ['user'], statuses: [] } },
      }),
    }) as unknown as typeof fetch;
  });

  it('is hidden from admins who are not owner', async () => {
    useSelectorMock.mockReturnValue({ roles: ['user', 'admin'] });
    render(<AdminUsersManagementTable />);

    await screen.findByText('reader@example.com');
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });

  it('lets the owner open the composer for an eligible user', async () => {
    useSelectorMock.mockReturnValue({ roles: ['user', 'owner'] });
    const user = userEvent.setup();
    render(<AdminUsersManagementTable />);

    await user.click(await screen.findByRole('button', { name: 'More actions for reader' }));
    await user.click(await screen.findByRole('menuitem', { name: /Send email/ }));

    expect(await screen.findByTestId('email-recipient')).toHaveTextContent('reader@example.com');
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
  });

  it.each([
    ['pending', 'Email not confirmed'],
    ['gone', 'Account deleted'],
  ])('disables the action for %s with a reason', async (username, reason) => {
    useSelectorMock.mockReturnValue({ roles: ['owner'] });
    const user = userEvent.setup();
    render(<AdminUsersManagementTable />);

    await user.click(await screen.findByRole('button', { name: `More actions for ${username}` }));
    const item = await screen.findByRole('menuitem', { name: /Send email/ });

    expect(item).toHaveAttribute('data-disabled');
    expect(within(item).getByText(reason)).toBeInTheDocument();
  });
});
