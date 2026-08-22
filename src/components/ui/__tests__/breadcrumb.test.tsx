import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

describe('breadcrumb primitives', () => {
  it('renders breadcrumb navigation, list, item, link, page, and forwards refs', () => {
    const navRef = createRef<HTMLElement>();
    const listRef = createRef<HTMLOListElement>();
    const itemRef = createRef<HTMLLIElement>();
    const linkRef = createRef<HTMLAnchorElement>();
    const pageRef = createRef<HTMLSpanElement>();

    render(
      <Breadcrumb ref={navRef} className="mb-2">
        <BreadcrumbList ref={listRef} className="gap-4" data-testid="breadcrumb-list">
          <BreadcrumbItem ref={itemRef} className="font-medium" data-testid="breadcrumb-item">
            <BreadcrumbLink ref={linkRef} href="/library" className="text-primary">
              Library
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage ref={pageRef} className="truncate">
              Dune
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    const nav = screen.getByRole('navigation', { name: 'breadcrumb' });
    const list = screen.getByTestId('breadcrumb-list');
    const item = screen.getByTestId('breadcrumb-item');
    const link = screen.getByRole('link', { name: 'Library' });
    const page = screen.getByRole('link', { name: 'Dune' });

    expect(nav).toHaveClass('mb-2');
    expect(list).toHaveClass('flex', 'flex-wrap', 'gap-4');
    expect(item).toHaveClass('inline-flex', 'font-medium');
    expect(link).toHaveAttribute('href', '/library');
    expect(link).toHaveClass('transition-colors', 'text-primary');
    expect(page).toHaveAttribute('aria-disabled', 'true');
    expect(page).toHaveAttribute('aria-current', 'page');
    expect(page).toHaveClass('font-normal', 'text-foreground', 'truncate');

    expect(navRef.current).toBe(nav);
    expect(listRef.current).toBe(list);
    expect(itemRef.current).toBe(item);
    expect(linkRef.current).toBe(link);
    expect(pageRef.current).toBe(page);
  });

  it('renders links as child elements when requested', () => {
    render(
      <BreadcrumbLink asChild className="underline">
        <button type="button">Open</button>
      </BreadcrumbLink>,
    );

    expect(screen.getByRole('button', { name: 'Open' })).toHaveClass(
      'transition-colors',
      'underline',
    );
  });

  it('renders default and custom separators', () => {
    const { container } = render(
      <>
        <BreadcrumbSeparator className="mx-1" data-testid="default-separator" />
        <BreadcrumbSeparator data-testid="custom-separator">/</BreadcrumbSeparator>
      </>,
    );

    expect(screen.getByTestId('default-separator')).toHaveClass('mx-1');
    expect(screen.getByTestId('custom-separator')).toHaveTextContent('/');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders ellipsis with an accessible screen-reader label', () => {
    render(<BreadcrumbEllipsis className="text-muted" data-testid="breadcrumb-ellipsis" />);

    const ellipsis = screen.getByTestId('breadcrumb-ellipsis');
    expect(ellipsis).toHaveAttribute('aria-hidden', 'true');
    expect(ellipsis).toHaveClass('flex', 'h-9', 'w-9', 'text-muted');
    expect(screen.getByText('More')).toHaveClass('sr-only');
  });
});
