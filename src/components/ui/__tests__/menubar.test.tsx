import { render, screen } from '@testing-library/react';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';

jest.mock('@radix-ui/react-menubar', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  type PrimitiveProps = React.HTMLAttributes<HTMLElement> & {
    align?: string;
    alignOffset?: number;
    checked?: boolean;
    sideOffset?: number;
    value?: string;
  };

  const primitive = (tag: keyof JSX.IntrinsicElements, displayName: string) => {
    const Component = React.forwardRef<HTMLElement, PrimitiveProps>(
      ({ align, alignOffset, checked, sideOffset, value, ...props }, ref) =>
        React.createElement(tag, {
          ref,
          'aria-checked': checked === undefined ? undefined : checked,
          'data-align': align,
          'data-align-offset': alignOffset,
          'data-checked': checked === undefined ? undefined : checked,
          'data-side-offset': sideOffset,
          'data-value': value,
          ...props,
        }),
    );
    Component.displayName = displayName;
    return Component;
  };

  return {
    __esModule: true,
    CheckboxItem: primitive('div', 'MenubarCheckboxItem'),
    Content: primitive('div', 'MenubarContent'),
    Group: primitive('div', 'MenubarGroup'),
    Item: primitive('div', 'MenubarItem'),
    ItemIndicator: primitive('span', 'MenubarItemIndicator'),
    Label: primitive('div', 'MenubarLabel'),
    Menu: primitive('div', 'MenubarMenu'),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    RadioGroup: primitive('div', 'MenubarRadioGroup'),
    RadioItem: primitive('div', 'MenubarRadioItem'),
    Root: primitive('div', 'MenubarRoot'),
    Separator: primitive('div', 'MenubarSeparator'),
    Sub: primitive('div', 'MenubarSub'),
    SubContent: primitive('div', 'MenubarSubContent'),
    SubTrigger: primitive('div', 'MenubarSubTrigger'),
    Trigger: primitive('button', 'MenubarTrigger'),
  };
});

describe('Menubar root wrappers', () => {
  it('renders root, menu, group, portal, radio group, and sub wrappers', () => {
    render(
      <Menubar className="custom-root" data-testid="menubar-root">
        <MenubarMenu data-testid="menubar-menu">
          <MenubarGroup data-testid="menubar-group">Group</MenubarGroup>
          <MenubarPortal>
            <span>Portaled content</span>
          </MenubarPortal>
          <MenubarRadioGroup value="dark" data-testid="menubar-radio-group">
            Radio group
          </MenubarRadioGroup>
          <MenubarSub data-testid="menubar-sub">Submenu</MenubarSub>
        </MenubarMenu>
      </Menubar>,
    );

    const root = screen.getByTestId('menubar-root');
    expect(root).toHaveClass('flex', 'h-9', 'rounded-md', 'custom-root');

    expect(screen.getByTestId('menubar-menu')).toHaveTextContent('Group');
    expect(screen.getByText('Portaled content')).toBeInTheDocument();
    expect(screen.getByTestId('menubar-radio-group')).toHaveAttribute('data-value', 'dark');
    expect(screen.getByTestId('menubar-sub')).toHaveAttribute('data-slot', 'menubar-sub');
  });

  it('renders trigger, content, and sub content defaults with forwarded positioning props', () => {
    render(
      <>
        <MenubarTrigger className="custom-trigger">File</MenubarTrigger>
        <MenubarContent className="custom-content">Content</MenubarContent>
        <MenubarContent align="end" alignOffset={2} sideOffset={4} data-testid="custom-content">
          Custom
        </MenubarContent>
        <MenubarSubContent className="custom-sub-content">Sub content</MenubarSubContent>
      </>,
    );

    expect(screen.getByRole('button', { name: 'File' })).toHaveClass(
      'px-3',
      'font-medium',
      'custom-trigger',
    );

    const content = screen.getByText('Content');
    expect(content).toHaveAttribute('data-align', 'start');
    expect(content).toHaveAttribute('data-align-offset', '-4');
    expect(content).toHaveAttribute('data-side-offset', '8');
    expect(content).toHaveClass('min-w-[12rem]', 'custom-content');

    expect(screen.getByTestId('custom-content')).toHaveAttribute('data-align', 'end');
    expect(screen.getByTestId('custom-content')).toHaveAttribute('data-align-offset', '2');
    expect(screen.getByTestId('custom-content')).toHaveAttribute('data-side-offset', '4');
    expect(screen.getByText('Sub content')).toHaveClass('min-w-[8rem]', 'custom-sub-content');
  });
});

describe('Menubar items', () => {
  it('renders regular items and inset items', () => {
    render(
      <>
        <MenubarItem className="custom-item">Open</MenubarItem>
        <MenubarItem inset>Indented</MenubarItem>
      </>,
    );

    expect(screen.getByText('Open')).toHaveClass('relative', 'px-2', 'custom-item');
    expect(screen.getByText('Indented')).toHaveClass('pl-8');
  });

  it('renders sub triggers with chevron and inset spacing', () => {
    render(
      <MenubarSubTrigger inset className="custom-sub-trigger">
        More
      </MenubarSubTrigger>,
    );

    const trigger = screen.getByText('More');
    expect(trigger).toHaveClass('pl-8', 'custom-sub-trigger');
    expect(trigger.querySelector('svg')).toHaveClass('ml-auto', 'h-4', 'w-4');
  });

  it('renders checkbox and radio items with indicators', () => {
    render(
      <>
        <MenubarCheckboxItem checked className="custom-checkbox">
          Show sidebar
        </MenubarCheckboxItem>
        <MenubarRadioItem value="system" className="custom-radio">
          System
        </MenubarRadioItem>
      </>,
    );

    const checkbox = screen.getByText('Show sidebar');
    expect(checkbox).toHaveAttribute('data-checked', 'true');
    expect(checkbox).toHaveClass('pl-8', 'custom-checkbox');
    expect(checkbox.querySelector('svg')).toHaveClass('h-4', 'w-4');

    const radio = screen.getByText('System');
    expect(radio).toHaveAttribute('data-value', 'system');
    expect(radio).toHaveClass('pl-8', 'custom-radio');
    expect(radio.querySelector('svg')).toHaveClass('fill-current');
  });

  it('renders label, separator, and shortcut helpers', () => {
    render(
      <>
        <MenubarLabel className="custom-label">Actions</MenubarLabel>
        <MenubarLabel inset>Inset label</MenubarLabel>
        <MenubarSeparator className="custom-separator" data-testid="separator" />
        <MenubarShortcut className="custom-shortcut">⌘K</MenubarShortcut>
      </>,
    );

    expect(screen.getByText('Actions')).toHaveClass('font-semibold', 'custom-label');
    expect(screen.getByText('Inset label')).toHaveClass('pl-8');
    expect(screen.getByTestId('separator')).toHaveClass('-mx-1', 'bg-muted', 'custom-separator');
    expect(screen.getByText('⌘K')).toHaveClass('ml-auto', 'tracking-widest', 'custom-shortcut');
  });
});
