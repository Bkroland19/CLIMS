import Link from 'next/link';

import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface FilterTab<Value extends string> {
  value: Value;
  label: string;
  /** How many rows the filter keeps; left out while unknown. */
  count?: number;
}

interface FilterTabsProps<Value extends string> {
  /** Names the set of filters, e.g. "Filter orders by status". */
  label: string;
  tabs: readonly FilterTab<Value>[];
  value: Value;
  /** The address that applies a filter, so the choice survives a refresh and can be shared. */
  hrefFor: (value: Value) => string;
  className?: string;
}

/**
 * A row of filters over one list, each a link to the same page with the
 * filter in its address. The active filter is marked `aria-current`. Scrolls
 * sideways on a narrow screen rather than wrapping.
 *
 * ```tsx
 * <FilterTabs label="Filter orders by status" value={status}
 *   hrefFor={(value) => `/dcfp/orders?status=${value}`}
 *   tabs={[{ value: 'all', label: 'All', count: 12 }, { value: 'queued', label: 'In queue', count: 3 }]} />
 * ```
 */
export function FilterTabs<Value extends string>({
  label,
  tabs,
  value,
  hrefFor,
  className,
}: FilterTabsProps<Value>) {
  return (
    <nav aria-label={label} className={cn('max-w-full overflow-x-auto', className)}>
      <ul className="bg-secondary inline-flex gap-1 rounded-lg p-1">
        {tabs.map((tab) => {
          const isActive = tab.value === value;
          return (
            <li key={tab.value}>
              <Link
                href={hrefFor(tab.value)}
                scroll={false}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2',
                  isActive
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                {/* A space, so the count is read as a separate word: "In queue 3". */}
                {tab.count === undefined ? null : ' '}
                {tab.count === undefined ? null : (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatNumber(tab.count)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
