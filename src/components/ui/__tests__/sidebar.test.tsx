import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

const mockUseIsMobile = jest.fn(() => false);

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  TooltipContent: ({
    children,
    hidden,
    ...props
  }: {
    children?: React.ReactNode;
    hidden?: boolean;
  }) => (
    <div data-hidden={hidden ? 'true' : 'false'} data-testid="tooltip-content" {...props}>
      {children}
    </div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-provider">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
    open,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) => (
    <div
      data-open={open ? 'true' : 'false'}
      data-testid="sheet"
      onClick={() => onOpenChange?.(!open)}
    >
      {children}
    </div>
  ),
  SheetContent: ({
    children,
    className,
    side,
    style,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    side?: string;
    style?: React.CSSProperties;
  }) => (
    <div
      className={className}
      data-side={side}
      data-testid="sheet-content"
      style={style}
      {...props}
    >
      {children}
    </div>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

function renderWithProvider(
  children: React.ReactNode,
  props?: React.ComponentProps<typeof SidebarProvider>,
) {
  return render(<SidebarProvider {...props}>{children}</SidebarProvider>);
}

function ContextProbe() {
  const sidebar = useSidebar();

  return (
    <button
      data-mobile={sidebar.isMobile ? 'true' : 'false'}
      data-open={sidebar.open ? 'true' : 'false'}
      data-open-mobile={sidebar.openMobile ? 'true' : 'false'}
      data-state={sidebar.state}
      onClick={() => sidebar.setOpen(false)}
      type="button"
    >
      probe
    </button>
  );
}

describe('SidebarProvider and context controls', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
    document.cookie = 'sidebar_state=; path=/; max-age=0';
  });

  it('throws when useSidebar is used outside provider', () => {
    expect(() => render(<ContextProbe />)).toThrow(
      'useSidebar must be used within a SidebarProvider.',
    );
  });

  it('provides state, writes cookies, and toggles from trigger, rail, and keyboard', () => {
    const triggerClick = jest.fn();

    renderWithProvider(
      <>
        <ContextProbe />
        <SidebarTrigger className="custom-trigger" onClick={triggerClick} />
        <SidebarRail className="custom-rail" data-testid="rail" />
      </>,
      { defaultOpen: true, className: 'custom-provider', style: { color: 'red' } },
    );

    const wrapper = screen.getByTestId('tooltip-provider').firstElementChild;
    expect(wrapper).toHaveClass('group/sidebar-wrapper', 'custom-provider');
    expect(wrapper).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(screen.getByRole('button', { name: 'probe' })).toHaveAttribute('data-state', 'expanded');

    fireEvent.click(document.querySelector('[data-sidebar="trigger"]') as HTMLElement);
    expect(triggerClick).toHaveBeenCalled();
    expect(document.cookie).toContain('sidebar_state=false');
    expect(screen.getByRole('button', { name: 'probe' })).toHaveAttribute(
      'data-state',
      'collapsed',
    );

    fireEvent.click(screen.getByTestId('rail'));
    expect(document.cookie).toContain('sidebar_state=true');

    fireEvent.keyDown(window, { ctrlKey: true, key: 'b' });
    expect(document.cookie).toContain('sidebar_state=false');
    expect(screen.getByTestId('rail')).toHaveClass('custom-rail');
  });

  it('supports controlled open state and direct context setter', () => {
    const handleOpenChange = jest.fn();

    renderWithProvider(<ContextProbe />, { onOpenChange: handleOpenChange, open: true });

    fireEvent.click(screen.getByRole('button', { name: 'probe' }));
    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(document.cookie).toContain('sidebar_state=false');
  });

  it('toggles mobile state instead of desktop state', () => {
    mockUseIsMobile.mockReturnValue(true);

    renderWithProvider(
      <>
        <ContextProbe />
        <SidebarTrigger />
      </>,
      { defaultOpen: true },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(screen.getByRole('button', { name: 'probe' })).toHaveAttribute(
      'data-open-mobile',
      'true',
    );
    expect(screen.getByRole('button', { name: 'probe' })).toHaveAttribute('data-open', 'true');
  });
});

describe('Sidebar shell variants', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
  });

  it('renders non-collapsible, desktop, and mobile sidebars', () => {
    renderWithProvider(
      <Sidebar collapsible="none" className="custom-sidebar" data-testid="plain-sidebar">
        Plain
      </Sidebar>,
    );

    expect(screen.getByTestId('plain-sidebar')).toHaveClass(
      'w-[--sidebar-width]',
      'custom-sidebar',
    );

    cleanup();

    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar side="right" variant="floating" collapsible="icon" className="desktop-sidebar">
          Desktop
        </Sidebar>
      </SidebarProvider>,
    );

    const desktop = screen.getByText('Desktop').closest('[data-side="right"]');
    expect(desktop).toHaveAttribute('data-state', 'collapsed');
    expect(desktop).toHaveAttribute('data-collapsible', 'icon');
    expect(desktop).toHaveAttribute('data-variant', 'floating');
    expect(screen.getByText('Desktop').closest('[data-sidebar="sidebar"]')).toBeInTheDocument();

    cleanup();

    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar className="default-desktop">Default desktop</Sidebar>
      </SidebarProvider>,
    );

    const defaultDesktop = screen.getByText('Default desktop').closest('[data-side="left"]');
    expect(defaultDesktop).toHaveAttribute('data-collapsible', 'offcanvas');
    expect(defaultDesktop).toHaveAttribute('data-variant', 'sidebar');
    expect(screen.getByText('Default desktop').closest('.default-desktop')).toHaveClass(
      'group-data-[side=left]:border-r',
    );

    cleanup();

    render(
      <SidebarProvider defaultOpen>
        <Sidebar>Expanded desktop</Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByText('Expanded desktop').closest('[data-side="left"]')).toHaveAttribute(
      'data-collapsible',
      '',
    );

    cleanup();

    mockUseIsMobile.mockReturnValue(true);
    render(
      <SidebarProvider>
        <Sidebar side="left">Mobile</Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('sheet-content')).toHaveAttribute('data-mobile', 'true');
    expect(screen.getByTestId('sheet-content')).toHaveAttribute('data-side', 'left');
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
  });
});

describe('Sidebar layout primitives', () => {
  it('renders structural slots and input/separator helpers', () => {
    render(
      <>
        <SidebarInset className="custom-inset" data-testid="inset" />
        <SidebarInput className="custom-input" placeholder="Search" />
        <SidebarHeader className="custom-header" data-testid="header" />
        <SidebarFooter className="custom-footer" data-testid="footer" />
        <SidebarSeparator className="custom-separator" data-testid="separator" />
        <SidebarContent className="custom-content" data-testid="content" />
      </>,
    );

    expect(screen.getByTestId('inset')).toHaveClass('flex-1', 'custom-inset');
    expect(screen.getByPlaceholderText('Search')).toHaveAttribute('data-sidebar', 'input');
    expect(screen.getByPlaceholderText('Search')).toHaveClass('custom-input');
    expect(screen.getByTestId('header')).toHaveAttribute('data-sidebar', 'header');
    expect(screen.getByTestId('footer')).toHaveAttribute('data-sidebar', 'footer');
    expect(screen.getByTestId('separator')).toHaveAttribute('data-sidebar', 'separator');
    expect(screen.getByTestId('content')).toHaveAttribute('data-sidebar', 'content');
  });

  it('renders group slots with asChild variants', () => {
    render(
      <>
        <SidebarGroup className="custom-group" data-testid="group" />
        <SidebarGroupLabel className="default-label">Default label</SidebarGroupLabel>
        <SidebarGroupLabel asChild className="custom-label">
          <a href="/group">Group label</a>
        </SidebarGroupLabel>
        <SidebarGroupAction className="default-action">Default action</SidebarGroupAction>
        <SidebarGroupAction asChild className="custom-action">
          <a href="/action">Action</a>
        </SidebarGroupAction>
        <SidebarGroupContent className="custom-content">Group content</SidebarGroupContent>
      </>,
    );

    expect(screen.getByTestId('group')).toHaveAttribute('data-sidebar', 'group');
    expect(screen.getByRole('link', { name: 'Group label' })).toHaveAttribute(
      'data-sidebar',
      'group-label',
    );
    expect(screen.getByRole('link', { name: 'Group label' })).toHaveClass('custom-label');
    expect(screen.getByText('Default label')).toHaveAttribute('data-sidebar', 'group-label');
    expect(screen.getByRole('button', { name: 'Default action' })).toHaveAttribute(
      'data-sidebar',
      'group-action',
    );
    expect(screen.getByRole('link', { name: 'Action' })).toHaveAttribute(
      'data-sidebar',
      'group-action',
    );
    expect(screen.getByText('Group content')).toHaveAttribute('data-sidebar', 'group-content');
  });
});

describe('Sidebar menu primitives', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders menu item, button variants, actions, badges, and skeleton', () => {
    renderWithProvider(
      <SidebarMenu className="custom-menu" data-testid="menu">
        <SidebarMenuItem className="custom-item">
          <SidebarMenuButton isActive size="lg" variant="outline" className="custom-button">
            Menu button
          </SidebarMenuButton>
          <SidebarMenuAction showOnHover className="custom-action">
            Action
          </SidebarMenuAction>
          <SidebarMenuAction asChild>
            <a href="/menu-action">Action link</a>
          </SidebarMenuAction>
          <SidebarMenuBadge className="custom-badge">7</SidebarMenuBadge>
          <SidebarMenuSkeleton showIcon className="custom-skeleton" />
        </SidebarMenuItem>
      </SidebarMenu>,
      { defaultOpen: true },
    );

    expect(screen.getByTestId('menu')).toHaveAttribute('data-sidebar', 'menu');
    expect(screen.getByText('Menu button')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('Menu button')).toHaveAttribute('data-size', 'lg');
    expect(screen.getByText('Menu button')).toHaveClass('custom-button');
    expect(screen.getByText('Action')).toHaveAttribute('data-sidebar', 'menu-action');
    expect(screen.getByText('Action')).toHaveClass('md:opacity-0', 'custom-action');
    expect(screen.getByRole('link', { name: 'Action link' })).toHaveAttribute(
      'data-sidebar',
      'menu-action',
    );
    expect(screen.getByText('7')).toHaveAttribute('data-sidebar', 'menu-badge');
    expect(screen.getByText('7')).toHaveClass('custom-badge');
    expect(screen.getByText('Menu button').closest('li')).toHaveClass('group/menu-item');
    expect(document.querySelector('[data-sidebar="menu-skeleton"]')).toHaveClass('custom-skeleton');
    expect(document.querySelector('[data-sidebar="menu-skeleton-icon"]')).toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="menu-skeleton-text"]')).toHaveStyle({
      '--skeleton-width': '70%',
    });
  });

  it('renders menu buttons with asChild and tooltip configurations', () => {
    const { rerender } = renderWithProvider(
      <SidebarMenuButton asChild tooltip="Collapsed tip">
        <a href="/library">Library</a>
      </SidebarMenuButton>,
      { defaultOpen: false },
    );

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'data-sidebar',
      'menu-button',
    );
    expect(screen.getByTestId('tooltip-content')).toHaveAttribute('data-hidden', 'false');
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent('Collapsed tip');

    mockUseIsMobile.mockReturnValue(true);
    rerender(
      <SidebarProvider defaultOpen={false}>
        <SidebarMenuButton tooltip={{ children: 'Mobile tip', className: 'custom-tooltip' }}>
          Button
        </SidebarMenuButton>
      </SidebarProvider>,
    );

    expect(screen.getByTestId('tooltip-content')).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByTestId('tooltip-content')).toHaveClass('custom-tooltip');
  });

  it('renders menu sub components and asChild sub buttons', () => {
    render(
      <SidebarMenuSub className="custom-sub" data-testid="sub">
        <SidebarMenuSubItem className="custom-sub-item" data-testid="sub-item">
          <SidebarMenuSubButton asChild className="custom-sub-button" isActive size="sm">
            <a href="/nested">Nested</a>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton href="/plain" size="md">
            Plain
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </SidebarMenuSub>,
    );

    expect(screen.getByTestId('sub')).toHaveAttribute('data-sidebar', 'menu-sub');
    expect(screen.getByTestId('sub')).toHaveClass('custom-sub');
    expect(screen.getByTestId('sub-item')).toHaveClass('custom-sub-item');
    expect(screen.getByRole('link', { name: 'Nested' })).toHaveAttribute(
      'data-sidebar',
      'menu-sub-button',
    );
    expect(screen.getByRole('link', { name: 'Nested' })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('link', { name: 'Nested' })).toHaveAttribute('data-size', 'sm');
    expect(screen.getByRole('link', { name: 'Nested' })).toHaveClass('text-xs');
    expect(screen.getByRole('link', { name: 'Plain' })).toHaveClass('text-sm');
  });
});
