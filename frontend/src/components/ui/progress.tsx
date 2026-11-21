import { cn } from '@/lib/utils';

interface ProgressProps {
  value: number | null;
  label: string;
  className?: string;
}

export function Progress({ value, label, className }: ProgressProps) {
  const clamped = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped ?? undefined}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-200',
          clamped === null && 'w-2/3 animate-pulse motion-reduce:animate-none',
        )}
        style={clamped !== null ? { width: `${clamped}%` } : undefined}
      />
    </div>
  );
}
