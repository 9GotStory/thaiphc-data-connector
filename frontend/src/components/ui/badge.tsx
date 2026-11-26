import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap leading-[1.25]',
  {
    variants: {
      variant: {
        neutral: 'bg-muted border-border text-muted-foreground',
        primarySoft: 'bg-primary-soft border-primary-soft-border text-primary-soft-foreground',
        sandboxSolid: 'bg-env-sandbox-solid border-env-sandbox-solid text-env-sandbox-solid-fg',
        productionSolid: 'bg-env-prod-solid border-env-prod-solid text-env-prod-solid-fg',
        guardOn: 'bg-guard-on-bg border-guard-on-border text-guard-on-fg',
        guardOff: 'bg-guard-off-bg border-guard-off-border text-guard-off-fg',
        verified: 'bg-status-verified-bg border-status-verified-border text-status-verified-fg',
        stop: 'bg-status-stop-bg border-status-stop-border text-status-stop-fg',
        stale: 'bg-status-stale-bg border-status-stale-border text-status-stale-fg',
        legacy: 'bg-status-legacy-bg border-status-legacy-border text-status-legacy-fg',
        insert: 'bg-diff-insert-bg border-diff-insert-border text-diff-insert-fg',
        update: 'bg-diff-update-bg border-diff-update-border text-diff-update-fg',
        unchanged: 'bg-diff-unchanged-bg border-diff-unchanged-border text-diff-unchanged-fg',
        review: 'bg-diff-review-bg border-diff-review-border text-diff-review-fg',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
