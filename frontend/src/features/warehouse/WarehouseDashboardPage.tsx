'use client';

import { ClockAlert, Inbox, PackageCheck, Truck } from 'lucide-react';
import Link from 'next/link';

import { ActivityTimeline, type ActivityEntry } from '@/components/ActivityTimeline';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { ShareList } from '@/components/charts/ShareList';
import { StatCard, StatCardGrid } from '@/components/StatCard';
import { ErrorState } from '@/components/states/ErrorState';
import { TaskList } from '@/components/TaskList';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DistrictSelect, useDistrictContext } from '@/features/district/DistrictContext';
import type { Order } from '@/features/orders/api';
import { formatNumber, formatTimestamp } from '@/lib/format';

import {
  useCurrentWarehouse,
  useRequestNames,
  useStoreBatches,
  useStoreOrders,
  useStoreStock,
} from './orderQueries';
import { WAREHOUSE_PATHS, withStore } from './paths';
import { reservable } from './picking';
import { REQUEST_FILTERS } from './requests';
import { SAMPLE_REQUESTS_BY_DISTRICT, SAMPLE_WEEKLY_DISPATCHES } from './sampleCharts';
import { MOVEMENT_LABEL, movementBatch, signed } from './stock';
import { useStoreMovements } from './stockQueries';
import { StoreSwitch } from './StoreSwitch';
import { isPieces, productName, unitSuffix } from './summary';
import { warehouseTasks } from './tasks';

const RECENT_EVENTS = 6;
const SHARE_COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

type FilterValue = (typeof REQUEST_FILTERS)[number]['value'];

function countOf(orders: readonly Order[] | undefined, value: FilterValue): string {
  const filter = REQUEST_FILTERS.find((candidate) => candidate.value === value);
  if (!orders || !filter) return '—';
  return formatNumber(orders.filter(filter.keeps).length);
}

export default function WarehouseDashboardPage() {
  const { code, href, warehouse, ...stores } = useCurrentWarehouse();
  const district = useDistrictContext()?.district;
  const names = useRequestNames();
  const orders = useStoreOrders(warehouse?.id);
  const stock = useStoreStock(warehouse?.id ?? '', { enabled: warehouse !== undefined });
  const batches = useStoreBatches(warehouse?.id ?? '', { enabled: warehouse !== undefined });
  const movements = useStoreMovements(warehouse?.id);
  const visibleOrders = district
    ? orders.data?.filter((order) => names.district(order.ordered_for_store_id) === district)
    : orders.data;
  const filtered = (value: FilterValue) => href(WAREHOUSE_PATHS.requestsWithStatus(value));
  const waiting = stores.isPending || warehouse === undefined;
  const expiring = batches.data?.filter(
    (batch) => batch.band === 'under_1_month' || batch.band === 'under_3_months',
  );
  const recent: ActivityEntry[] = (movements.data ?? [])
    .slice(0, RECENT_EVENTS)
    .map((movement) => ({
      id: movement.id,
      text: `${MOVEMENT_LABEL[movement.reason].label}: ${signed(movement.quantity)}${unitSuffix(movement.unit)}${
        movementBatch(movement) ? ` · ${movementBatch(movement) ?? ''}` : ''
      }`,
      meta: `${productName(movement.product, movement.unit)} · ${formatTimestamp(movement.created_at)}`,
      role: 'warehouse',
    }));

  return (
    <div className="gap-section flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <StoreSwitch
          store={code}
          hrefFor={(other) => withStore(WAREHOUSE_PATHS.dashboard, other)}
        />
        <DistrictSelect />
      </div>

      {/* The last card is as wide as the stock column under it, so the edges line up. */}
      <StatCardGrid className="xl:grid-cols-[1fr_1fr_1fr_22rem]">
        <StatCard
          label="New orders"
          value={countOf(visibleOrders, 'queued')}
          icon={Inbox}
          accent="info"
          href={filtered('queued')}
          isLoading={waiting || orders.isPending}
        />
        <StatCard
          label="To dispatch"
          value={countOf(visibleOrders, 'confirmed')}
          icon={PackageCheck}
          accent="caution"
          href={filtered('confirmed')}
          isLoading={waiting || orders.isPending}
        />
        <StatCard
          label="In transit"
          value={countOf(visibleOrders, 'dispatched')}
          icon={Truck}
          accent="violet"
          href={filtered('dispatched')}
          isLoading={waiting || orders.isPending}
        />
        <StatCard
          label="Batches expiring within 3 months"
          value={expiring ? formatNumber(expiring.length) : '—'}
          icon={ClockAlert}
          accent="caution"
          href={href(WAREHOUSE_PATHS.stock)}
          isLoading={waiting || batches.isPending}
        />
      </StatCardGrid>

      {/*
        Tasks, then the sample charts under them, with the warehouse's stock beside
        both. The task card is only as tall as its tasks, so the charts take the
        space a short list leaves. On a narrow screen the stock comes before the
        charts, since it is live and they are not.
      */}
      <div className="gap-section grid items-start lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <TaskList
          className="lg:col-start-1 lg:row-start-1"
          title="Needs your action"
          tasks={
            visibleOrders && batches.data
              ? warehouseTasks(visibleOrders, batches.data, names, (iso) =>
                  formatTimestamp(iso),
                ).map((task) => ({ ...task, href: href(task.href) }))
              : undefined
          }
          isLoading={waiting || orders.isPending || batches.isPending}
          error={stores.error ?? orders.error ?? batches.error}
          errorTitle="Could not load your tasks"
          onRetry={() => {
            void stores.refetch();
            void orders.refetch();
            void batches.refetch();
          }}
          isRetrying={orders.isRefetching || batches.isRefetching}
          loadingLabel="Loading tasks…"
          empty={
            district
              ? {
                  title: `Nothing from ${district} needs you right now`,
                  description: `New orders from ${district} will appear here.`,
                }
              : {
                  title: 'Nothing needs you right now',
                  description: 'New orders from district stores will appear here.',
                }
          }
        />

        <div className="gap-section flex min-w-0 flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle>Stock at {code}</CardTitle>
              <CardAction>
                <Button asChild variant="outline" size="sm">
                  <Link href={href(WAREHOUSE_PATHS.stock)}>View stock</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {waiting || stock.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : stock.isError ? (
                <ErrorState
                  title={`Could not load ${code} stock`}
                  error={stock.error}
                  onRetry={() => void stock.refetch()}
                  isRetrying={stock.isRefetching}
                />
              ) : stock.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">No stock recorded yet.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {stock.data.map((balance) => (
                    <li
                      key={`${balance.condom_id}:${balance.unit_of_measure_id}`}
                      className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate text-sm">{balance.product}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        <span className="font-medium">
                          {formatNumber(
                            reservable(
                              balance,
                              batches.data?.filter(
                                (batch) =>
                                  batch.condom_id === balance.condom_id &&
                                  batch.unit_of_measure_id === balance.unit_of_measure_id,
                              ),
                            ),
                          )}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {isPieces(balance.unit) ? 'free' : `${balance.unit} free`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent stock movements</CardTitle>
              <CardDescription>
                Stock registered, dispatches and corrections at {code}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {waiting || movements.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : movements.isError ? (
                <ErrorState
                  title="Could not load the stock movements"
                  error={movements.error}
                  onRetry={() => void movements.refetch()}
                  isRetrying={movements.isRefetching}
                />
              ) : recent.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {district
                    ? `Nothing has happened on orders from ${district} yet.`
                    : 'Nothing has happened yet.'}
                </p>
              ) : (
                <ActivityTimeline variant="compact" entries={recent} />
              )}
            </CardContent>
          </Card>
        </div>

        {!district && (
          <div className="@container min-w-0 lg:col-start-1 lg:row-start-2">
            <div className="gap-section grid @2xl:grid-cols-2">
              <ColumnChart
                title="Male condoms dispatched"
                description="Pieces dispatched to district stores per week, last 8 weeks"
                categoryLabel="Week"
                series={{ key: 'male', label: 'Male condoms', color: 'var(--chart-1)' }}
                rows={SAMPLE_WEEKLY_DISPATCHES}
                isSample
              />
              <ShareList
                title="Requests by district"
                description="District requests received in the last 30 days"
                totalLabel="Requests"
                shares={SAMPLE_REQUESTS_BY_DISTRICT.map((share, index) => ({
                  ...share,
                  color: SHARE_COLOURS[index % SHARE_COLOURS.length] ?? 'var(--chart-1)',
                }))}
                isSample
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
