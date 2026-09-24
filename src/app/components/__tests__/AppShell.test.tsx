import { render, screen } from '@testing-library/react';
import AppShell from '@/app/components/AppShell';

jest.mock('@/app/components/NavbarWrapper', () => ({
  __esModule: true,
  default: () => <nav data-testid="navbar-wrapper" />,
}));

jest.mock('@/app/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer" />,
}));

jest.mock('@/app/components/shared/AppRuntimeEnhancements', () => ({
  __esModule: true,
  default: () => <div data-testid="runtime-enhancements" />,
}));

jest.mock('@/app/components/shared/DemoBanner.client', () => ({
  __esModule: true,
  default: () => <div data-testid="demo-banner" />,
}));

jest.mock('@/context/TicketNotificationContext', () => ({
  TicketNotificationProvider: ({ children }: { children: React.ReactNode }) => (
    <section data-testid="ticket-provider">{children}</section>
  ),
}));

describe('AppShell', () => {
  it('renders the runtime hooks, navigation, main content, and footer', () => {
    render(
      <AppShell>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    expect(screen.getByTestId('runtime-enhancements')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-provider')).toBeInTheDocument();
    expect(screen.getByTestId('navbar-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('demo-banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { name: 'Dashboard content' })).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });
});
