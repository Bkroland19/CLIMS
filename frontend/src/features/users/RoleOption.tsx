import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import type { Role } from './api';
import { roleDescription, roleLabel } from './access';

interface RoleOptionProps {
  role: Role;
  selected: boolean;
  /** The control that picks the role: a checkbox, or a radio. */
  children: ReactNode;
}

/** One role as a card: its control, name and what it is for. The whole card toggles it. */
export function RoleOption({ role, selected, children }: RoleOptionProps) {
  const description = roleDescription(role);
  return (
    <label
      className={cn(
        'flex h-full cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
      )}
    >
      {children}
      <span className="min-w-0">
        <span className="block font-medium wrap-anywhere">{roleLabel(role)}</span>
        {description ? (
          <span className="text-muted-foreground block text-xs">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
