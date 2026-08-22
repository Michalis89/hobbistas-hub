import { fireEvent, render, screen } from '@testing-library/react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

describe('Sheet context controls', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = jest.fn(function showModal(this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = jest.fn(function close(this: HTMLDialogElement) {
      this.open = false;
    });
  });

  beforeEach(() => {
    document.body.style.overflow = '';
    jest.clearAllMocks();
  });

  it('throws when context-bound components are rendered outside a Sheet', () => {
    expect(() => render(<SheetTrigger>Open</SheetTrigger>)).toThrow(
      'Sheet components must be used within a Sheet',
    );
    expect(() => render(<SheetClose>Close</SheetClose>)).toThrow(
      'Sheet components must be used within a Sheet',
    );
    expect(() => render(<SheetContent>Content</SheetContent>)).toThrow(
      'Sheet components must be used within a Sheet',
    );
  });

  it('opens from a regular trigger and closes from a regular close button', () => {
    const handleOpenChange = jest.fn();
    const handleTriggerClick = jest.fn();
    const handleCloseClick = jest.fn();

    render(
      <Sheet open={false} onOpenChange={handleOpenChange}>
        <SheetTrigger onClick={handleTriggerClick}>Open sheet</SheetTrigger>
        <SheetClose onClick={handleCloseClick}>Close sheet</SheetClose>
      </Sheet>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }));
    expect(handleTriggerClick).toHaveBeenCalled();
    expect(handleOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(handleCloseClick).toHaveBeenCalled();
    expect(handleOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('supports asChild trigger and close controls', () => {
    const handleOpenChange = jest.fn();

    render(
      <Sheet onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <button type="button">Child trigger</button>
        </SheetTrigger>
        <SheetClose asChild>
          <button type="button">Child close</button>
        </SheetClose>
      </Sheet>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Child trigger' }));
    expect(handleOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Child close' }));
    expect(handleOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('uses a noop open change handler when none is provided', () => {
    render(
      <Sheet>
        <SheetTrigger>Open without handler</SheetTrigger>
      </Sheet>,
    );

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Open without handler' })),
    ).not.toThrow();
  });

  it('renders open content in a portal and wires close interactions', () => {
    const handleOpenChange = jest.fn();
    const handleClose = jest.fn();

    render(
      <Sheet open onOpenChange={handleOpenChange}>
        <SheetContent className="custom-content" onClose={handleClose}>
          Sheet body
        </SheetContent>
      </Sheet>,
    );

    const dialog = document.body.querySelector('dialog');
    const content = screen.getByText('Sheet body');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden');
    expect(content).toHaveClass('right-0', 'translate-x-0', 'custom-content');
    expect(screen.getByRole('button', { name: 'Close sheet' })).toBeInTheDocument();

    fireEvent.click(content);
    expect(handleOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click, close event, and cancel event', () => {
    const handleOpenChange = jest.fn();
    const handleClose = jest.fn();

    render(
      <Sheet open onOpenChange={handleOpenChange}>
        <SheetContent onClose={handleClose}>Dismissable</SheetContent>
      </Sheet>,
    );

    const dialog = document.body.querySelector('dialog') as HTMLDialogElement;
    fireEvent.click(dialog);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent(dialog, new Event('close'));
    expect(handleOpenChange).toHaveBeenLastCalledWith(false);

    const cancelEvent = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(handleClose).toHaveBeenCalledTimes(3);
  });

  it('updates dialog open state and restores body overflow when closed', () => {
    const { rerender, unmount } = render(
      <Sheet open>
        <SheetContent>Open panel</SheetContent>
      </Sheet>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Sheet open={false}>
        <SheetContent>Open panel</SheetContent>
      </Sheet>,
    );

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('returns focus to the previously active element after closing', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const focusSpy = jest.spyOn(trigger, 'focus');

    const { rerender } = render(
      <Sheet open>
        <SheetContent>Focusable panel</SheetContent>
      </Sheet>,
    );

    rerender(
      <Sheet open={false}>
        <SheetContent>Focusable panel</SheetContent>
      </Sheet>,
    );

    expect(focusSpy).toHaveBeenCalled();
    trigger.remove();
  });

  it('renders sides, optional close button, and overlay alias', () => {
    const { rerender } = render(
      <Sheet open>
        <SheetContent side="left" showCloseButton={false}>
          Left panel
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByText('Left panel')).toHaveClass('left-0', 'translate-x-0');
    expect(screen.queryByRole('button', { name: 'Close sheet' })).not.toBeInTheDocument();

    rerender(
      <Sheet open={false}>
        <SheetContent side="top">Top panel</SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Top panel')).toHaveClass('top-0', '-translate-y-full');

    rerender(
      <Sheet open={false}>
        <SheetContent side="bottom">Bottom panel</SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Bottom panel')).toHaveClass('bottom-0', 'translate-y-full');

    rerender(
      <Sheet open>
        <SheetOverlay side="right">Overlay panel</SheetOverlay>
      </Sheet>,
    );
    expect(screen.getByText('Overlay panel')).toHaveClass('right-0', 'translate-x-0');
  });
});

describe('Sheet layout helpers', () => {
  it('renders header, footer, title, description, and portal helpers', () => {
    render(
      <SheetPortal>
        <SheetHeader className="custom-header" data-testid="sheet-header">
          <SheetTitle className="custom-title">Settings</SheetTitle>
          <SheetDescription className="custom-description">Manage preferences.</SheetDescription>
        </SheetHeader>
        <SheetFooter className="custom-footer" data-testid="sheet-footer">
          Actions
        </SheetFooter>
      </SheetPortal>,
    );

    expect(screen.getByTestId('sheet-header')).toHaveClass('space-y-2', 'pr-8', 'custom-header');
    expect(screen.getByRole('heading', { name: 'Settings' })).toHaveClass(
      'text-lg',
      'custom-title',
    );
    expect(screen.getByText('Manage preferences.')).toHaveClass(
      'text-muted-foreground',
      'custom-description',
    );
    expect(screen.getByTestId('sheet-footer')).toHaveClass('flex-col-reverse', 'custom-footer');
  });
});
