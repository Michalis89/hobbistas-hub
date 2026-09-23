import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

jest.mock('@radix-ui/react-select', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  type PrimitiveProps = React.HTMLAttributes<HTMLElement> & {
    asChild?: boolean;
    container?: Element;
    position?: string;
    value?: string;
  };

  const primitive = (tag: keyof JSX.IntrinsicElements, displayName: string) => {
    const Component = React.forwardRef<HTMLElement, PrimitiveProps>(
      ({ asChild, container, position, value, ...props }, ref) =>
        React.createElement(tag, {
          ref,
          'data-as-child': asChild,
          'data-container': container ? 'provided' : undefined,
          'data-position': position,
          'data-value': value,
          ...props,
        }),
    );
    Component.displayName = displayName;
    return Component;
  };

  return {
    __esModule: true,
    Content: primitive('div', 'SelectContent'),
    Group: primitive('div', 'SelectGroup'),
    Icon: ({ children }: { children: React.ReactNode }) => (
      <span data-testid="select-icon">{children}</span>
    ),
    Item: primitive('div', 'SelectItem'),
    ItemIndicator: primitive('span', 'SelectItemIndicator'),
    ItemText: primitive('span', 'SelectItemText'),
    Label: primitive('div', 'SelectLabel'),
    Portal: ({ children, container }: { children: React.ReactNode; container?: Element }) => (
      <div data-container={container ? 'provided' : undefined} data-testid="select-portal">
        {children}
      </div>
    ),
    Root: primitive('div', 'SelectRoot'),
    ScrollDownButton: primitive('button', 'SelectScrollDownButton'),
    ScrollUpButton: primitive('button', 'SelectScrollUpButton'),
    Separator: primitive('div', 'SelectSeparator'),
    Trigger: primitive('button', 'SelectTrigger'),
    Value: primitive('span', 'SelectValue'),
    Viewport: primitive('div', 'SelectViewport'),
  };
});

describe('Select root and trigger', () => {
  it('renders the root, group, and value while ignoring modal', () => {
    render(
      <Select modal value="games" data-testid="select-root">
        <SelectGroup data-testid="select-group">
          <SelectValue data-testid="select-value">Games</SelectValue>
        </SelectGroup>
      </Select>,
    );

    const root = screen.getByTestId('select-root');
    expect(root).toHaveAttribute('data-value', 'games');
    expect(root).not.toHaveAttribute('modal');
    expect(screen.getByTestId('select-group')).toHaveTextContent('Games');
    expect(screen.getByTestId('select-value')).toHaveTextContent('Games');
  });

  it('renders trigger content and dropdown icon', () => {
    render(
      <SelectTrigger className="custom-trigger" data-testid="select-trigger">
        Pick one
      </SelectTrigger>,
    );

    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toHaveClass('h-10', 'border-border', 'min-h-[44px]', 'custom-trigger');
    expect(trigger).toHaveTextContent('Pick one');
    expect(screen.getByTestId('select-icon').querySelector('svg')).toHaveClass(
      'text-muted-foreground',
      'opacity-50',
    );
  });
});

describe('SelectContent', () => {
  it('renders default popper content with scroll buttons and viewport sizing', () => {
    render(
      <SelectContent className="custom-content" data-testid="select-content">
        <SelectItem value="books">Books</SelectItem>
      </SelectContent>,
    );

    const content = screen.getByTestId('select-content');
    expect(content).toHaveAttribute('data-position', 'popper');
    expect(content).toHaveClass('max-h-96', 'pointer-events-auto', 'custom-content');

    const viewport = content.querySelector('div[class*="min-w-[var"]');
    expect(viewport).toHaveClass('p-1', 'w-full');
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(content.querySelectorAll('button')).toHaveLength(2);
  });

  it('renders non-popper content with a provided portal container', () => {
    const portalContainer = document.createElement('div');

    render(
      <SelectContent
        portalContainer={portalContainer}
        position="item-aligned"
        data-testid="select-content"
      >
        Aligned
      </SelectContent>,
    );

    expect(screen.getByTestId('select-portal')).toHaveAttribute('data-container', 'provided');
    expect(screen.getByTestId('select-content')).toHaveAttribute('data-position', 'item-aligned');
    expect(screen.getByTestId('select-content').querySelector('div')).toHaveClass('p-1');
    expect(screen.getByTestId('select-content').querySelector('div')).not.toHaveClass('w-full');
  });
});

describe('Select items and helpers', () => {
  it('renders labels, items, indicators, text, and separators', () => {
    render(
      <>
        <SelectLabel className="custom-label">Library</SelectLabel>
        <SelectItem value="anime" className="custom-item">
          Anime
        </SelectItem>
        <SelectSeparator className="custom-separator" data-testid="select-separator" />
      </>,
    );

    expect(screen.getByText('Library')).toHaveClass('font-semibold', 'custom-label');

    const item = screen.getByText('Anime').closest('[data-value="anime"]');
    expect(item).toHaveClass('pl-8', 'min-h-[44px]', 'custom-item');
    expect(item?.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(screen.getByText('Anime').tagName).toBe('SPAN');

    expect(screen.getByTestId('select-separator')).toHaveClass('-mx-1', 'bg-border');
  });

  it('renders standalone scroll buttons with icons and custom classes', () => {
    render(
      <>
        <SelectScrollUpButton className="custom-up">Up</SelectScrollUpButton>
        <SelectScrollDownButton className="custom-down">Down</SelectScrollDownButton>
      </>,
    );

    const [up, down] = screen.getAllByRole('button');
    expect(up).toHaveClass('justify-center', 'custom-up');
    expect(up.querySelector('svg')).toHaveClass('h-4', 'w-4');

    expect(down).toHaveClass('justify-center', 'custom-down');
    expect(down.querySelector('svg')).toHaveClass('h-4', 'w-4');
  });
});
