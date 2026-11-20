import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const TONES = {
  error: 'text-destructive',
  warning: 'text-warning',
} as const;

interface InlineMessageProps extends ComponentProps<'span'> {
  /** `error` for a value that must be fixed; `warning` for one that may stand. */
  tone?: keyof typeof TONES;
}

/**
 * A short message under an input that changes as the user types, such as a
 * quantity in a table row.
 *
 * Render it always, with no children while there is nothing to say: it stays
 * in the page as a polite live region, so a message that appears is read once
 * without interrupting typing. Empty, it takes no space and adds its own top
 * margin when it has text, so give its container no gap. Point the input's
 * `aria-describedby` at its `id` while it has a message. For an error shown
 * after a submit attempt, use `FieldError`.
 *
 * ```tsx
 * <div className="flex flex-col">
 *   <Input aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
 *   <InlineMessage id={errorId}>{error}</InlineMessage>
 * </div>
 * ```
 */
export function InlineMessage({ tone = 'error', className, ...props }: InlineMessageProps) {
  return (
    <span
      aria-live="polite"
      aria-atomic="true"
      data-slot="inline-message"
      data-tone={tone}
      className={cn('text-xs not-empty:mt-1', TONES[tone], className)}
      {...props}
    />
  );
}
