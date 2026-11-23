'use client';

import {
  BadgeCheck,
  CalendarX2,
  ClockAlert,
  Inbox,
  Layers,
  Package,
  PackagePlus,
  Scale,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { FilterSelect } from '@/components/FilterSelect';
import { FilterTabs } from '@/components/FilterTabs';
import { PageActions } from '@/components/PageActions';
import { StatCard } from '@/components/StatCard';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { WriteAction } from '@/components/WriteAction';
import type { Movement, ProductSummary, StockBatch } from '@/features/inventory/api';
import { BAND_STATUS, batchLabel, shelfLifeLeft } from '@/features/inventory/bands';
import { formatDate, formatNumber, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useReadOnly } from '@/navigation/useAccess';

import { AdjustBatchDialog } from './AdjustBatchDialog';
import { useCurrentWarehouse, useStoreBatches } from './orderQueries';
import { WAREHOUSE_PATHS, withStore } from './paths';
import { RegisterStockSheet } from './RegisterStockSheet';
import { ugandaToday } from './receiving';
import {
  BATCH_FILTERS,
  batchFilterFrom,
  keepsBatch,
  MOVEMENT_LABEL,
  movementBatch,
  signed,
  type BatchFilter,
} from './stock';
import { useStoreMovements, useStoreSummary } from './stockQueries';
import { StoreSwitch } from './StoreSwitch';
import {
  dispatchBreakdown,
  formatAmounts,
  formatMonths,
  formatPercent,
  nextExpiry,
  pendingBreakdown,
  pendingOrders,
  PERIODS,
  periodFrom,
  periodPhrase,
  periodRange,
  stockCover,
  successBreakdown,
  successRate,
  totalsByUnit,
  type Period,
} from './summary';

const VIEWS = [
  { value: 'products', label: 'Products' },
  { value: 'batches', label: 'Batches' },
  { value: 'movements', label: 'Movements' },
] as const;

type View = (typeof VIEWS)[number]['value'];

/** The view in the address; a shelf-life filter alone means the batches. */
function viewFrom(params: URLSearchParams): View {
  const named = VIEWS.find((view) => view.value === params.get('view'))?.value;
  if (named) return named;
  return params.get('band') ? 'batches' : 'products';
}

/** The stock page's address for a view, filter and period, keeping the defaults out of it. */
function stockPath(view: View, band: BatchFilter, period: Period): string {
  const params = new URLSearchParams();
  if (view !== 'products') params.set('view', view);
  if (view === 'batches' && band !== 'all') params.set('band', band);
  if (period !== '30d') params.set('period', period);
  const query = params.toString();
  return query ? `${WAREHOUSE_PATHS.stock}?${query}` : WAREHOUSE_PATHS.stock;
}

/** A figure that is only worth attention when it is above zero. */
function Flagged({ value, tone }: { value: number; tone: 'warning' | 'destructive' }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        value > 0 && (tone === 'warning' ? 'text-warning' : 'text-destructive'),
        value > 0 && 'font-medium',
      )}
    >
      {formatNumber(value)}
    </span>
  );
}

function productColumns(period: Period): DataTableColumn<ProductSummary>[] {
  const phrase = periodPhrase(period);
  return [
    {
      id: 'product',
      header: 'Product',
      value: (row) => `${row.product} ${row.unit}`,
      cell: (row) => (
        <div className="max-w-56 min-w-0">
          <div className="truncate font-medium" title={row.product}>
            {row.product}
          </div>
          <div className="text-muted-foreground text-xs">{row.unit}</div>
        </div>
      ),
    },
    {
      id: 'usable',
      header: 'Free to dispatch',
      numeric: true,
      value: (row) => row.usable,
      cell: (row) => <span className="font-semibold tabular-nums">{formatNumber(row.usable)}</span>,
    },
    {
      id: 'on_hand',
      header: 'On hand',
      numeric: true,
      value: (row) => row.on_hand,
      cell: (row) => formatNumber(row.on_hand),
    },
    {
      id: 'reserved',
      header: 'Reserved',
      numeric: true,
      value: (row) => row.reserved,
      cell: (row) => formatNumber(row.reserved),
    },
    {
      id: 'expiring',
      header: 'Expiring',
      numeric: true,
      value: (row) => row.expiring,
      cell: (row) => <Flagged value={row.expiring} tone="warning" />,
    },
    {
      id: 'expired',
      header: 'Expired',
      numeric: true,
      value: (row) => row.expired,
      cell: (row) => <Flagged value={row.expired} tone="destructive" />,
    },
    {
      id: 'received',
      header: 'Registered',
      numeric: true,
      value: (row) => row.received,
      cell: (row) => (
        <span title={`Registered in the ${phrase}`}>{formatNumber(row.received)}</span>
      ),
    },
    {
      id: 'dispatched',
      header: 'Dispatched',
      numeric: true,
      value: (row) => row.dispatched,
      cell: (row) => (
        <span title={`Dispatched in the ${phrase}`}>{formatNumber(row.dispatched)}</span>
      ),
    },
    {
      id: 'cover',
      header: 'Stock cover',
      numeric: true,
      value: (row) => stockCover(row) ?? -1,
      cell: (row) => {
        const months = stockCover(row);
        return months === null ? (
          <span className="text-muted-foreground" title="Nothing dispatched in the last 90 days">
            —
          </span>
        ) : (
          <span className="whitespace-nowrap">{formatMonths(months)}</span>
        );
      },
    },
    {
      id: 'next_expiry',
      header: 'Next expiry',
      value: (row) => row.next_expiry ?? '9999',
      cell: (row) =>
        row.next_expiry ? (
          <span className="whitespace-nowrap">{formatDate(row.next_expiry)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
}

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
          <div className="whitespace-nowrap">{formatDate(batch.expiry_date)}</div>
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
      cell: (movement) => (
        <span className="whitespace-nowrap">{formatTimestamp(movement.created_at)}</span>
      ),
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

const VIEW_DESCRIPTION: Record<View, (period: Period) => string> = {
  products: (period) =>
    `Each product in each unit. Registered and dispatched cover the ${periodPhrase(period)}; expiring means under three months left; stock cover is free stock over the average month of dispatches in the last 90 days.`,
  batches: () =>
    "Each product's batches in the order they are dispatched, earliest expiry first. Expired batches can't leave; write them off once they are disposed of.",
  movements: () => 'Stock registered, dispatches out and corrections, newest first.',
};

export default function WarehouseStockPage() {
  const { code, href, warehouse, ...stores } = useCurrentWarehouse();
  const params = useSearchParams();
  const router = useRouter();
  const readOnly = useReadOnly();
  const view = viewFrom(params);
  const band = batchFilterFrom(params.get('band'));
  const period = periodFrom(params.get('period'));
  const today = useMemo(() => ugandaToday(new Date()), []);
  const range = useMemo(() => periodRange(period, today), [period, today]);
  const enabled = warehouse !== undefined;
  const summary = useStoreSummary(warehouse?.id, range, { enabled });
  const batches = useStoreBatches(warehouse?.id ?? '', { enabled });
  const movements = useStoreMovements(warehouse?.id, { enabled: enabled && view === 'movements' });
  const [registering, setRegistering] = useState(() => params.get('register') === '1');
  const [startProduct, setStartProduct] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<StockBatch | null>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const productCols = useMemo(() => productColumns(period), [period]);
  const movementCols = useMemo(() => movementColumns(href), [href]);
  const waiting = stores.isPending || !enabled;
  const pathFor = (next: { view?: View; band?: BatchFilter; period?: Period }) =>
    href(stockPath(next.view ?? view, next.band ?? band, next.period ?? period));

  const openRegister = (productId: string | null = null) => {
    setStartProduct(productId);
    setRegistering(true);
  };
  const closeRegister = (open: boolean) => {
    setRegistering(open);
    // Opened from a link (?register=1): closing leaves the address as the page's own.
    if (!open && params.get('register')) router.replace(pathFor({}), { scroll: false });
  };

  const products = summary.data?.products;
  const orders = summary.data?.orders;
  const figuresLoading = waiting || summary.isPending;
  const amounts = (pick: (row: ProductSummary) => number, none?: string) =>
    products ? formatAmounts(totalsByUnit(products, pick), none) : '—';
  const rate = orders ? successRate(orders) : null;
  const expiringNext = products ? nextExpiry(products) : null;
  const expiredBatches = batches.data?.filter((batch) => batch.band === 'expired').length ?? 0;

  const registerButton = (
    <WriteAction>
      <Button
        onClick={() => {
          openRegister();
        }}
        disabled={!enabled}
      >
        <PackagePlus data-icon="inline-start" />
        Register stock
      </Button>
    </WriteAction>
  );

  return (
    <div className="gap-section flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <StoreSwitch
          store={code}
          hrefFor={(other) => withStore(stockPath(view, band, period), other)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Period"
            value={period}
            options={PERIODS.map((option) => ({ value: option.value, label: option.label }))}
            onValueChange={(next) => {
              router.replace(pathFor({ period: next }), { scroll: false });
            }}
          />
          <PageActions>{registerButton}</PageActions>
        </div>
      </div>

      <section aria-labelledby="stock-figures">
        <h2 id="stock-figures" className="sr-only">
          {code} stock at a glance
        </h2>
        {(stores.error ?? summary.error) ? (
          <div className="bg-card rounded-card border">
            <ErrorState
              title={`Could not load ${code} stock`}
              error={stores.error ?? summary.error}
              onRetry={() => {
                void stores.refetch();
                void summary.refetch();
              }}
              isRetrying={summary.isRefetching}
            />
          </div>
        ) : (
          // Six figures read as two rows of three, or three rows of two on a phone, never 5 + 1.
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="On hand"
              value={amounts((row) => row.on_hand)}
              detail={
                products
                  ? `${amounts((row) => row.usable)} free to dispatch · ${amounts((row) => row.reserved)} reserved`
                  : undefined
              }
              icon={Package}
              href={pathFor({ view: 'products' })}
              isLoading={figuresLoading}
            />
            <StatCard
              label={`Dispatched, ${periodPhrase(period)}`}
              value={amounts((row) => row.dispatched)}
              detail={orders ? dispatchBreakdown(orders, period) : undefined}
              icon={Truck}
              accent="violet"
              href={href(WAREHOUSE_PATHS.requestsWithStatus('dispatched'))}
              isLoading={figuresLoading}
            />
            <StatCard
              label="Expired"
              value={amounts((row) => row.expired, 'None')}
              detail={
                products && totalsByUnit(products, (row) => row.expired).length > 0
                  ? `${formatNumber(expiredBatches)} ${expiredBatches === 1 ? 'batch' : 'batches'} to write off; can't be dispatched`
                  : 'Nothing past its expiry date'
              }
              icon={CalendarX2}
              accent="caution"
              href={pathFor({ view: 'batches', band: 'expired' })}
              isLoading={figuresLoading}
            />
            <StatCard
              label="Expiring within 3 months"
              value={amounts((row) => row.expiring, 'None')}
              detail={
                expiringNext
                  ? `Next expiry ${formatDate(expiringNext)}; earliest goes out first`
                  : 'No expiry dates recorded yet'
              }
              icon={ClockAlert}
              accent="caution"
              href={pathFor({ view: 'batches', band: 'expiring' })}
              isLoading={figuresLoading}
            />
            <StatCard
              label="Pending district orders"
              value={orders ? formatNumber(pendingOrders(orders)) : '—'}
              detail={orders ? pendingBreakdown(orders) : undefined}
              icon={Inbox}
              accent="info"
              href={href(WAREHOUSE_PATHS.requests)}
              isLoading={figuresLoading}
            />
            <StatCard
              label={`Success rate, ${periodPhrase(period)}`}
              value={rate === null ? '—' : formatPercent(rate)}
              detail={orders ? successBreakdown(orders, period) : undefined}
              icon={BadgeCheck}
              accent="positive"
              href={href(WAREHOUSE_PATHS.requests)}
              isLoading={figuresLoading}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="stock-detail" className="flex flex-col gap-3">
        <h2 id="stock-detail" className="sr-only">
          Stock at {code} in detail
        </h2>
        <div className="flex flex-col gap-1.5">
          <FilterTabs
            label="Show stock by"
            value={view}
            hrefFor={(next) => pathFor({ view: next, band: 'all' })}
            tabs={VIEWS.map((option) => ({
              value: option.value,
              label: option.label,
              ...(option.value === 'products' && products ? { count: products.length } : {}),
              ...(option.value === 'batches' && batches.data ? { count: batches.data.length } : {}),
            }))}
          />
          <p className="text-muted-foreground max-w-[75ch] text-sm text-pretty">
            {VIEW_DESCRIPTION[view](period)}
          </p>
        </div>

        {view === 'products' ? (
          <DataTable
            label={`Stock by product at ${code}`}
            columns={productCols}
            rows={products}
            getRowId={(row) => `${row.condom_id}:${row.unit_of_measure_id}`}
            isLoading={figuresLoading}
            error={summary.error}
            onRetry={() => void summary.refetch()}
            isRetrying={summary.isRefetching}
            searchPlaceholder="Search products…"
            emptyTitle={`No stock registered at ${code} yet`}
            emptyDescription="Register the first stock, batch by batch, and each product appears here."
            emptyAction={readOnly ? undefined : registerButton}
            rowActions={
              readOnly
                ? undefined
                : (row) => (
                    <RowActions
                      label={`Actions for ${row.product}, ${row.unit}`}
                      actions={[
                        {
                          label: 'Register stock…',
                          icon: PackagePlus,
                          onSelect: () => {
                            openRegister(row.condom_id);
                          },
                        },
                        {
                          label: 'See batches',
                          icon: Layers,
                          onSelect: () => {
                            router.push(pathFor({ view: 'batches', band: 'all' }), {
                              scroll: false,
                            });
                          },
                        },
                      ]}
                    />
                  )
            }
          />
        ) : null}

        {view === 'batches' ? (
          <DataTable
            label={`Batches at ${code}`}
            columns={batchColumns}
            rows={batches.data?.filter((batch) => keepsBatch(band, batch))}
            getRowId={(batch) => batch.id}
            isLoading={waiting || batches.isPending}
            error={batches.error}
            onRetry={() => void batches.refetch()}
            isRetrying={batches.isRefetching}
            searchPlaceholder="Search batches…"
            toolbar={
              <FilterSelect
                label="Shelf life"
                value={band}
                options={BATCH_FILTERS.map((option) => ({
                  value: option.value,
                  label: batches.data
                    ? `${option.label} (${formatNumber(
                        batches.data.filter((batch) => keepsBatch(option.value, batch)).length,
                      )})`
                    : option.label,
                }))}
                onValueChange={(next) => {
                  router.replace(pathFor({ view: 'batches', band: next }), { scroll: false });
                }}
              />
            }
            emptyTitle={band === 'all' ? `No batches held at ${code}` : 'No batches in this view'}
            emptyDescription={
              band === 'all'
                ? 'Batches appear here when stock is registered.'
                : 'Choose another shelf life to see the rest of the batches.'
            }
            emptyAction={band === 'all' && !readOnly ? registerButton : undefined}
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
        ) : null}

        {view === 'movements' ? (
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
            emptyDescription="Stock registered, dispatches and corrections are listed here."
          />
        ) : null}
      </section>

      <RegisterStockSheet
        open={registering}
        onOpenChange={closeRegister}
        code={code}
        warehouse={warehouse}
        startProductId={startProduct}
      />

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
