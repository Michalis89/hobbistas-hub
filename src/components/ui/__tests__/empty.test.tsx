import { render, screen } from '@testing-library/react';
import EmptyState, {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const Icon = () => <svg data-testid="empty-icon-svg" />;

describe('Empty primitives', () => {
  it('renders the root slot with default and custom classes', () => {
    render(
      <Empty className="border" data-testid="empty-root">
        Empty content
      </Empty>,
    );

    const root = screen.getByTestId('empty-root');
    expect(root).toHaveAttribute('data-slot', 'empty');
    expect(root).toHaveClass('flex', 'rounded-lg', 'border', 'text-center');
    expect(root).toHaveTextContent('Empty content');
  });

  it('renders header, title, description, and content slots', () => {
    render(
      <Empty>
        <EmptyHeader className="custom-header" data-testid="empty-header">
          <EmptyTitle className="custom-title">Nothing here</EmptyTitle>
          <EmptyDescription className="custom-description">
            Add something to get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="custom-content" data-testid="empty-content">
          <button type="button">Create</button>
        </EmptyContent>
      </Empty>,
    );

    expect(screen.getByTestId('empty-header')).toHaveAttribute('data-slot', 'empty-header');
    expect(screen.getByTestId('empty-header')).toHaveClass('max-w-sm', 'custom-header');

    const title = screen.getByText('Nothing here');
    expect(title).toHaveAttribute('data-slot', 'empty-title');
    expect(title).toHaveClass('text-lg', 'font-medium', 'custom-title');

    const description = screen.getByText('Add something to get started.');
    expect(description).toHaveAttribute('data-slot', 'empty-description');
    expect(description).toHaveClass('text-muted-foreground', 'custom-description');

    const content = screen.getByTestId('empty-content');
    expect(content).toHaveAttribute('data-slot', 'empty-content');
    expect(content).toHaveClass('max-w-sm', 'custom-content');
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('renders media variants with slot and variant attributes', () => {
    const { rerender } = render(
      <EmptyMedia className="custom-media" data-testid="empty-media">
        <Icon />
      </EmptyMedia>,
    );

    const media = screen.getByTestId('empty-media');
    expect(media).toHaveAttribute('data-slot', 'empty-icon');
    expect(media).toHaveAttribute('data-variant', 'default');
    expect(media).toHaveClass('bg-transparent', 'custom-media');
    expect(screen.getByTestId('empty-icon-svg')).toBeInTheDocument();

    rerender(
      <EmptyMedia variant="icon" className="custom-media" data-testid="empty-media">
        <Icon />
      </EmptyMedia>,
    );

    expect(screen.getByTestId('empty-media')).toHaveAttribute('data-variant', 'icon');
    expect(screen.getByTestId('empty-media')).toHaveClass('bg-muted', 'rounded-lg');
  });
});

describe('EmptyState', () => {
  it('renders the default empty state with icon, description, and action', () => {
    render(
      <EmptyState
        icon={<Icon />}
        title="No items"
        description="Your library is empty."
        action={<button type="button">Add item</button>}
        className="custom-state"
      />,
    );

    const root = screen.getByText('No items').closest('[data-slot="empty"]');
    expect(root).toHaveClass('gap-6', 'custom-state');
    expect(screen.getByTestId('empty-icon-svg').parentElement).toHaveAttribute(
      'data-variant',
      'icon',
    );
    expect(screen.getByText('No items')).toHaveClass('text-lg');
    expect(screen.getByText('Your library is empty.')).toHaveClass('text-muted-foreground');
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
  });

  it('renders compact state without optional icon, description, or action', () => {
    const { container } = render(<EmptyState title="No links yet" size="sm" />);

    const root = screen.getByText('No links yet').closest('[data-slot="empty"]');
    expect(root).toHaveClass('gap-4');
    expect(screen.getByText('No links yet')).toHaveClass('text-base');
    expect(container.querySelector('[data-slot="empty-icon"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty-description"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty-content"]')).not.toBeInTheDocument();
  });

  it('applies compact description and action spacing classes', () => {
    render(
      <EmptyState
        title="No social links"
        description="Add links to your profile."
        action={<button type="button">Add link</button>}
        size="sm"
      />,
    );

    expect(screen.getByText('Add links to your profile.')).toHaveClass('text-sm');
    expect(screen.getByRole('button', { name: 'Add link' }).parentElement).toHaveClass('gap-2');
  });
});
