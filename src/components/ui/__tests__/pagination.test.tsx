import { render, screen } from '@testing-library/react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

describe('Pagination primitives', () => {
  it('renders the navigation landmark with label and custom classes', () => {
    render(
      <Pagination className="custom-pagination" data-testid="pagination">
        Pages
      </Pagination>,
    );

    const pagination = screen.getByRole('navigation', { name: 'pagination' });
    expect(pagination).toHaveAttribute('data-testid', 'pagination');
    expect(pagination).toHaveClass('mx-auto', 'justify-center', 'custom-pagination');
    expect(pagination).toHaveTextContent('Pages');
  });

  it('renders content and item wrappers', () => {
    render(
      <Pagination>
        <PaginationContent className="custom-content" data-testid="pagination-content">
          <PaginationItem className="custom-item" data-testid="pagination-item">
            <PaginationLink href="/page/1">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    const content = screen.getByTestId('pagination-content');
    expect(content.tagName).toBe('UL');
    expect(content).toHaveClass('flex-row', 'items-center', 'custom-content');

    const item = screen.getByTestId('pagination-item');
    expect(item.tagName).toBe('LI');
    expect(item).toHaveClass('custom-item');
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('href', '/page/1');
  });

  it('renders active and inactive links with size variants', () => {
    render(
      <>
        <PaginationLink href="/page/1" isActive className="active-link">
          1
        </PaginationLink>
        <PaginationLink href="/page/2" size="default" className="inactive-link">
          2
        </PaginationLink>
      </>,
    );

    const active = screen.getByRole('link', { name: '1' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('border-border', 'active-link');

    const inactive = screen.getByRole('link', { name: '2' });
    expect(inactive).not.toHaveAttribute('aria-current');
    expect(inactive).toHaveClass('hover:bg-surface-hover', 'inactive-link');
  });

  it('renders previous and next links with labels, icons, and custom classes', () => {
    render(
      <>
        <PaginationPrevious href="/page/1" className="previous-link" />
        <PaginationNext href="/page/3" className="next-link" />
      </>,
    );

    const previous = screen.getByRole('link', { name: 'Go to previous page' });
    expect(previous).toHaveAttribute('href', '/page/1');
    expect(previous).toHaveClass('gap-1', 'pl-2.5', 'previous-link');
    expect(previous).toHaveTextContent('Previous');
    expect(previous.querySelector('svg')).toHaveClass('h-4', 'w-4');

    const next = screen.getByRole('link', { name: 'Go to next page' });
    expect(next).toHaveAttribute('href', '/page/3');
    expect(next).toHaveClass('gap-1', 'pr-2.5', 'next-link');
    expect(next).toHaveTextContent('Next');
    expect(next.querySelector('svg')).toHaveClass('h-4', 'w-4');
  });

  it('renders an aria-hidden ellipsis with screen-reader text', () => {
    render(<PaginationEllipsis className="custom-ellipsis" data-testid="ellipsis" />);

    const ellipsis = screen.getByTestId('ellipsis');
    expect(ellipsis).toHaveAttribute('aria-hidden', 'true');
    expect(ellipsis).toHaveClass('h-9', 'w-9', 'custom-ellipsis');
    expect(ellipsis.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(screen.getByText('More pages')).toHaveClass('sr-only');
  });
});
