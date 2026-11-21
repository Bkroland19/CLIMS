import { EllipsisVertical, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
}

/** Put between actions to split the menu into groups, e.g. before "Deactivate user". */
export const ROW_ACTION_SEPARATOR = 'separator';

export type RowActionItem = RowAction | typeof ROW_ACTION_SEPARATOR;

interface RowActionsProps {
  /** Identifies the row to assistive technology, e.g. "Actions for nakato". */
  label: string;
  actions: readonly RowActionItem[];
}

/**
 * The per-row actions menu at the end of a table row. Separators at the start
 * or end of the list, or next to another separator, are dropped.
 *
 * ```tsx
 * <RowActions label={`Actions for ${user.name}`} actions={[
 *   { label: 'Edit user', icon: Pencil, onSelect: edit },
 *   ROW_ACTION_SEPARATOR,
 *   { label: 'Deactivate user', icon: Ban, onSelect: deactivate, destructive: true },
 * ]} />
 * ```
 */
export function RowActions({ label, actions }: RowActionsProps) {
  const items = withoutStraySeparators(actions);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <EllipsisVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item, index) =>
          item === ROW_ACTION_SEPARATOR ? (
            // A separator has no identity of its own; its position is its key.
            <DropdownMenuSeparator key={`separator-${index}`} />
          ) : (
            <DropdownMenuItem
              key={item.label}
              variant={item.destructive ? 'destructive' : 'default'}
              onSelect={item.onSelect}
            >
              <item.icon aria-hidden="true" />
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Lets callers add a separator conditionally without leaving an empty group. */
function withoutStraySeparators(actions: readonly RowActionItem[]): RowActionItem[] {
  const items: RowActionItem[] = [];
  for (const item of actions) {
    if (item === ROW_ACTION_SEPARATOR && (items.length === 0 || items.at(-1) === item)) continue;
    items.push(item);
  }
  if (items.at(-1) === ROW_ACTION_SEPARATOR) items.pop();
  return items;
}
