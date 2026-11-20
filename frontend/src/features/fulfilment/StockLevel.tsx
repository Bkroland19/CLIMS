import { StatusBadge } from '@/components/StatusBadge';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { productOf, type ProductKey } from './products';

interface StockLevelProps {
  product: ProductKey;
  inStock: number;
  minimum: number;
  /** A line under the bar; defaults to the minimum level. */
  note?: string;
  /** `large` for the store page's cards, `compact` for a dashboard list. */
  size?: 'compact' | 'large';
}

/**
 * One product's stock against its minimum level: the figure, a bar (full at
 * twice the minimum) and whether it is above or below the minimum, in words.
 */
export function StockLevel({ product, inStock, minimum, note, size = 'compact' }: StockLevelProps) {
  const { name, brand } = productOf(product);
  const isAbove = inStock >= minimum;
  const filled = minimum > 0 ? Math.min(100, Math.round((inStock / (minimum * 2)) * 100)) : 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">
          {name} <span className="text-muted-foreground font-normal">· {brand}</span>
        </span>
        {size === 'compact' ? (
          <span className="text-lg font-semibold tabular-nums">{formatNumber(inStock)}</span>
        ) : (
          <StatusBadge
            status={isAbove ? 'Above minimum' : 'Below minimum'}
            tone={isAbove ? 'positive' : 'caution'}
          />
        )}
      </div>
      {size === 'large' ? (
        <p className="text-2xl font-bold tracking-tight tabular-nums">
          {formatNumber(inStock)}{' '}
          <span className="text-muted-foreground text-sm font-normal">pieces</span>
        </p>
      ) : null}
      <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <div
          className={cn('h-full rounded-full', isAbove ? 'bg-primary' : 'bg-warning')}
          style={{ width: `${String(filled)}%` }}
        />
      </div>
      <div className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs">
        <span>{note ?? `Minimum ${formatNumber(minimum)} pieces`}</span>
        {size === 'compact' ? (
          <span className={isAbove ? 'text-success' : 'text-warning'}>
            {isAbove ? 'Above minimum' : 'Below minimum'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
