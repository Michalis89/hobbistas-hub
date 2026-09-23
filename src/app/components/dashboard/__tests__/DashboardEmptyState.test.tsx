import { render, screen } from '@testing-library/react';
import DashboardEmptyState from '../DashboardEmptyState';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  __esModule: true,
  Button: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('DashboardEmptyState', () => {
  it('offers a route into each category the user picked', () => {
    render(<DashboardEmptyState categories={['games', 'books']} />);

    expect(screen.getByRole('link', { name: /games.*add your first game/i })).toHaveAttribute(
      'href',
      '/backlog?category=games',
    );
    expect(screen.getByRole('link', { name: /books.*add your first book/i })).toHaveAttribute(
      'href',
      '/backlog?category=books',
    );
  });

  it('does not advertise categories the user did not pick', () => {
    render(<DashboardEmptyState categories={['games']} />);

    expect(screen.queryByText(/add your first movie/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add your first book/i)).not.toBeInTheDocument();
  });

  it('explains why the page is empty rather than just showing zeros', () => {
    render(<DashboardEmptyState categories={['games']} />);

    expect(
      screen.getByRole('heading', { name: /your dashboard fills up as you add titles/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/built from your own library/i)).toBeInTheDocument();
  });

  it('links to category settings for anything not listed', () => {
    render(<DashboardEmptyState categories={['games']} />);

    expect(screen.getByRole('link', { name: /change your categories/i })).toHaveAttribute(
      'href',
      '/profile/edit#categories',
    );
  });

  it('renders nothing when there are no categories to point at', () => {
    const { container } = render(<DashboardEmptyState categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
