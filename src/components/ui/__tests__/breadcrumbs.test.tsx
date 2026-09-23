import { render, screen } from '@testing-library/react';
import Breadcrumbs from '@/components/ui/breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders nothing when items are empty', () => {
    const { container, rerender } = render(<Breadcrumbs items={[]} />);

    expect(container).toBeEmptyDOMElement();

    rerender(<Breadcrumbs items={undefined as unknown as []} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders linked ancestors, current page, separators, and custom classes', () => {
    const { container } = render(
      <Breadcrumbs
        className="text-primary"
        items={[
          { label: 'Home', href: '/' },
          { label: 'Library' },
          { label: 'Dune', href: '/books/dune' },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(nav).toHaveClass('text-sm', 'text-primary');

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dune' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dune' })).not.toHaveAttribute('href');
    expect(container.querySelectorAll('li[role="presentation"]')).toHaveLength(2);
  });
});
