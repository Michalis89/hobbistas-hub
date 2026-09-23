import { render, screen } from '@testing-library/react';
import ConfirmEmailPage, { metadata } from '@/app/(main)/auth/confirm-email/page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/alert', () => ({
  __esModule: true,
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock('@/components/ui/button', () => ({
  __esModule: true,
  Button: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/card', () => ({
  __esModule: true,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/separator', () => ({
  __esModule: true,
  Separator: () => <hr />,
}));

jest.mock('@/app/(main)/auth/confirm-email/SuccessAutoRedirect', () => ({
  __esModule: true,
  default: ({ seconds }: { seconds?: number }) => (
    <div data-testid="success-auto-redirect">{seconds}</div>
  ),
}));

describe('ConfirmEmailPage', () => {
  it('exports expected metadata', () => {
    expect(metadata).toMatchObject({
      title: 'Confirm Email',
      description: 'Email confirmation and verification flow.',
      robots: { index: false, follow: false },
    });
  });

  it('renders pending variant', async () => {
    render(await ConfirmEmailPage({ searchParams: Promise.resolve({ state: 'pending' }) }));

    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('Verification pending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    expect(screen.queryByTestId('success-auto-redirect')).not.toBeInTheDocument();
  });

  it('renders error variant when query includes error fields', async () => {
    render(
      await ConfirmEmailPage({
        searchParams: Promise.resolve({ error_description: 'expired' }),
      }),
    );

    expect(screen.getByRole('heading', { name: 'Link expired' })).toBeInTheDocument();
    expect(screen.getByText('Nothing was lost')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    // An expired link must offer a way out; sending people back to register was
    // a dead end because the address already exists.
    expect(screen.getByText(/resend verification email/i)).toBeInTheDocument();
    expect(screen.queryByTestId('success-auto-redirect')).not.toBeInTheDocument();
  });

  it('renders success variant and auto redirect helper by default', async () => {
    render(await ConfirmEmailPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: "You're verified" })).toBeInTheDocument();
    expect(screen.getByText('Confirmation complete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    expect(screen.getByTestId('success-auto-redirect')).toHaveTextContent('6');
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
  });
});
