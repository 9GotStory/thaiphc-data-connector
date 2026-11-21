import * as React from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto rounded-lg border border-border">
      <table
        className={cn('w-full border-collapse text-[0.84375rem] leading-normal', className)}
        {...props}
      />
    </div>
  );
}

export function TableCaption({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('sr-only', className)} {...props} />;
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-muted/80 text-muted-foreground border-b border-border', className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border bg-card', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors duration-150 hover:bg-slate-50/90', className)}
      {...props}
    />
  );
}

export function TableHead({
  className,
  scope = 'col',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-3 align-middle text-foreground', className)} {...props} />;
}
