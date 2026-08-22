import { render, screen } from '@testing-library/react';
import RegisterPage, { metadata } from '@/app/(main)/auth/register/page';

jest.mock('@/app/components/auth/RegisterForm', () => ({
  __esModule: true,
  default: () => <div data-testid="register-form" />,
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

describe('RegisterPage', () => {
  it('exports expected metadata', () => {
    expect(metadata).toMatchObject({
      title: 'Register',
      description: 'Create your Hobbistas account and organize all your hobbies.',
    });
  });

  it('renders register hero content, highlights, and register form', () => {
    render(<RegisterPage />);

    expect(screen.getByTestId('page-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('intro-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('intro-mobile')).toBeInTheDocument();
    expect(screen.getAllByText('Start your journey').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Unified backlog')).toBeInTheDocument();
    expect(screen.getByText('Progress and stats')).toBeInTheDocument();
    expect(screen.getByText('Personalized discovery')).toBeInTheDocument();
    expect(screen.getByTestId('register-form')).toBeInTheDocument();
    expect(screen.getByText('Hobbistas')).toBeInTheDocument();
  });
});
