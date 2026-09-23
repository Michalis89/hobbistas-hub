import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { USER_SETTINGS_DEFAULTS, type UserSettingsData } from '@/lib/settings/types';

const mutateMock = jest.fn();
const setThemePreferenceMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

jest.mock('@/lib/settings/useUserSettings', () => ({
  useUserSettings: () => ({ mutate: mutateMock }),
}));

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ setThemePreference: setThemePreferenceMock }),
}));

jest.mock('@/app/components/settings/NotificationSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="notification-settings" />,
}));

jest.mock('@/app/components/settings/ShareLinkCard', () => ({
  __esModule: true,
  default: () => <div data-testid="share-link-card" />,
}));

jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h4>{children}</h4>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked: boolean;
    onCheckedChange?: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
      switch
    </button>
  ),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({
    onValueChange,
    disabled,
    children,
  }: {
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <div>
      <button onClick={() => onValueChange?.('dm')} disabled={disabled}>
        set-dm
      </button>
      <button onClick={() => onValueChange?.('player')} disabled={disabled}>
        set-player
      </button>
      <button onClick={() => onValueChange?.('invalid')} disabled={disabled}>
        set-invalid
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/tabs', () => {
  const ReactLib = jest.requireActual('react') as typeof import('react');
  const Ctx = ReactLib.createContext<{ onValueChange?: (v: string) => void }>({});

  return {
    Tabs: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (v: string) => void;
    }) => <Ctx.Provider value={{ onValueChange }}>{children}</Ctx.Provider>,
    TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TabsTrigger: ({
      children,
      value,
      disabled,
    }: {
      children: React.ReactNode;
      value: string;
      disabled?: boolean;
    }) => {
      const ctx = ReactLib.useContext(Ctx) as { onValueChange?: (v: string) => void };
      return (
        <button onClick={() => ctx.onValueChange?.(value)} disabled={disabled}>
          {children}
        </button>
      );
    },
  };
});

import { SettingsForm } from '@/app/(main)/settings/SettingsForm';

const baseSettings: UserSettingsData = {
  user_id: 'u1',
  created_at: null,
  updated_at: null,
  theme: 'system',
  social_enabled: true,
  community_activity_enabled: true,
  community_suggestions_enabled: true,
  social_profile_enabled: true,
  articles_enabled: true,
  reviews_enabled: true,
  diary_enabled: true,
  dnd_enabled: true,
  dnd_role: 'dm',
  ticket_notifications_enabled: true,
  follows_notifications_enabled: true,
  dms_notifications_enabled: true,
};

describe('SettingsForm', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const setNodeEnv = (value: string | undefined) => {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setNodeEnv('test');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: baseSettings }),
    }) as jest.Mock;
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv);
  });

  it('renders key sections and helper components', async () => {
    render(<SettingsForm initialSettings={baseSettings} />);

    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Social Layer')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
    expect(screen.getByTestId('share-link-card')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset settings' })).toBeInTheDocument();
    });
  });

  it('saves theme change and mutates cache', async () => {
    render(<SettingsForm initialSettings={baseSettings} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    const [, config] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(String(config.body))).toEqual({ theme: 'dark' });
    expect(setThemePreferenceMock).toHaveBeenCalledWith('dark');
    expect(mutateMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Settings saved');
  });

  it('shows error and rolls back theme when save fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Boom' }),
    });

    render(<SettingsForm initialSettings={baseSettings} />);

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t save settings/)).toBeInTheDocument();
    });

    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(setThemePreferenceMock).toHaveBeenCalledWith('light');
    expect(setThemePreferenceMock).toHaveBeenCalledWith('system');
    // The toast carries the server's reason, matching the banner beside it.
    expect(toastErrorMock).toHaveBeenCalledWith('Boom');
  });

  it('normalizes social disable payload', async () => {
    render(<SettingsForm initialSettings={baseSettings} />);

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    });

    const socialBody = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(socialBody).toEqual({
      social_enabled: false,
      community_activity_enabled: false,
      community_suggestions_enabled: false,
      social_profile_enabled: false,
    });
  });

  it('normalizes dnd disable payload by clearing dnd_role', async () => {
    render(<SettingsForm initialSettings={baseSettings} />);

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[5]);

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    });

    const dndBody = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(dndBody).toEqual({ dnd_enabled: false, dnd_role: null });
  });

  it('handles dnd role change and ignores invalid select value', async () => {
    render(<SettingsForm initialSettings={baseSettings} />);

    fireEvent.click(screen.getByRole('button', { name: 'set-player' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-invalid' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(body).toEqual({ dnd_role: 'player' });
  });

  it('wires every switch callback to a save request', async () => {
    for (let idx = 0; idx <= 10; idx += 1) {
      const view = render(<SettingsForm initialSettings={baseSettings} />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[idx]);

      await waitFor(() => {
        expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
      });

      const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
      expect(Object.keys(body).length).toBeGreaterThan(0);

      (global.fetch as jest.Mock).mockClear();
      view.unmount();
      cleanup();
    }
  });

  it('applies defaults when reset action is triggered', async () => {
    render(<SettingsForm initialSettings={baseSettings} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset settings' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(body).toEqual(USER_SETTINGS_DEFAULTS);
  });

  it('renders production badges and production notice in prod env', () => {
    setNodeEnv('production');

    render(<SettingsForm initialSettings={baseSettings} />);

    expect(screen.getAllByText('Coming Soon').length).toBeGreaterThan(0);
    expect(screen.getByText('Expandable')).toBeInTheDocument();
    expect(screen.getByText('Production Environment')).toBeInTheDocument();
  });

  it('renders social and dnd conditional text blocks for disabled states', () => {
    render(
      <SettingsForm
        initialSettings={{
          ...baseSettings,
          social_enabled: false,
          diary_enabled: false,
          dnd_enabled: false,
          dnd_role: null,
        }}
      />,
    );

    expect(
      screen.getByText('Your space stays private and personal until you enable the social layer.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/As a DM/)).not.toBeInTheDocument();
    expect(screen.queryByText(/As a Player/)).not.toBeInTheDocument();
  });
});
