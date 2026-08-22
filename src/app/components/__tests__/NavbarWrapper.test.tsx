import { render, screen } from '@testing-library/react';
import NavbarWrapper from '@/app/components/NavbarWrapper';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('next/dynamic', () => () => {
  function DynamicNavbar() {
    return <div data-testid="dynamic-navbar" />;
  }
  return DynamicNavbar;
});

const usePathnameMock = usePathname as jest.Mock;

describe('NavbarWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render the navbar in admin support routes', () => {
    usePathnameMock.mockReturnValue('/admin/support/tickets');

    const { container } = render(<NavbarWrapper />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dynamic navbar with top spacing on normal routes', () => {
    usePathnameMock.mockReturnValue('/dashboard');

    render(<NavbarWrapper />);

    expect(screen.getByTestId('dynamic-navbar').parentElement).toHaveClass('pt-16');
  });

  it('handles a null pathname from the navigation hook', () => {
    usePathnameMock.mockReturnValue(null);

    render(<NavbarWrapper />);

    expect(screen.getByTestId('dynamic-navbar')).toBeInTheDocument();
  });
});
