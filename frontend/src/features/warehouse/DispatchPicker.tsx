import { InlineMessage } from '@/components/InlineMessage';
import { ItemsTable } from '@/components/ItemsTable';
import { StatusBadge } from '@/components/StatusBadge';
import { MIN_SHELF_MONTHS, NEAR_EXPIRY_MONTHS } from '@/features/fulfilment/batches';
import { ExpiryCell } from '@/features/fulfilment/BatchCells';
import { productOf } from '@/features/fulfilment/products';
import { Input } from '@/components/ui/input';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BATCH_STATUS, type DispatchGroup, type DispatchLot } from './dispatch';

interface DispatchPickerProps {
  groups: readonly DispatchGroup[];
  onPick: (key: string, text: string) => void;
  disabled?: boolean;
  now: Date;
}

/**
 * The warehouse batches to dispatch a request from, one table per product,
 * suggested first-expiry-first-out and editable. Unlike the district's
 * `BatchPicker`, batches under the minimum shelf life can be picked (with a
 * warning) and the picks may come to less than was requested.
 */
export function DispatchPicker({ groups, onPick, disabled = false, now }: DispatchPickerProps) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <PickTable
          key={group.product}
          group={group}
          onPick={onPick}
          disabled={disabled}
          now={now}
        />
      ))}
      <p className="text-muted-foreground text-xs">
        Picks are suggested first-expiry-first-out from batches with {MIN_SHELF_MONTHS}+ months
        shelf life. Flagged batches can still be picked: the district is warned on the waybill.
        Expired batches can&apos;t be dispatched.
      </p>
    </div>
  );
}

function PickTable({
  group,
  onPick,
  disabled,
  now,
}: {
  group: DispatchGroup;
  onPick: DispatchPickerProps['onPick'];
  disabled: boolean;
  now: Date;
}) {
  const { name, brand } = productOf(group.product);
  const summary = [
    `Picking ${formatNumber(group.total)} of ${formatNumber(group.need)}`,
    group.batchesUsed > 0
      ? `${String(group.batchesUsed)} batch${group.batchesUsed > 1 ? 'es' : ''}`
      : null,
    group.flaggedPieces > 0 ? `${formatNumber(group.flaggedPieces)} flagged` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const isOff = group.total !== group.need || group.flaggedPieces > 0;

  return (
    <section aria-label={`${name} batches`} className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
        <h3 className="text-sm font-medium">
          {name} <span className="text-muted-foreground font-normal">· {brand}</span>
        </h3>
        <p className={cn('text-xs font-medium', isOff ? 'text-warning' : 'text-success')}>
          {summary}
        </p>
      </div>
      <ItemsTable<DispatchLot>
        label={`${name} batches to pick from`}
        rows={group.lots}
        getRowId={(lot) => lot.key}
        emptyText={`No ${name.toLowerCase()} held at this warehouse.`}
        rowTone={(lot) => (!lot.canPick ? 'negative' : lot.isFlagged ? 'caution' : 'default')}
        columns={[
          {
            id: 'batch',
            header: 'Batch',
            cell: (lot) => (
              <div className="flex flex-col gap-1">
                <span className="font-medium">{lot.batch.batch}</span>
                <span className="text-muted-foreground text-xs">
                  Made {formatDate(lot.batch.manufactured_on)}
                </span>
                {lot.isFirstOut ? (
                  <span className="text-success text-xs font-medium">
                    Expires first · pick first
                  </span>
                ) : null}
                {lot.expiry === 'ok' ? null : (
                  <StatusBadge
                    status={BATCH_STATUS[lot.expiry].label}
                    tone={BATCH_STATUS[lot.expiry].tone}
                    className="self-start"
                  />
                )}
              </div>
            ),
          },
          {
            id: 'expires',
            header: 'Expires',
            cell: (lot) => <ExpiryCell expiresOn={lot.batch.expires_on} now={now} />,
          },
          {
            id: 'available',
            header: 'Available',
            numeric: true,
            cell: (lot) => formatNumber(lot.batch.quantity),
          },
          {
            id: 'pick',
            header: 'Pick',
            cell: (lot) => <PickCell lot={lot} onPick={onPick} disabled={disabled} />,
          },
        ]}
      />
    </section>
  );
}

function PickCell({
  lot,
  onPick,
  disabled,
}: {
  lot: DispatchLot;
  onPick: DispatchPickerProps['onPick'];
  disabled: boolean;
}) {
  if (!lot.canPick) {
    return <span className="text-destructive text-xs">Expired: can&apos;t dispatch</span>;
  }
  const noteId = `${lot.key}-note`;
  const error =
    lot.error === 'more-than-available'
      ? 'More than available'
      : lot.error === 'not-a-number'
        ? 'Enter a whole number'
        : null;
  const warning =
    !error && lot.isFlagged && lot.taking > 0
      ? lot.expiry === 'near'
        ? `Expires within ${String(NEAR_EXPIRY_MONTHS)} months`
        : `Below the ${String(MIN_SHELF_MONTHS)}-month minimum`
      : null;
  const note = error ?? warning;
  return (
    <div className="flex w-32 flex-col">
      <Input
        inputMode="numeric"
        value={lot.text}
        onChange={(event) => {
          onPick(lot.key, event.target.value);
        }}
        aria-label={`Pieces to pick from batch ${lot.batch.batch}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        disabled={disabled}
        className="h-8 text-right tabular-nums"
      />
      <InlineMessage id={noteId} tone={error ? 'error' : 'warning'} className="whitespace-normal">
        {note}
      </InlineMessage>
    </div>
  );
}
