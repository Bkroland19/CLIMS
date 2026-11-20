import { TriangleAlert } from 'lucide-react';

import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { expiryOf } from './batches';
import { productOf, type ProductKey } from './products';

/** A product's name over its brand, for the first cell of a line. */
export function ProductCell({ product }: { product: ProductKey }) {
  const { name, brand } = productOf(product);
  return (
    <div className="min-w-0">
      <div className="font-medium">{name}</div>
      <div className="text-muted-foreground text-xs">{brand}</div>
    </div>
  );
}

/**
 * An expiry date over the time left, tinted when the batch is near or past
 * expiry. Near expiry also gets a warning icon and the words for a screen
 * reader, so the tint is never the only sign ("Expired" says it already).
 */
export function ExpiryCell({ expiresOn, now }: { expiresOn: string; now: Date }) {
  const { state, left } = expiryOf(expiresOn, now);
  return (
    <div>
      <div>{formatDate(expiresOn)}</div>
      <div
        className={cn(
          'flex items-center gap-1 text-xs',
          state === 'expired'
            ? 'text-destructive'
            : state === 'near'
              ? 'text-warning'
              : 'text-muted-foreground',
        )}
      >
        {state === 'near' ? <TriangleAlert className="size-3 shrink-0" aria-hidden="true" /> : null}
        {left}
        {state === 'near' ? <span className="sr-only">, near expiry</span> : null}
      </div>
    </div>
  );
}

/** "Expired", "Near expiry" or "OK" for a batch held in store. */
export function BatchStatusBadge({ expiresOn, now }: { expiresOn: string; now: Date }) {
  const { state } = expiryOf(expiresOn, now);
  if (state === 'expired') return <StatusBadge status="Expired" tone="negative" />;
  if (state === 'near') return <StatusBadge status="Near expiry" tone="caution" />;
  return <StatusBadge status="OK" tone="positive" />;
}
