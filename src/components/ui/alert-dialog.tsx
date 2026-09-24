'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button';

/** See the note on the identical store in dialog.tsx. */
const subscribeToNothing = () => () => {};
const getMountedSnapshot = () => true;
const getUnmountedSnapshot = () => false;

interface AlertDialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

function useAlertDialogContext() {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error('AlertDialog components must be used within an AlertDialog');
  }
  return context;
}

/* Root AlertDialog Provider */
interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const currentOpen = isControlled ? open : internalOpen;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  return (
    <AlertDialogContext.Provider value={{ open: currentOpen, onOpenChange: handleOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

interface AlertDialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function AlertDialogTrigger({
  children,
  onClick,
  asChild,
  ...props
}: AlertDialogTriggerProps) {
  const { onOpenChange } = useAlertDialogContext();

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

interface AlertDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
}

export const AlertDialogContent = React.forwardRef<HTMLDivElement, AlertDialogContentProps>(
  ({ className, children, onClose, ...props }, forwardedRef) => {
    const { open, onOpenChange } = useAlertDialogContext();
    const dialogRef = React.useRef<HTMLDialogElement>(null);
    const isMounted = React.useSyncExternalStore(
      subscribeToNothing,
      getMountedSnapshot,
      getUnmountedSnapshot,
    );
    const contentRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(forwardedRef, () => contentRef.current as HTMLDivElement);

    React.useEffect(() => {
      const dialog = dialogRef.current;
      /* c8 ignore next 3 */
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
      // The portal - and so `dialogRef.current` - is absent on the render
      // that hydrates, so this has to re-run once it appears.
    }, [open, isMounted]);

    React.useEffect(() => {
      const dialog = dialogRef.current;
      /* c8 ignore next 3 */
      if (!dialog) {
        return;
      }

      const handleClose = () => {
        onOpenChange(false);
        onClose?.();
      };

      const handleCancel = (e: Event) => {
        e.preventDefault();
      };

      dialog.addEventListener('close', handleClose);
      dialog.addEventListener('cancel', handleCancel);

      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('cancel', handleCancel);
      };
    }, [onOpenChange, onClose, isMounted]);

    const [triggerElement, setTriggerElement] = React.useState<HTMLElement | null>(null);

    React.useEffect(() => {
      if (open) {
        setTriggerElement(document.activeElement as HTMLElement);
      } else if (triggerElement) {
        triggerElement.focus();
      }
    }, [open, triggerElement]);

    React.useEffect(() => {
      if (open && dialogRef.current) {
        const cancelButton = dialogRef.current.querySelector<HTMLElement>('[data-alert-cancel]');
        const actionButton = dialogRef.current.querySelector<HTMLElement>('[data-alert-action]');
        const focusTarget = cancelButton || actionButton;
        if (focusTarget) {
          focusTarget.focus();
        }
      }
    }, [open, isMounted]);

    // Server and first client render agree on "nothing here"; branching on
    // `typeof window` made them disagree and broke hydration.
    if (!isMounted) {
      return null;
    }

    return createPortal(
      <dialog
        ref={dialogRef}
        className={cn(
          'm-0 max-h-none max-w-none border-0 p-0',
          'fixed inset-0 h-full w-full',
          'bg-transparent',
          'backdrop:bg-black/80 backdrop:duration-200 backdrop:animate-in backdrop:fade-in-0',
          'open:flex open:items-center open:justify-center',
          'z-50',
        )}
        aria-modal="true"
        role="alertdialog"
      >
        <div
          ref={contentRef}
          className={cn(
            'border border-border bg-popover text-popover-foreground',
            'rounded-lg sm:rounded-[var(--radius-xl)]',
            'max-h-[90vh] w-full max-w-lg',
            'p-6',
            'shadow-lg',
            'duration-200 animate-in fade-in-0 zoom-in-95',
            'relative flex flex-col gap-4',
            className,
          )}
          onClick={e => e.stopPropagation()}
          {...props}
        >
          {children}
        </div>
      </dialog>,
      document.body,
    );
  },
);
AlertDialogContent.displayName = 'AlertDialogContent';

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
  );
}
AlertDialogHeader.displayName = 'AlertDialogHeader';

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        'gap-2 sm:gap-0',
        className,
      )}
      {...props}
    />
  );
}
AlertDialogFooter.displayName = 'AlertDialogFooter';

export const AlertDialogTitle = React.forwardRef<
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
AlertDialogTitle.displayName = 'AlertDialogTitle';

export const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-[hsl(var(--text-secondary))]', className)} {...props} />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface AlertDialogActionProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    Pick<ButtonVariantProps, 'variant' | 'size'> {}

export const AlertDialogAction = React.forwardRef<HTMLButtonElement, AlertDialogActionProps>(
  ({ className, variant, size, onClick, ...props }, ref) => {
    const { onOpenChange } = useAlertDialogContext();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      onOpenChange(false);
    };

    return (
      <button
        ref={ref}
        data-alert-action
        onClick={handleClick}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
AlertDialogAction.displayName = 'AlertDialogAction';

interface AlertDialogCancelProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    Pick<ButtonVariantProps, 'variant' | 'size'> {}

export const AlertDialogCancel = React.forwardRef<HTMLButtonElement, AlertDialogCancelProps>(
  ({ className, variant = 'outline', size, onClick, ...props }, ref) => {
    const { onOpenChange } = useAlertDialogContext();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      onOpenChange(false);
    };

    return (
      <button
        ref={ref}
        data-alert-cancel
        onClick={handleClick}
        className={cn(buttonVariants({ variant, size }), 'mt-2 sm:mt-0', className)}
        {...props}
      />
    );
  },
);
AlertDialogCancel.displayName = 'AlertDialogCancel';

export const AlertDialogPortal = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};
AlertDialogPortal.displayName = 'AlertDialogPortal';

export const AlertDialogOverlay = AlertDialogContent;
