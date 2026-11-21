import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva('rounded-lg border border-l-4 p-4 text-sm leading-relaxed', {
  variants: {
    variant: {
      stop: 'bg-status-stop-bg border-status-stop-border border-l-destructive text-status-stop-fg',
      stale:
        'bg-status-stale-bg border-status-stale-border border-l-status-stale-fg text-status-stale-fg',
      legacy:
        'bg-status-legacy-bg border-status-legacy-border border-l-status-legacy-fg text-status-legacy-fg',
      info: 'bg-muted border-border border-l-primary text-foreground',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-[1.0625rem] font-semibold leading-[1.4] tracking-tight', className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-2 text-sm leading-relaxed', className)} {...props} />;
}
