import { render, screen } from '@testing-library/react';
import RouteAwareAuthInit from '@/app/components/RouteAwareAuthInit';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('next/dynamic', () => () => {
  function DynamicAuthInit() {
    return <div data-testid="dynamic-auth-init" />;
  }
  return DynamicAuthInit;
});

const usePathnameMock = usePathname as jest.Mock;

function mockMatchMedia(matchesByQuery: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn((query: string) => ({
      matches: matchesByQuery[query] ?? false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe('RouteAwareAuthInit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMatchMedia({});
  });

  it('skips auth init on auth routes', () => {
    usePathnameMock.mockReturnValue('/auth/login');

    const { container } = render(<RouteAwareAuthInit />);

    expect(container).toBeEmptyDOMElement();
  });

  it('skips auth init on mobile home', () => {
    usePathnameMock.mockReturnValue('/home');
    mockMatchMedia({ '(max-width: 768px)': true });

    const { container } = render(<RouteAwareAuthInit />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders auth init on app routes and handles null pathname', () => {
    usePathnameMock.mockReturnValue(null);

    render(<RouteAwareAuthInit />);

    expect(screen.getByTestId('dynamic-auth-init')).toBeInTheDocument();
  });
});
