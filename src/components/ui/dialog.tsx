'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A store whose value never changes - only its server and client snapshots
 * differ. `useSyncExternalStore` returns the server snapshot during
 * hydration and the client one on the render straight after, which is
 * exactly the "has this mounted yet" signal a portal needs, without the
 * setState-inside-an-effect that the lint rules reject.
 */
const subscribeToNothing = () => () => {};
const getMountedSnapshot = () => true;
const getUnmountedSnapshot = () => false;

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within a Dialog');
  }
  return context;
}

/* Root Dialog Provider */
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open = false, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange: onOpenChange || (() => {}) }}>
      {children}
    </DialogContext.Provider>
  );
}

/* Dialog Trigger */
interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function DialogTrigger({ children, onClick, asChild, ...props }: DialogTriggerProps) {
  const { onOpenChange } = useDialogContext();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    onOpenChange(true);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: handleClick,
    } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <button onClick={handleClick} {...props}>
      {children}
    </button>
  );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  showCloseButton?: boolean;
  disableAnimation?: boolean;
  withBlurBackdrop?: boolean;
  portalContainerRef?: React.Ref<HTMLDivElement>;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  (
    {
      className,
      children,
      onClose,
      showCloseButton = true,
      disableAnimation = true,
      withBlurBackdrop = false,
      portalContainerRef,
      ...props
    },
    forwardedRef,
  ) => {
    const { open, onOpenChange } = useDialogContext();
    const dialogRef = React.useRef<HTMLDialogElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const isMounted = React.useSyncExternalStore(
      subscribeToNothing,
      getMountedSnapshot,
      getUnmountedSnapshot,
    );

    // Merge refs
    React.useImperativeHandle(forwardedRef, () => contentRef.current as HTMLDivElement);

    // Handle dialog open/close
    React.useEffect(() => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      if (open) {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        if (dialog.open) {
          dialog.close();
        }
      }
      // `isMounted` is a dependency because the portal - and therefore
      // `dialogRef.current` - does not exist on the first render. Without it
      // a dialog mounted already open would never get its `showModal()`.
    }, [open, isMounted]);

    // Handle ESC key and close events
    React.useEffect(() => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const handleClose = () => {
        onOpenChange(false);
        onClose?.();
      };

      const handleCancel = (e: Event) => {
        // Prevent default ESC behavior, handle it ourselves
        e.preventDefault();
        handleClose();
      };

      dialog.addEventListener('close', handleClose);
      dialog.addEventListener('cancel', handleCancel);

      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('cancel', handleCancel);
      };
    }, [onOpenChange, onClose, isMounted]);

    // Click outside to close
    const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
      const dialog = dialogRef.current;
      if (e.target === dialog) {
        onOpenChange(false);
        onClose?.();
      }
    };

    // Focus trap - Return focus to trigger on close
    const [triggerElement, setTriggerElement] = React.useState<HTMLElement | null>(null);

    React.useEffect(() => {
      if (open) {
        setTriggerElement(document.activeElement as HTMLElement);
      } else if (triggerElement) {
        triggerElement.focus();
      }
    }, [open, triggerElement]);

    // Focus first focusable element when opened
    React.useEffect(() => {
      if (open && dialogRef.current) {
        const focusable = dialogRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable && focusable !== dialogRef.current.querySelector('[data-dialog-close]')) {
          focusable.focus();
        }
      }
    }, [open, isMounted]);

    // Server and first client render agree on "nothing here"; the portal
    // arrives on the render after hydration. Branching on `typeof window`
    // instead made the server render null while the client rendered a
    // <dialog>, which is the textbook hydration mismatch React warns about.
    if (!isMounted) {
      return null;
    }

    return createPortal(
      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        className={cn(
          /* Reset default dialog styles */
          'm-0 max-h-none max-w-none border-0 p-0',
          /* Full viewport positioning */
          'fixed inset-0 h-full w-full',
          /* Transparent dialog to show custom backdrop */
          'bg-transparent',
          /* Solid backdrop */
          'backdrop:bg-black/80 backdrop:duration-200 backdrop:animate-in backdrop:fade-in-0',
          withBlurBackdrop && 'backdrop:backdrop-blur-sm backdrop:backdrop-brightness-90',
          /* Dialog is open */
          'open:flex open:items-center open:justify-center',
          /* Ensure proper stacking */
          'z-50',
        )}
        aria-modal="true"
      >
        <div
          ref={contentRef}
          className={cn(
            /* Surface styling - solid, no blur */
            'bg-[hsl(var(--surface-overlay))]',
            'border border-[hsl(var(--border-default))]',
            'rounded-lg sm:rounded-[20px]',
            /* Sizing */
            'w-full max-w-lg',
            'max-h-[90vh]',
            /* Spacing */
            'p-6',
            /* Shadow - Ultra-subtle, <4px blur */
            'shadow-[var(--shadow-lg)]',
            /* Animation - Compositor-only (transform + opacity) */
            disableAnimation
              ? 'animate-none duration-0'
              : 'duration-200 animate-in fade-in-0 zoom-in-95',
            /* Layout */
            'relative',
            '',
            /* Ensure content doesn't overflow */
            'flex flex-col',
            className,
          )}
          onClick={e => e.stopPropagation()}
          {...props}
        >
          {children}

          {showCloseButton && (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onClose?.();
              }}
              data-dialog-close
              className={cn(
                'absolute right-4 top-4',
                'rounded-sm',
                'opacity-70 hover:opacity-100',
                'transition-opacity duration-150',
                'ring-offset-background',
                'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent-primary))] focus:ring-offset-2',
                'disabled:pointer-events-none',
                /* Touch target - minimum 44px for iOS */
                'h-[var(--touch-min)] w-[var(--touch-min)]',
                'flex items-center justify-center',
              )}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          )}
        </div>
        {portalContainerRef && (
          <div
            ref={portalContainerRef}
            className="pointer-events-none absolute inset-0 z-[60]"
            aria-hidden="true"
          />
        )}
      </dialog>,
      document.body,
    );
  },
);
DialogContent.displayName = 'DialogContent';

/* Dialog Header */
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left',
        /* Ensure proper spacing from close button */
        'pr-8',
        className,
      )}
      {...props}
    />
  );
}
DialogHeader.displayName = 'DialogHeader';

/* Dialog Footer */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        /* Touch-friendly spacing on mobile */
        'gap-2 sm:gap-0',
        className,
      )}
      {...props}
    />
  );
}
DialogFooter.displayName = 'DialogFooter';

/* Dialog Title */
export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      'text-[hsl(var(--text-primary))]',
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

/* Dialog Description */
export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-[hsl(var(--text-secondary))]', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

/* Dialog Close - For custom close buttons */
export function DialogClose({
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onOpenChange } = useDialogContext();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    onOpenChange(false);
  };

  if (React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: handleClick,
    } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <button onClick={handleClick} {...props}>
      {children}
    </button>
  );
}
DialogClose.displayName = 'DialogClose';

/* Legacy Portal export for compatibility */
export const DialogPortal = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};
DialogPortal.displayName = 'DialogPortal';

/* Named exports for compatibility with existing code */
export const DialogOverlay = DialogContent;
