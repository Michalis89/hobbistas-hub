'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* =============================================================================
   LIGHTWEIGHT SHEET COMPONENT
   Native <dialog> element - Zero Radix overhead (~90% smaller)
   Performance: Compositor-only animations (transform only), solid backdrop
   ============================================================================= */

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: 'top' | 'right' | 'bottom' | 'left';
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error('Sheet components must be used within a Sheet');
  }
  return context;
}

/* Root Sheet Provider */
interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open = false, onOpenChange, children }: SheetProps) {
  return (
    <SheetContext.Provider
      value={{ open, onOpenChange: onOpenChange || (() => {}), side: 'right' }}
    >
      {children}
    </SheetContext.Provider>
  );
}

/* Sheet Trigger */
interface SheetTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function SheetTrigger({ children, onClick, asChild, ...props }: SheetTriggerProps) {
  const { onOpenChange } = useSheetContext();

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

/* Sheet Content - Native <dialog> with slide animations */
interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left';
  onClose?: () => void;
  showCloseButton?: boolean;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  (
    { side = 'right', className, children, onClose, showCloseButton = true, ...props },
    forwardedRef,
  ) => {
    const { open, onOpenChange } = useSheetContext();
    const dialogRef = React.useRef<HTMLDialogElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);

    // Merge refs
    React.useImperativeHandle(forwardedRef, () => contentRef.current as HTMLDivElement);

    // Handle dialog open/close
    React.useEffect(() => {
      const dialog = dialogRef.current as HTMLDialogElement;

      if (open) {
        if (!dialog.open) {
          dialog.showModal();
          // Prevent body scroll on mobile
          document.body.style.overflow = 'hidden';
        }
      } else {
        if (dialog.open) {
          dialog.close();
          document.body.style.overflow = '';
        }
      }

      return () => {
        document.body.style.overflow = '';
      };
    }, [open]);

    // Handle ESC key and close events
    React.useEffect(() => {
      const dialog = dialogRef.current as HTMLDialogElement;

      const handleClose = () => {
        onOpenChange(false);
        onClose?.();
      };

      const handleCancel = (e: Event) => {
        e.preventDefault();
        handleClose();
      };

      dialog.addEventListener('close', handleClose);
      dialog.addEventListener('cancel', handleCancel);

      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('cancel', handleCancel);
      };
    }, [onOpenChange, onClose]);

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

    if (typeof window === 'undefined') {
      /* istanbul ignore next -- SSR guard; jsdom cannot safely unset window. */
      return null;
    }

    // Slide direction styles
    const slideStyles = {
      top: 'inset-x-0 top-0 border-b',
      bottom: 'inset-x-0 bottom-0 border-t',
      left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
      right: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
    };

    const slideAnimations = {
      top: open ? 'translate-y-0' : '-translate-y-full',
      bottom: open ? 'translate-y-0' : 'translate-y-full',
      left: open ? 'translate-x-0' : '-translate-x-full',
      right: open ? 'translate-x-0' : 'translate-x-full',
    };

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
          /* Solid backdrop - NO BLUR (performance) */
          'backdrop:bg-black/80 backdrop:duration-200 backdrop:animate-in backdrop:fade-in-0',
          /* Ensure proper stacking */
          'z-50',
        )}
        aria-modal="true"
      >
        <div
          ref={contentRef}
          className={cn(
            /* Surface styling - solid, no blur */
            'hb-dialog-surface',
            'bg-card',
            'border-border',
            /* Positioning based on side */
            'fixed',
            slideStyles[side],
            /* Spacing */
            'p-6',
            /* Shadow - Ultra-subtle */
            'shadow-lg',
            /* Animation - Transform only (compositor) */
            'transition-transform duration-300 ease-in-out',
            slideAnimations[side],
            /* Layout */
            'overflow-y-auto',
            '[scrollbar-width:thin]',
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
              className={cn(
                'absolute right-4 top-2',
                'rounded-sm',
                'opacity-70 hover:opacity-100',
                'transition-opacity duration-150',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:pointer-events-none',
                /* Touch target - minimum 44px for iOS */
                'h-[var(--touch-min)] w-[var(--touch-min)]',
                'flex items-center justify-center',
              )}
              aria-label="Close sheet"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          )}
        </div>
      </dialog>,
      document.body,
    );
  },
);
SheetContent.displayName = 'SheetContent';

/* Sheet Header */
export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-2 text-left',
        /* Ensure proper spacing from close button */
        'pr-8',
        className,
      )}
      {...props}
    />
  );
}
SheetHeader.displayName = 'SheetHeader';

/* Sheet Footer */
export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
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
SheetFooter.displayName = 'SheetFooter';

/* Sheet Title */
export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      'text-foreground',
      className,
    )}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

/* Sheet Description */
export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = 'SheetDescription';

/* Sheet Close - For custom close buttons */
interface SheetCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function SheetClose({ children, onClick, asChild, ...props }: SheetCloseProps) {
  const { onOpenChange } = useSheetContext();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    onOpenChange(false);
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
SheetClose.displayName = 'SheetClose';

/* Legacy Portal export for compatibility */
export const SheetPortal = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};
SheetPortal.displayName = 'SheetPortal';

/* Legacy Overlay export for compatibility */
export const SheetOverlay = SheetContent;
