import { render, screen } from '@testing-library/react';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item';

const Icon = () => <svg data-testid="item-icon" />;

describe('Item group and separator', () => {
  it('renders a list group with custom classes and forwarded props', () => {
    render(
      <ItemGroup className="custom-group" data-testid="item-group">
        <Item>First</Item>
      </ItemGroup>,
    );

    const group = screen.getByTestId('item-group');
    expect(group).toHaveAttribute('role', 'list');
    expect(group).toHaveAttribute('data-slot', 'item-group');
    expect(group).toHaveClass('flex', 'flex-col', 'custom-group');
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('renders a horizontal item separator', () => {
    render(<ItemSeparator className="custom-separator" decorative={false} />);

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('data-slot', 'item-separator');
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    expect(separator).toHaveClass('my-0', 'custom-separator');
  });
});

describe('Item', () => {
  it('renders the default item as a group-like div with variant metadata', () => {
    render(
      <Item className="custom-item" data-testid="item">
        Default item
      </Item>,
    );

    const item = screen.getByTestId('item');
    expect(item.tagName).toBe('DIV');
    expect(item).toHaveAttribute('data-slot', 'item');
    expect(item).toHaveAttribute('data-variant', 'default');
    expect(item).toHaveAttribute('data-size', 'default');
    expect(item).toHaveClass('group/item', 'bg-transparent', 'gap-4', 'p-4', 'custom-item');
  });

  it('renders outline and muted variants with small sizing', () => {
    render(
      <>
        <Item variant="outline" size="sm" data-testid="outline-item">
          Outline
        </Item>
        <Item variant="muted" size="sm" data-testid="muted-item">
          Muted
        </Item>
      </>,
    );

    expect(screen.getByTestId('outline-item')).toHaveAttribute('data-variant', 'outline');
    expect(screen.getByTestId('outline-item')).toHaveClass('border-border', 'gap-2.5', 'px-4');

    expect(screen.getByTestId('muted-item')).toHaveAttribute('data-variant', 'muted');
    expect(screen.getByTestId('muted-item')).toHaveClass('bg-muted/50', 'gap-2.5', 'py-3');
  });

  it('renders as a child element through Slot', () => {
    render(
      <Item asChild variant="outline" size="sm">
        <a href="/library">Open library</a>
      </Item>,
    );

    const link = screen.getByRole('link', { name: 'Open library' });
    expect(link).toHaveAttribute('href', '/library');
    expect(link).toHaveAttribute('data-slot', 'item');
    expect(link).toHaveAttribute('data-variant', 'outline');
    expect(link).toHaveAttribute('data-size', 'sm');
    expect(link).toHaveClass('border-border', 'gap-2.5');
  });
});

describe('Item child slots', () => {
  it('renders media variants with slot and variant attributes', () => {
    const { rerender } = render(
      <ItemMedia className="custom-media" data-testid="item-media">
        <Icon />
      </ItemMedia>,
    );

    const media = screen.getByTestId('item-media');
    expect(media).toHaveAttribute('data-slot', 'item-media');
    expect(media).toHaveAttribute('data-variant', 'default');
    expect(media).toHaveClass('bg-transparent', 'custom-media');
    expect(screen.getByTestId('item-icon')).toBeInTheDocument();

    rerender(
      <ItemMedia variant="icon" data-testid="item-media">
        <Icon />
      </ItemMedia>,
    );

    expect(screen.getByTestId('item-media')).toHaveAttribute('data-variant', 'icon');
    expect(screen.getByTestId('item-media')).toHaveClass('bg-muted', 'size-8', 'rounded-sm');

    rerender(
      <ItemMedia variant="image" data-testid="item-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Cover" src="/cover.jpg" />
      </ItemMedia>,
    );

    expect(screen.getByTestId('item-media')).toHaveAttribute('data-variant', 'image');
    expect(screen.getByTestId('item-media')).toHaveClass('size-10', 'overflow-hidden');
    expect(screen.getByRole('img', { name: 'Cover' })).toBeInTheDocument();
  });

  it('renders content, title, description, actions, header, and footer slots', () => {
    render(
      <Item>
        <ItemHeader className="custom-header" data-testid="item-header">
          Header
        </ItemHeader>
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent className="custom-content" data-testid="item-content">
          <ItemTitle className="custom-title">Library entry</ItemTitle>
          <ItemDescription className="custom-description">
            Continue where you left off.
          </ItemDescription>
        </ItemContent>
        <ItemActions className="custom-actions" data-testid="item-actions">
          <button type="button">Resume</button>
        </ItemActions>
        <ItemFooter className="custom-footer" data-testid="item-footer">
          Footer
        </ItemFooter>
      </Item>,
    );

    expect(screen.getByTestId('item-header')).toHaveAttribute('data-slot', 'item-header');
    expect(screen.getByTestId('item-header')).toHaveClass('basis-full', 'custom-header');

    expect(screen.getByTestId('item-content')).toHaveAttribute('data-slot', 'item-content');
    expect(screen.getByTestId('item-content')).toHaveClass('flex-1', 'custom-content');

    const title = screen.getByText('Library entry');
    expect(title).toHaveAttribute('data-slot', 'item-title');
    expect(title).toHaveClass('font-medium', 'custom-title');

    const description = screen.getByText('Continue where you left off.');
    expect(description.tagName).toBe('P');
    expect(description).toHaveAttribute('data-slot', 'item-description');
    expect(description).toHaveClass('text-muted-foreground', 'custom-description');

    expect(screen.getByTestId('item-actions')).toHaveAttribute('data-slot', 'item-actions');
    expect(screen.getByTestId('item-actions')).toHaveClass('items-center', 'custom-actions');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();

    expect(screen.getByTestId('item-footer')).toHaveAttribute('data-slot', 'item-footer');
    expect(screen.getByTestId('item-footer')).toHaveClass('basis-full', 'custom-footer');
  });
});
