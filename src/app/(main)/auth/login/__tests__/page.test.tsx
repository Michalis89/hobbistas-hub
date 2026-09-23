import { render, screen } from '@testing-library/react';
import LoginPage, { metadata } from '@/app/(main)/auth/login/page';

jest.mock('@/app/components/auth/LoginForm', () => ({
  __esModule: true,
  default: () => <div data-testid="login-form" />,
}));

jest.mock('@/app/components/auth/shared/AuthIntroHeading', () => ({
  __esModule: true,
  AuthIntroHeading: ({
    variant,
    eyebrow,
    title,
    description,
  }: {
    variant: string;
    eyebrow: string;
    title: string;
    description: string;
  }) => (
    <div data-testid={`intro-${variant}`}>
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

jest.mock('@/app/components/layout/PageWrapper', () => ({
  __esModule: true,
  PageWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-wrapper">{children}</div>
  ),
}));

describe('LoginPage', () => {
  it('exports expected metadata', () => {
    expect(metadata).toMatchObject({
      title: 'Login',
      description: 'Sign in to Hobbistas and keep all your hobbies organized in one place.',
    });
  });

  it('renders login hero content, highlights, and login form', () => {
    render(<LoginPage />);

    expect(screen.getByTestId('page-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('intro-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('intro-mobile')).toBeInTheDocument();
    expect(screen.getAllByText('Continue your journey').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Your progress is waiting')).toBeInTheDocument();
    expect(screen.getByText('Instant continuity')).toBeInTheDocument();
    expect(screen.getByText('Secure access')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.getByText('Hobbistas')).toBeInTheDocument();
  });
});
