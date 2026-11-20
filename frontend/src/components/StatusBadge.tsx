import type { ComponentProps } from 'react';

import { statusTone, type StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<StatusTone, string> = {
  positive: 'bg-success/10 text-success',
  info: 'bg-info/10 text-info',
  caution: 'bg-warning/10 text-warning',
  negative: 'bg-destructive/10 text-destructive',
  neutral: 'bg-secondary text-muted-foreground',
};

interface StatusBadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** The status word, shown as written (the chip sets it in capitals). */
  status: string | null | undefined;
  /**
   * Overrides the tone looked up from the word. Pass it when the same word
   * means different things in different places, e.g. "Received".
   */
  tone?: StatusTone;
}

/**
 * A status word as a tinted pill with a dot. The word carries the meaning;
 * colour only reinforces it. A missing status shows "—".
 *
 * ```tsx
 * <StatusBadge status={order.status} />
 * <StatusBadge status="Received" tone="positive" />
 * ```
 */
export function StatusBadge({ status, tone, className, ...props }: StatusBadgeProps) {
  const label = status?.trim();
  if (!label) {
    return (
      <span className={cn('text-muted-foreground', className)} {...props}>
        —
      </span>
    );
  }
  const resolvedTone = tone ?? statusTone(label);
  return (
    <span
      data-tone={resolvedTone}
      className={cn('status-chip max-w-full', TONE_CLASSES[resolvedTone], className)}
      {...props}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{label}</span>
    </span>
  );
}
