import { StatusBadge } from '@/components/StatusBadge';
import { formatNumber } from '@/lib/format';

import type { StockCheck } from './stockCheck';

const AVAILABLE = 'Available';
const shortByLabel = (shortBy: number) => `Short by ${formatNumber(shortBy)}`;

interface StockCheckBadgeProps {
  /** From `checkStock`. Null when stock has not been checked yet. */
  check: StockCheck | null;
}

/**
 * The stock-check cell of an items table: "Available", "Short by 1,200", or
 * "—" when nothing is needed or stock has not been checked.
 *
 * ```tsx
 * <StockCheckBadge check={checkStock(row.needed, row.inStock)} />
 * ```
 */
export function StockCheckBadge({ check }: StockCheckBadgeProps) {
  if (!check || check.status === 'not-needed') return <StatusBadge status={null} />;
  if (check.status === 'available') return <StatusBadge status={AVAILABLE} tone="positive" />;
  return <StatusBadge status={shortByLabel(check.shortBy)} tone="caution" />;
}
