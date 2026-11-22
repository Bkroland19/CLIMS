'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { DetailList } from '@/components/DetailList';
import { SampleDataNotice } from '@/components/SampleData';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WarehouseCode } from '@/features/fulfilment/api';
import { expiryOf, MIN_SHELF_MONTHS } from '@/features/fulfilment/batches';
import { ExpiryCell, ProductCell } from '@/features/fulfilment/BatchCells';
import { formatQuantities, productOf } from '@/features/fulfilment/products';
import { StockLevel } from '@/features/fulfilment/StockLevel';
import { formatDate, formatNumber, formatTimestamp } from '@/lib/format';

import type { WarehouseBatch, WarehouseMovement } from './api';
import { BATCH_STATUS, productStock } from './dispatch';
import { WAREHOUSE_PATHS, withStore } from './paths';
import { useWarehouseRequests, useWarehouseStock } from './queries';
import { StoreSwitch } from './StoreSwitch';
import { reservedByOpenRequests } from './tasks';
import { useWarehouseStore } from './useWarehouseStore';

/** Movements about a district request link to it; supplier deliveries have no page. */
const isRequestReference = (reference: string) => reference.startsWith('WR-');

const signed = (value: number) =>
  value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : '0';

function batchColumns(now: Date): DataTableColumn<WarehouseBatch>[] {
  return [
    {
      id: 'product',
      header: 'Product',
      value: (batch) => productOf(batch.product).name,
      cell: (batch) => <ProductCell product={batch.product} />,
    },
    { id: 'batch', header: 'Batch', value: (batch) => batch.batch },
    {
      id: 'manufactured',
      header: 'Manufactured',
      value: (batch) => batch.manufactured_on,
      cell: (batch) => formatDate(batch.manufactured_on),
    },
    {
      id: 'expires',
      header: 'Expires',
      value: (batch) => batch.expires_on,
      cell: (batch) => <ExpiryCell expiresOn={batch.expires_on} now={now} />,
    },
    {
      id: 'pieces',
      header: 'Pieces',
      numeric: true,
      value: (batch) => batch.quantity,
      cell: (batch) => formatNumber(batch.quantity),
    },
    {
      id: 'status',
      header: 'Status',
      value: (batch) => BATCH_STATUS[expiryOf(batch.expires_on, now).state].label,
      cell: (batch) => {
        const shown = BATCH_STATUS[expiryOf(batch.expires_on, now).state];
        return <StatusBadge status={shown.label} tone={shown.tone} />;
      },
    },
  ];
}

function movementColumns(store: WarehouseCode): DataTableColumn<WarehouseMovement>[] {
  return [
    {
      id: 'at',
      header: 'When',
      value: (movement) => movement.at,
      cell: (movement) => formatTimestamp(movement.at),
    },
    {
      id: 'reference',
      header: 'Reference',
      value: (movement) => movement.reference,
      cell: (movement) =>
        isRequestReference(movement.reference) ? (
          <Link
            href={withStore(WAREHOUSE_PATHS.request(movement.reference), store)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {movement.reference}
          </Link>
        ) : (
          movement.reference
        ),
    },
    { id: 'description', header: 'Description', value: (movement) => movement.description },
    {
      id: 'male',
      header: 'Male',
      numeric: true,
      value: (movement) => movement.change.male,
      cell: (movement) => signed(movement.change.male),
    },
    {
      id: 'female',
      header: 'Female',
      numeric: true,
      value: (movement) => movement.change.female,
      cell: (movement) => signed(movement.change.female),
    },
    {
      id: 'balance',
      header: 'Balance',
      value: (movement) => movement.balance.male + movement.balance.female,
      cell: (movement) => formatQuantities(movement.balance),
    },
  ];
}

export default function WarehouseStockPage() {
  const { store, href } = useWarehouseStore();
  const stock = useWarehouseStock(store);
  const requests = useWarehouseRequests(store);
  const router = useRouter();
  // One clock for the page, so every batch is judged against the same moment.
  const now = useMemo(() => new Date(), []);
  const batches = useMemo(() => batchColumns(now), [now]);
  const movements = useMemo(() => movementColumns(store), [store]);
  const reserved = requests.data ? reservedByOpenRequests(requests.data) : null;

  return (
    <div className="gap-section flex flex-col">
      <div className="flex flex-col gap-4">
        <StoreSwitch store={store} hrefFor={(code) => withStore(WAREHOUSE_PATHS.stock, code)} />
        <SampleDataNotice subject="The stock figures" />
      </div>

      {stock.isPending ? (
        <div className="grid gap-4 md:grid-cols-2" role="status">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <span className="sr-only">Loading stock…</span>
        </div>
      ) : stock.isError ? (
        <div className="bg-card rounded-card border">
          <ErrorState
            title={`Could not load ${store} stock`}
            error={stock.error}
            onRetry={() => void stock.refetch()}
            isRetrying={stock.isRefetching}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {productStock(stock.data.batches, now).map((summary) => (
            <Card key={summary.product} className="min-w-0">
              <CardContent className="flex flex-col gap-3">
                <StockLevel
                  size="large"
                  product={summary.product}
                  inStock={stock.data.stock[summary.product]}
                  minimum={stock.data.min_levels[summary.product]}
                  note={
                    reserved
                      ? `${formatNumber(reserved[summary.product])} needed by open district requests`
                      : `Minimum ${formatNumber(stock.data.min_levels[summary.product])} pieces`
                  }
                />
                <DetailList
                  className="border-t pt-4"
                  items={[
                    {
                      label: `Dispatchable (${String(MIN_SHELF_MONTHS)}+ months)`,
                      value: formatNumber(summary.dispatchable),
                    },
                    {
                      label: `Under ${String(MIN_SHELF_MONTHS)} months`,
                      value: formatNumber(summary.flagged),
                    },
                    { label: 'Expired', value: formatNumber(summary.expired) },
                    {
                      label: 'Next expiry',
                      value: summary.nextExpiry ? formatDate(summary.nextExpiry) : '—',
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="warehouse-batches">
        <div>
          <h2 id="warehouse-batches" className="text-base font-semibold">
            Batches at {store}
          </h2>
          <p className="text-muted-foreground text-sm">
            Ordered by expiry. Near expiry means under 3 months; under {MIN_SHELF_MONTHS} months is
            flagged when dispatched; expired batches can&apos;t be dispatched.
          </p>
        </div>
        <DataTable
          label={`Batches at ${store}`}
          columns={batches}
          rows={stock.data?.batches}
          getRowId={(batch) => `${batch.product}:${batch.batch}`}
          isLoading={stock.isPending}
          error={stock.error}
          onRetry={() => void stock.refetch()}
          isRetrying={stock.isRefetching}
          searchPlaceholder="Search batches…"
          emptyTitle={`No stock held at ${store}`}
          emptyDescription="Batches appear here when a supplier delivery is received."
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="warehouse-movements">
        <div>
          <h2 id="warehouse-movements" className="text-base font-semibold">
            Stock movements
          </h2>
          <p className="text-muted-foreground text-sm">
            Supplier deliveries in and dispatches to district stores out, newest first.
          </p>
        </div>
        <DataTable
          label={`Stock movements at ${store}`}
          columns={movements}
          rows={stock.data?.movements}
          getRowId={(movement) => `${movement.at}:${movement.reference}`}
          isLoading={stock.isPending}
          error={stock.error}
          onRetry={() => void stock.refetch()}
          isRetrying={stock.isRefetching}
          searchPlaceholder="Search movements…"
          emptyTitle="No stock movements yet"
          emptyDescription="Deliveries and dispatches are recorded here."
          rowActions={(movement) =>
            isRequestReference(movement.reference) ? (
              <RowActions
                label={`Actions for ${movement.reference}`}
                actions={[
                  {
                    label: 'Open request',
                    icon: ArrowRight,
                    onSelect: () => {
                      router.push(href(WAREHOUSE_PATHS.request(movement.reference)));
                    },
                  },
                ]}
              />
            ) : null
          }
        />
      </section>
    </div>
  );
}
