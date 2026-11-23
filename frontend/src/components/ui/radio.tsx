import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Native single selection, shared by card groups and role selection. */
export function Radio({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="radio"
      data-slot="radio"
      className={cn(
        'focus-visible:ring-ring size-4 shrink-0 cursor-pointer outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
