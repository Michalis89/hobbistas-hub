import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from '@/app/components/Navbar';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '@/context/ThemeContext';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { useTicketNotificationCount } from '@/lib/hooks/useTicketNotificationCount';
import { logout } from '@/store/slices/authSlice';

const replaceMock = jest.fn();
const pushMock = jest.fn();
const dispatchMock = jest.fn();
const mutateSettingsMock = jest.fn();
const setThemePreferenceMock = jest.fn();

type NavbarAuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: null | {
    id: string;
    username?: string;
    category_profile?: Record<string, unknown>;
  };
  canQuickAdd: boolean;
  canAccessAdminPanel: boolean;
};

let navbarAuth: NavbarAuthState;
let pathname = '/dashboard';
let queryString = '';
let themeState: { theme: 'dark' | 'light'; themePreference: 'dark' | 'light' | 'system' };
let settingsState: Record<string, unknown> | null;

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'auth/logout' })),
  selectNavbarAuth: jest.fn(),
}));

jest.mock('@/context/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('@/lib/settings/useUserSettings', () => ({
  useUserSettings: jest.fn(),
}));

jest.mock('@/lib/hooks/useTicketNotificationCount', () => ({
  useTicketNotificationCount: jest.fn(),
}));

jest.mock('@/app/components/navbar/LogoBrand', () => ({
  LogoBrand: ({ href }: { href: string }) => <a href={href}>Logo {href}</a>,
}));

jest.mock('@/app/components/navbar/DesktopNav', () => ({
  DesktopNav: (props: Record<string, unknown>) => (
    <div data-testid="desktop-nav">
      <span data-testid="desktop-nav-count">{(props.navItems as unknown[]).length}</span>
      <span data-testid="desktop-hobby-count">{(props.hobbyItems as unknown[]).length}</span>
      <span data-testid="desktop-dnd-count">{(props.dndTools as unknown[]).length}</span>
      <span data-testid="desktop-ticket-count">{String(props.hasAnyTicketUnread)}</span>
      <button type="button" onClick={props.onAdd as () => void}>
        Desktop add
      </button>
      <button type="button" onClick={props.onLogout as () => void}>
        Desktop logout
      </button>
      <button type="button" onClick={props.onToggleTheme as () => void}>
        Desktop theme
      </button>
    </div>
  ),
}));

jest.mock('@/app/components/navbar/MobileNavSheet', () => ({
  MobileNavSheet: (props: Record<string, unknown>) => (
    <div data-testid="mobile-nav" data-open={String(props.open)}>
      <span data-testid="mobile-authenticated">{String(props.isAuthenticated)}</span>
      <span data-testid="mobile-admin-count">{String(props.adminTicketUnreadCount)}</span>
      <button type="button" onClick={() => (props.onOpenChange as (open: boolean) => void)(true)}>
        Open mobile
      </button>
      <button type="button" onClick={props.onAdd as () => void}>
        Mobile add
      </button>
      <button type="button" onClick={props.onLogout as () => void}>
        Mobile logout
      </button>
      <button type="button" onClick={props.onToggleTheme as () => void}>
        Mobile theme
      </button>
    </div>
  ),
}));

const usePathnameMock = usePathname as jest.Mock;
const useRouterMock = useRouter as jest.Mock;
const useSearchParamsMock = useSearchParams as jest.Mock;
const useDispatchMock = useDispatch as unknown as jest.Mock;
const useSelectorMock = useSelector as unknown as jest.Mock;
const useThemeMock = useTheme as jest.Mock;
const useUserSettingsMock = useUserSettings as jest.Mock;
const useTicketNotificationCountMock = useTicketNotificationCount as jest.Mock;

function mockMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn(() => ({
      matches,
      media: '',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe('Navbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pathname = '/dashboard';
    queryString = '';
    navbarAuth = {
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-1', username: 'michalis', category_profile: { games: {}, books: {} } },
      canQuickAdd: true,
      canAccessAdminPanel: true,
    };
    themeState = { theme: 'dark', themePreference: 'dark' };
    settingsState = {
      articles_enabled: true,
      reviews_enabled: true,
      social_profile_enabled: true,
      diary_enabled: true,
      dnd_enabled: true,
      dnd_role: 'dm',
      theme: 'dark',
    };
    dispatchMock.mockResolvedValue({ type: 'ok' });
    global.fetch = jest.fn() as unknown as typeof fetch;
    mockMatchMedia(false);

    usePathnameMock.mockImplementation(() => pathname);
    useRouterMock.mockReturnValue({ replace: replaceMock, push: pushMock });
    useSearchParamsMock.mockImplementation(() => ({ toString: () => queryString }));
    useDispatchMock.mockReturnValue(dispatchMock);
    useSelectorMock.mockImplementation(() => navbarAuth);
    useThemeMock.mockImplementation(() => ({
      ...themeState,
      setThemePreference: setThemePreferenceMock,
    }));
    useUserSettingsMock.mockImplementation((enabled: boolean) => ({
      settings: enabled ? settingsState : null,
      mutate: mutateSettingsMock,
    }));
    useTicketNotificationCountMock.mockReturnValue({
      userCount: 2,
      adminCount: 3,
      totalCount: 5,
    });
  });

  it('renders the loading skeleton while authenticated state is unresolved', () => {
    pathname = '/admin';
    navbarAuth = {
      isAuthenticated: true,
      isLoading: true,
      user: null,
      canQuickAdd: false,
      canAccessAdminPanel: false,
    };

    render(<Navbar />);

    expect(screen.queryByTestId('desktop-nav')).not.toBeInTheDocument();
    expect(document.querySelector('.max-w-none')).toBeInTheDocument();
  });

  it('renders authenticated navigation data, opens and closes quick add, and tracks mobile open state', async () => {
    const user = userEvent.setup();

    render(<Navbar />);

    expect(screen.getByRole('link', { name: 'Logo /dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByTestId('desktop-nav-count')).toHaveTextContent('7');
    expect(screen.getByTestId('desktop-hobby-count')).toHaveTextContent('2');
    expect(screen.getByTestId('desktop-dnd-count')).toHaveTextContent('2');
    expect(screen.getByTestId('desktop-ticket-count')).toHaveTextContent('true');
    expect(screen.getByTestId('mobile-authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('mobile-admin-count')).toHaveTextContent('3');

    await user.click(screen.getByRole('button', { name: 'Desktop add' }));
    expect(pushMock).toHaveBeenCalledWith('/studio/new');

    pushMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Mobile add' }));
    expect(pushMock).toHaveBeenCalledWith('/studio/new');

    await user.click(screen.getByRole('button', { name: 'Open mobile' }));
    expect(screen.getByTestId('mobile-nav')).toHaveAttribute('data-open', 'true');
  });

  it('syncs loaded theme settings into the theme context', async () => {
    themeState = { theme: 'dark', themePreference: 'light' };
    settingsState = { ...settingsState, theme: 'dark' };

    render(<Navbar />);

    await waitFor(() => {
      expect(setThemePreferenceMock).toHaveBeenCalledWith('dark');
    });
  });

  it('persists theme changes for authenticated users and applies server response data', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn(async () => ({ data: { ...settingsState, theme: 'light' } })),
    });

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: 'Desktop theme' }));

    expect(setThemePreferenceMock).toHaveBeenCalledWith('light');
    expect(mutateSettingsMock).toHaveBeenCalledWith({ ...settingsState, theme: 'light' }, false);
    expect(global.fetch).toHaveBeenCalledWith('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'light' }),
    });
    await waitFor(() => {
      expect(mutateSettingsMock).toHaveBeenLastCalledWith(
        { ...settingsState, theme: 'light' },
        false,
      );
    });
  });

  it('ignores duplicate theme toggles while a save is in progress', async () => {
    const user = userEvent.setup();
    let resolveThemeSave!: (value: unknown) => void;
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise(resolve => {
        resolveThemeSave = resolve;
      }),
    );

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: 'Desktop theme' }));
    await waitFor(() => {
      expect(setThemePreferenceMock).toHaveBeenCalledWith('light');
    });

    await user.click(screen.getByRole('button', { name: 'Desktop theme' }));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveThemeSave({
        ok: true,
        json: jest.fn(async () => ({ data: { ...settingsState, theme: 'light' } })),
      });
    });
  });

  it('rolls back theme changes when persistence fails', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: jest.fn(async () => ({ error: 'Nope' })),
    });

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: 'Desktop theme' }));

    await waitFor(() => {
      expect(setThemePreferenceMock).toHaveBeenLastCalledWith('dark');
    });
    expect(mutateSettingsMock).toHaveBeenLastCalledWith(settingsState, false);
  });

  it('toggles local theme only when settings should not load', async () => {
    const user = userEvent.setup();
    pathname = '/home';
    navbarAuth = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      canQuickAdd: false,
      canAccessAdminPanel: false,
    };

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: 'Mobile theme' }));

    expect(setThemePreferenceMock).toHaveBeenCalledWith('light');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('redirects protected routes to login after logout', async () => {
    const user = userEvent.setup();
    pathname = '/dashboard';
    queryString = 'tab=library';

    render(<Navbar />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Desktop logout' }));
    });

    expect(dispatchMock).toHaveBeenCalledWith(logout());
    expect(replaceMock).toHaveBeenCalledWith('/auth/login?redirect=%2Fdashboard%3Ftab%3Dlibrary');
  });
});
