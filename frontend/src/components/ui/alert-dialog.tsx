import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AlertDialogContextValue {
  open: boolean;
  titleId: string;
  descriptionId: string;
  onClose: () => void;
  closeLocked: boolean;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeLocked?: boolean;
  children: React.ReactNode;
}

export function AlertDialog({
  open,
  onOpenChange,
  closeLocked = false,
  children,
}: AlertDialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    if (returnFocusRef.current && document.contains(returnFocusRef.current)) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  const handleClose = React.useCallback(() => {
    if (!closeLocked) {
      onOpenChange(false);
    }
  }, [closeLocked, onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !closeLocked) {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeLocked, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <AlertDialogContext.Provider
      value={{ open, titleId, descriptionId, onClose: handleClose, closeLocked }}
    >
      {children}
    </AlertDialogContext.Provider>
  );
}

export function AlertDialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(AlertDialogContext);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const focusables = node.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      node.focus();
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !contentRef.current) return;
    const focusables = Array.from(
      contentRef.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!ctx) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div aria-hidden="true" className="fixed inset-0 bg-slate-950/55" onClick={ctx.onClose} />
      <div
        ref={contentRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={ctx.titleId}
        aria-describedby={ctx.descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative z-10 w-[calc(100%-1.5rem)] max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-md)] focus:outline-none space-y-4',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1.5', className)} {...props} />;
}

export function AlertDialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const ctx = React.useContext(AlertDialogContext);
  return (
    <h3
      id={ctx?.titleId}
      className={cn('text-[0.9375rem] font-semibold leading-[1.45] text-foreground', className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(AlertDialogContext);
  return (
    <div
      id={ctx?.descriptionId}
      className={cn('text-sm leading-relaxed text-muted-foreground space-y-2', className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function AlertDialogCancel({ onClick, ...props }: ButtonProps) {
  const ctx = React.useContext(AlertDialogContext);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={ctx?.closeLocked || props.disabled}
      onClick={(e) => {
        onClick?.(e);
        ctx?.onClose();
      }}
      {...props}
    />
  );
}

export function AlertDialogAction(props: ButtonProps) {
  return <Button type="button" {...props} />;
}
