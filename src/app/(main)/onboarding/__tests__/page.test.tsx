import { render, screen } from '@testing-library/react';
import OnboardingPage, { metadata } from '@/app/(main)/onboarding/page';

jest.mock('@/app/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <main data-testid="page-wrapper" className={className}>
      {children}
    </main>
  ),
}));

jest.mock('@/app/(main)/onboarding/OnboardingFlow', () => ({
  __esModule: true,
  default: () => <div data-testid="onboarding-flow" />,
}));

describe('OnboardingPage', () => {
  it('exports onboarding metadata', () => {
    expect(metadata.title).toBe('Get started');
    expect(metadata.description).toBe('Pick your hobbies and start tracking in seconds.');
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('renders the onboarding flow inside the page shell', () => {
    render(<OnboardingPage />);

    expect(screen.getByTestId('page-wrapper')).toHaveClass('mt-8');
    expect(screen.getByTestId('onboarding-flow')).toBeInTheDocument();
  });
});
