'use client';

import { Package, PackagePlus, Scale } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { DetailList } from '@/components/DetailList';
import { FilterTabs } from '@/components/FilterTabs';
import { PageActions } from '@/components/PageActions';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WriteAction } from '@/components/WriteAction';
import type { Movement, StockBalance, StockBatch } from '@/features/inventory/api';
import { BAND_STATUS, batchLabel, shelfLifeLeft } from '@/features/inventory/bands';
import { formatDate, formatNumber, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useReadOnly } from '@/navigation/useAccess';

import { AdjustBatchDialog } from './AdjustBatchDialog';
import { useCurrentWarehouse, useStoreBatches, useStoreStock } from './orderQueries';
import { WAREHOUSE_PATHS, withStore } from './paths';
import { reservable } from './picking';
import {
  BATCH_FILTERS,
  batchFilterFrom,
  keepsBatch,
  MOVEMENT_LABEL,
  movementBatch,
  signed,
} from './stock';
import { useStoreMovements } from './stockQueries';
import { StoreSwitch } from './StoreSwitch';

const batchColumns: DataTableColumn<StockBatch>[] = [
  {
    id: 'batch',
    header: 'Batch',
    value: (batch) => batch.batch_number ?? '',
    cell: (batch) => (
      <div className="flex min-w-0 flex-col">
        <span
          className={cn(
            'max-w-64 truncate',
            batch.batch_number ? 'font-medium' : 'text-muted-foreground',
          )}
          title={batchLabel(batch)}
        >
          {batchLabel(batch)}
        </span>
        {batch.batch_number ? null : (
          <span className="text-muted-foreground text-xs">Count it and record its batches</span>
        )}
      </div>
    ),
  },
  {
    id: 'product',
    header: 'Product',
    value: (batch) => `${batch.product} ${batch.unit}`,
    cell: (batch) => (
      <div className="max-w-56 min-w-0">
        <div className="truncate" title={batch.product}>
          {batch.product}
        </div>
        <div className="text-muted-foreground text-xs">{batch.unit}</div>
      </div>
    ),
  },
  {
    id: 'expires',
    header: 'Expires',
    value: (batch) => batch.expiry_date ?? '9999',
    cell: (batch) =>
      batch.expiry_date ? (
        <div>
          <div>{formatDate(batch.expiry_date)}</div>
          <div className="text-muted-foreground text-xs">{shelfLifeLeft(batch.days_remaining)}</div>
        </div>
      ) : (
        <span className="text-muted-foreground">Not recorded</span>
      ),
  },
  {
    id: 'band',
    header: 'Shelf life',
    value: (batch) => BAND_STATUS[batch.band].label,
    cell: (batch) => (
      <StatusBadge status={BAND_STATUS[batch.band].label} tone={BAND_STATUS[batch.band].tone} />
    ),
  },
  {
    id: 'on_hand',
    header: 'On hand',
    numeric: true,
    value: (batch) => batch.on_hand,
    cell: (batch) => formatNumber(batch.on_hand),
  },
];

function movementColumns(href: (path: string) => string): DataTableColumn<Movement>[] {
  return [
    {
      id: 'at',
      header: 'When',
      value: (movement) => movement.created_at,
      cell: (movement) => formatTimestamp(movement.created_at),
    },
    {
      id: 'reason',
      header: 'What',
      value: (movement) => MOVEMENT_LABEL[movement.reason].label,
      cell: (movement) => {
        const shown = MOVEMENT_LABEL[movement.reason];
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            {movement.order_id ? (
              <Link
                href={href(WAREHOUSE_PATHS.request(movement.order_id))}
                className="font-medium underline-offset-4 hover:underline"
              >
                {shown.label}
              </Link>
            ) : (
              <span className="font-medium">{shown.label}</span>
            )}
            {movement.note ? (
              <span
                className="text-muted-foreground block max-w-56 truncate text-xs"
                title={movement.note}
              >
                {movement.note}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'batch',
      header: 'Batch',
      value: (movement) => movementBatch(movement) ?? '',
      cell: (movement) => {
        const batch = movementBatch(movement);
        return batch ? (
          <span className="block max-w-40 truncate" title={batch}>
            {batch}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: 'product',
      header: 'Product',
      value: (movement) => movement.product,
      cell: (movement) => (
        <span className="block max-w-56 truncate" title={`${movement.product} · ${movement.unit}`}>
          {movement.product} · {movement.unit}
        </span>
      ),
    },
    {
      id: 'change',
      header: 'Change',
      numeric: true,
      value: (movement) => movement.quantity,
      cell: (movement) => (
        <span className={cn('tabular-nums', movement.quantity > 0 && 'text-success')}>
          {signed(movement.quantity)}
        </span>
      ),
    },
    {
      id: 'after',
      header: 'On hand after',
      numeric: true,
      value: (movement) => movement.on_hand_after,
      cell: (movement) => formatNumber(movement.on_hand_after),
    },
  ];
}

export default function WarehouseStockPage() {
  const { code, href, warehouse, ...stores } = useCurrentWarehouse();
  const storeId = warehouse?.id ?? '';
  const enabled = warehouse !== undefined;
  const stock = useStoreStock(storeId, { enabled });
  const batches = useStoreBatches(storeId, { enabled });
  const movements = useStoreMovements(warehouse?.id);
  const readOnly = useReadOnly();
  const filter = batchFilterFrom(useSearchParams().get('band'));
  const [adjusting, setAdjusting] = useState<StockBatch | null>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const movementCols = useMemo(() => movementColumns(href), [href]);
  const waiting = stores.isPending || !enabled;

  return (
    <div className="gap-section flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <StoreSwitch store={code} hrefFor={(other) => withStore(WAREHOUSE_PATHS.stock, other)} />
        <PageActions>
          <WriteAction>
            <Button asChild>
              <Link href={href(WAREHOUSE_PATHS.receive)}>
                <PackagePlus data-icon="inline-start" />
                Record a delivery
              </Link>
            </Button>
          </WriteAction>
        </PageActions>
      </div>

      <section aria-labelledby="warehouse-balances" className="flex flex-col gap-3">
        <h2 id="warehouse-balances" className="sr-only">
          Stock by product at {code}
        </h2>
        {(stores.error ?? stock.error) ? (
          <div className="bg-card rounded-card border">
            <ErrorState
              title={`Could not load ${code} stock`}
              error={stores.error ?? stock.error}
              onRetry={() => {
                void stores.refetch();
                void stock.refetch();
              }}
              isRetrying={stock.isRefetching}
            />
          </div>
        ) : waiting || stock.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
            <span className="sr-only">Loading stock…</span>
          </div>
        ) : stock.data.length === 0 ? (
          <div className="bg-card rounded-card border">
            <EmptyState
              icon={Package}
              title={`No stock recorded at ${code} yet`}
              description="Record a delivery, or the store's opening balance, batch by batch."
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stock.data.map((balance) => (
              <BalanceCard
                key={`${balance.condom_id}:${balance.unit_of_measure_id}`}
                balance={balance}
                batches={batches.data?.filter(
                  (batch) =>
                    batch.condom_id === balance.condom_id &&
                    batch.unit_of_measure_id === balance.unit_of_measure_id,
                )}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="warehouse-batches">
        <div>
          <h2 id="warehouse-batches" className="text-base font-semibold">
            Batches at {code}
          </h2>
          <p className="text-muted-foreground text-sm">
            Each product&apos;s batches in the order they are dispatched, earliest expiry first.
            Expired batches can&apos;t leave; write them off once they are disposed of.
          </p>
        </div>
        <FilterTabs
          label="Filter batches by shelf life"
          value={filter}
          hrefFor={(value) =>
            href(value === 'all' ? WAREHOUSE_PATHS.stock : WAREHOUSE_PATHS.stockWithBand(value))
          }
          tabs={BATCH_FILTERS.map((option) => ({
            value: option.value,
            label: option.label,
            ...(batches.data
              ? { count: batches.data.filter((batch) => keepsBatch(option.value, batch)).length }
              : {}),
          }))}
        />
        <DataTable
          label={`Batches at ${code}`}
          columns={batchColumns}
          rows={batches.data?.filter((batch) => keepsBatch(filter, batch))}
          getRowId={(batch) => batch.id}
          isLoading={waiting || batches.isPending}
          error={batches.error}
          onRetry={() => void batches.refetch()}
          isRetrying={batches.isRefetching}
          searchPlaceholder="Search batches…"
          emptyTitle={filter === 'all' ? `No batches held at ${code}` : 'No batches in this view'}
          emptyDescription={
            filter === 'all'
              ? 'Batches appear here when a delivery is recorded.'
              : 'Choose another filter to see the rest of the batches.'
          }
          rowActions={
            readOnly
              ? undefined
              : (batch) => (
                  <RowActions
                    label={`Actions for batch ${batchLabel(batch)}`}
                    triggerRef={(button) => {
                      if (button) actionButtons.current.set(batch.id, button);
                      else actionButtons.current.delete(batch.id);
                    }}
                    actions={[
                      {
                        label: batch.band === 'expired' ? 'Write off…' : 'Adjust stock…',
                        icon: Scale,
                        onSelect: () => {
                          setAdjusting(batch);
                        },
                      },
                    ]}
                  />
                )
          }
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="warehouse-movements">
        <div>
          <h2 id="warehouse-movements" className="text-base font-semibold">
            Stock movements
          </h2>
          <p className="text-muted-foreground text-sm">
            Deliveries in, dispatches out and corrections, newest first.
          </p>
        </div>
        <DataTable
          label={`Stock movements at ${code}`}
          columns={movementCols}
          rows={movements.data}
          getRowId={(movement) => movement.id}
          isLoading={waiting || movements.isPending}
          error={movements.error}
          onRetry={() => void movements.refetch()}
          isRetrying={movements.isRefetching}
          searchPlaceholder="Search movements…"
          emptyTitle="No stock movements yet"
          emptyDescription="Deliveries, dispatches and corrections are recorded here."
        />
      </section>

      {adjusting ? (
        <AdjustBatchDialog
          key={adjusting.id}
          batch={adjusting}
          open
          onOpenChange={(open) => {
            if (!open) setAdjusting(null);
          }}
          onCloseAutoFocus={(event) => {
            // The menu item that opened the dialog has gone; focus returns to the row's button.
            const button = actionButtons.current.get(adjusting.id);
            if (!button?.isConnected) return;
            event.preventDefault();
            button.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** One product's stock: what can still be reserved for orders, and what is held back. */
function BalanceCard({
  balance,
  batches,
}: {
  balance: StockBalance;
  batches: readonly StockBatch[] | undefined;
}) {
  const expired = (batches ?? [])
    .filter((batch) => batch.band === 'expired')
    .reduce((sum, batch) => sum + batch.on_hand, 0);
  const soon = (batches ?? [])
    .filter((batch) => batch.band === 'under_1_month' || batch.band === 'under_3_months')
    .reduce((sum, batch) => sum + batch.on_hand, 0);
  const next = batches?.find((batch) => batch.band !== 'expired' && batch.expiry_date !== null);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle asChild>
          <h3 className="truncate" title={balance.product}>
            {balance.product}
          </h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tabular-nums">
            {formatNumber(reservable(balance, batches))}
          </span>
          <span className="text-muted-foreground text-sm">{balance.unit} free to reserve</span>
        </p>
        <DetailList
          className="border-t pt-3"
          items={[
            { label: 'On hand', value: formatNumber(balance.on_hand) },
            { label: 'Reserved for orders', value: formatNumber(balance.reserved) },
            {
              label: 'Expired, to write off',
              value: (
                <span className={expired > 0 ? 'text-destructive font-medium' : undefined}>
                  {formatNumber(expired)}
                </span>
              ),
            },
            {
              label: 'Expiring within 3 months',
              value: (
                <span className={soon > 0 ? 'text-warning font-medium' : undefined}>
                  {formatNumber(soon)}
                </span>
              ),
            },
            {
              label: 'Next expiry',
              value: next?.expiry_date ? formatDate(next.expiry_date) : '—',
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
