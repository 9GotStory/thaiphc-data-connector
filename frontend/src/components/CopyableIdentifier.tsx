import { Check, ChevronDown, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface CopyableIdentifierProps {
  value: string;
  displayValue?: string;
  label: string;
  maxWidthClass?: string;
}

export function CopyableIdentifier({
  value,
  displayValue,
  label,
  maxWidthClass = 'max-w-[160px]',
}: CopyableIdentifierProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'fallback'>('idle');
  const [expanded, setExpanded] = useState(false);

  async function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setExpanded(true);
      setCopyStatus('fallback');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 1800);
    } catch {
      setExpanded(true);
      setCopyStatus('fallback');
    }
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="relative min-w-0">
      <div className={cn('flex items-center gap-1 min-w-0', maxWidthClass)}>
        <code className="min-w-0 truncate font-mono text-[0.78125rem] font-medium tabular-nums text-foreground">
          {displayValue ?? value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 sm:size-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          aria-label={`คัดลอก ${label}`}
        >
          {copyStatus === 'copied' ? (
            <Check className="size-3.5 shrink-0 text-guard-on-fg" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5 shrink-0" aria-hidden="true" />
          )}
        </Button>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 sm:size-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`แสดงรหัสเต็มของ ${value}`}
          >
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform duration-150',
                expanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {copyStatus === 'copied'
          ? `คัดลอก ${label} แล้ว`
          : copyStatus === 'fallback'
            ? `เปิดรหัสเต็มของ ${label} เพื่อคัดลอกด้วยตนเอง`
            : ''}
      </span>
      <CollapsibleContent className="mt-1.5">
        <div className="rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground [overflow-wrap:anywhere]">
          {value}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
