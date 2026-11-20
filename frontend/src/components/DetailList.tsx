import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface DetailItem {
  label: string;
  value: ReactNode;
}

interface DetailListProps extends Omit<ComponentProps<'dl'>, 'children'> {
  items: readonly DetailItem[];
  /**
   * `rows` puts each label beside its value, for a narrow side card;
   * `grid` stacks label over value in columns, for a band of facts.
   */
  variant?: 'rows' | 'grid';
}

/**
 * Labelled facts about a record, as a description list.
 *
 * ```tsx
 * <DetailList items={[{ label: 'Contact person', value: 'Grace Nakato' }]} />
 * <DetailList variant="grid" items={[{ label: 'Waybill', value: 'WB-NMS-26-1187' }]} />
 * ```
 */
export function DetailList({ items, variant = 'rows', className, ...props }: DetailListProps) {
  if (variant === 'grid') {
    return (
      <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4', className)} {...props}>
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd className="text-sm font-medium break-words">{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={cn('divide-y text-sm', className)} {...props}>
      {items.map((item) => (
        <div key={item.label} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground shrink-0">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
