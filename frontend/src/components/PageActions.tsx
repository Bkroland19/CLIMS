import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageActionsProps {
  /** The page's primary actions, e.g. export and create buttons. */
  children: ReactNode;
  className?: string;
}

/**
 * The page's own actions, at the top of its content and aligned to the end.
 * The title and description are not here: the shell's heading band shows
 * them, from the navigation table.
 *
 * Not printed. Usage: `<PageActions><ExportButton … /><Button>Add user</Button></PageActions>`.
 */
export function PageActions({ children, className }: PageActionsProps) {
  return (
    <div data-print-hide className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  );
}
