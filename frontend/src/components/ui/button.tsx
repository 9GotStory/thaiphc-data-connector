import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[0.84375rem] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-slate-200',
        outline: 'border border-input bg-card text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        destructiveOutline:
          'border border-destructive bg-card text-status-stop-fg hover:bg-red-100/70',
        ghost: 'text-foreground hover:bg-muted',
      },
      size: {
        default: 'min-h-11 sm:min-h-10 px-4 py-2',
        sm: 'min-h-9 px-3 py-1.5 text-xs',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
