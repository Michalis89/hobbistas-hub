import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/context/LocaleContext', () => ({ useLocale: () => 'en-US' }));
// A non-owner admin: no per-row actions menu, so the row's last button is Delete.
jest.mock('react-redux', () => ({ useSelector: () => ({ roles: ['admin'] }) }));
jest.mock('@/store/slices/authSlice', () => ({ selectUser: jest.fn() }));

import AdminUsersManagementTable from '../AdminUsersManagementTable.client';

const content = (overrides: Partial<Record<string, number>> = {}) => {
  const counts = {
    library: 0,
    diary: 0,
    articles: 0,
    comments: 0,
    characterSheets: 0,
    ...overrides,
  };
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
};

const row = (id: string, username: string, activity: unknown) => ({
  id,
  username,
  display_name: username,
  full_name: null,
  email: `${username}@example.com`,
  account_status: 'active',
  country: 'GR',
  roles: ['user'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  last_login: null,
  activity,
});

const ROWS = [
  row('1', 'reader', {
    status: 'active',
    emailConfirmed: true,
    lastSignInAt: '2026-10-20T10:00:00Z',
    content: content({ library: 120, diary: 3 }),
  }),
  row('2', 'ghost', {
    status: 'never_signed_in',
    emailConfirmed: true,
    lastSignInAt: null,
    content: content(),
  }),
  row('3', 'pending', {
    status: 'unverified',
    emailConfirmed: false,
    lastSignInAt: null,
    content: content(),
  }),
  row('4', 'legacy', null),
];

describe('AdminUsersManagementTable status and content', () => {
  // jsdom has no <dialog> modal API; the AlertDialog opens through it
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
        meta: {
          total: 4,
          limit: 20,
          offset: 0,
          filters: { roles: ['user'], statuses: ['active'] },
        },
      }),
    }) as unknown as typeof fetch;
  });

  it('shows the derived status instead of the raw account status', async () => {
    render(<AdminUsersManagementTable />);

    const statuses = await screen.findAllByTestId('user-activity-status');
    expect(statuses.map(badge => badge.textContent)).toEqual([
      'Active',
      'Never signed in',
      'Unverified email',
    ]);
    expect(statuses[0]).toHaveAttribute('title', expect.stringContaining('Account: active'));
  });

  it('summarises content and marks users who created nothing', async () => {
    render(<AdminUsersManagementTable />);

    const cells = await screen.findAllByTestId('user-content');
    expect(cells[0]).toHaveTextContent('Library 120 · Diary 3');
    expect(cells[1]).toHaveTextContent('No data');
    // Overview unavailable (migration not applied): no claim either way
    expect(cells[3]).toHaveTextContent('-');
  });

  it('no longer has a Country column', async () => {
    render(<AdminUsersManagementTable />);

    await screen.findAllByTestId('user-content');
    expect(screen.queryByRole('columnheader', { name: 'Country' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Content' })).toBeInTheDocument();
  });

  it('says what content a deletion removes', async () => {
    render(<AdminUsersManagementTable />);

    const readerRow = (await screen.findByText('reader@example.com')).closest('tr')!;
    const buttons = within(readerRow).getAllByRole('button');
    await userEvent.click(buttons[buttons.length - 1]);

    expect(
      await screen.findByText(/Their content goes with it: Library 120 · Diary 3\./),
    ).toBeInTheDocument();
  });
});
