import * as React from 'react';
import { cn } from 'cn';

/**
 * A native checkbox, tinted by the page's accent colour. Wrap it in a
 * `<label>` with its text so the whole line toggles it.
 *
 * ```tsx
 * <label className="flex items-center gap-2"><Checkbox checked={x} onChange={…} /> I checked the cartons</label>
 * ```
 */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'focus-visible:ring-ring size-4 shrink-0 cursor-pointer rounded outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
