'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { ItemsTable } from '@/components/ItemsTable';
import { SampleDataNotice } from '@/components/SampleData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatNumber, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { BatchLine, DistrictStore, StockMovement, WarehouseRequest } from './api';
import { NEAR_EXPIRY_MONTHS } from './batches';
import { BatchStatusBadge, ExpiryCell, ProductCell } from './BatchCells';
import { PRODUCTS, sumQuantities, type ProductKey } from './products';
import { useDistrictStore, useOrders, useRequests } from './queries';
import { RecordView } from '@/components/RecordView';
import { StockLevel } from './StockLevel';
import { DCFP_PATHS } from '@/features/dcfp/orders';

export default function DistrictStorePage() {
  const store = useDistrictStore();
  return (
    <div className="flex flex-col gap-6">
      <SampleDataNotice subject="The stock figures" />
      <RecordView
        query={store}
        layout="table"
        noun="district store"
        back={{ href: DCFP_PATHS.dashboard, label: 'Back to the dashboard' }}
      >
        {(data) => <StoreView store={data} />}
      </RecordView>
    </div>
  );
}

/** "+1,000", "−400" or "—": a movement's change, signed in words as well as colour. */
function signed(change: number): string {
  if (change === 0) return '—';
  return `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))}`;
}

function ChangeCell({ change }: { change: number }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        change > 0 ? 'text-success font-medium' : change === 0 && 'text-muted-foreground',
      )}
    >
      {signed(change)}
    </span>
  );
}

/** "Last delivery … from NMS · GRN-…", from the most recently received request. */
function lastDelivery(requests: readonly WarehouseRequest[] | undefined): string | null {
  const received = (requests ?? [])
    .flatMap((request) => (request.receipt ? [{ request, receipt: request.receipt }] : []))
    .sort((a, b) => b.receipt.received_at.localeCompare(a.receipt.received_at));
  const [latest] = received;
  if (!latest) return null;
  return `Last delivery ${formatTimestamp(latest.receipt.received_at)} from ${latest.request.warehouse} · ${latest.receipt.grn}.`;
}

function StoreView({ store }: { store: DistrictStore }) {
  const now = new Date();
  const orders = useOrders();
  const requests = useRequests();

  const heldNeed = orders.data
    ? sumQuantities(
        orders.data.filter((order) => order.status === 'on_hold').map((order) => order.approved),
      )
    : null;
  const batches = [...store.batches].sort((a, b) => a.expires_on.localeCompare(b.expires_on));
  const lastIn = lastDelivery(requests.data);

  const movementColumns = useMemo<DataTableColumn<StockMovement>[]>(
    () => [
      {
        id: 'at',
        header: 'Date',
        value: (movement) => movement.at,
        cell: (movement) => formatTimestamp(movement.at),
      },
      { id: 'reference', header: 'Reference', value: (movement) => movement.reference },
      { id: 'movement', header: 'Movement', value: (movement) => movement.description },
      {
        id: 'male',
        header: 'Male',
        numeric: true,
        value: (movement) => movement.change.male,
        cell: (movement) => <ChangeCell change={movement.change.male} />,
      },
      {
        id: 'female',
        header: 'Female',
        numeric: true,
        value: (movement) => movement.change.female,
        cell: (movement) => <ChangeCell change={movement.change.female} />,
      },
      {
        id: 'balance',
        header: 'Balance (M / F)',
        numeric: true,
        sortable: false,
        value: (movement) =>
          `${formatNumber(movement.balance.male)} / ${formatNumber(movement.balance.female)}`,
      },
    ],
    [],
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {PRODUCTS.map((product) => (
          <Card key={product.key}>
            <CardContent className="flex flex-col gap-2">
              <StockLevel
                size="large"
                product={product.key}
                inStock={store.stock[product.key]}
                minimum={store.min_levels[product.key]}
                note={`Minimum level ${formatNumber(store.min_levels[product.key])} · ${
                  heldNeed ? formatNumber(heldNeed[product.key]) : '—'
                } needed by held orders`}
              />
              <p className="text-muted-foreground text-xs">{batchSummary(batches, product.key)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Batches in store</CardTitle>
          <CardDescription>
            {lastIn ? `${lastIn} ` : null}Issued first-expiry-first-out; near expiry is under{' '}
            {NEAR_EXPIRY_MONTHS} months.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ItemsTable<BatchLine>
            label="Batches in store"
            rows={batches}
            getRowId={(batch) => `${batch.product}:${batch.batch}`}
            emptyText="No stock in the district store."
            columns={[
              {
                id: 'product',
                header: 'Product',
                cell: (batch) => <ProductCell product={batch.product} />,
              },
              { id: 'batch', header: 'Batch', cell: (batch) => batch.batch },
              {
                id: 'manufactured',
                header: 'Manufactured',
                cell: (batch) => formatDate(batch.manufactured_on),
              },
              {
                id: 'expires',
                header: 'Expires',
                cell: (batch) => <ExpiryCell expiresOn={batch.expires_on} now={now} />,
              },
              {
                id: 'pieces',
                header: 'Pieces',
                numeric: true,
                cell: (batch) => formatNumber(batch.quantity),
              },
              {
                id: 'status',
                header: 'Status',
                cell: (batch) => <BatchStatusBadge expiresOn={batch.expires_on} now={now} />,
              },
            ]}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="movements-heading" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="movements-heading" className="text-base font-semibold">
              Stock movements
            </h2>
            <p className="text-muted-foreground text-sm">
              Additions from warehouses and allocations to hotspots.
            </p>
          </div>
          <Button asChild className="self-start sm:self-auto">
            <Link href={DCFP_PATHS.newOrder}>
              <Plus data-icon="inline-start" />
              Request stock
            </Link>
          </Button>
        </div>
        <DataTable
          label="Stock movements"
          columns={movementColumns}
          rows={store.movements}
          getRowId={(movement) => `${movement.at}:${movement.reference}:${movement.description}`}
          searchPlaceholder="Search movements…"
          emptyTitle="No stock movements yet"
          emptyDescription="Deliveries from warehouses and allocations to hotspots appear here."
        />
      </section>
    </>
  );
}

/** "2 batches · next expiry 31 Jan 2027", or that there are none. */
function batchSummary(batches: readonly BatchLine[], product: ProductKey): string {
  const own = batches.filter((batch) => batch.product === product);
  const [first] = own;
  if (!first) return 'No batches in store';
  return `${String(own.length)} batch${own.length > 1 ? 'es' : ''} · next expiry ${formatDate(first.expires_on)}`;
}
