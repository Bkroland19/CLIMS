'use client';

import { CircleAlert, Clock, Inbox, List, Package } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { ShareList } from '@/components/charts/ShareList';
import { TrendChart } from '@/components/charts/TrendChart';
import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { DetailHeader } from '@/components/DetailHeader';
import { SampleDataNotice } from '@/components/SampleData';
import { StatCard, StatCardGrid } from '@/components/StatCard';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { StepTracker } from '@/components/StepTracker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { timelineEntries } from '@/features/fulfilment/activity';
import { formatQuantities } from '@/features/fulfilment/products';
import { orderSteps } from '@/features/fulfilment/progress';
import { ORDER_STATUS } from '@/features/fulfilment/status';
import { EMPTY_VALUE, formatDuration, formatNumber } from '@/lib/format';

import type { DistrictStoreSummary } from './api';
import { latestOpenOrder } from './audit';
import { useDistrictContext } from '@/features/district/DistrictContext';
import { DistrictFilter } from './DistrictFilter';
import { listHref, MOH_PATHS } from './filters';
import { districtStockStatus, openOrders, ordersByStage, warehouseTotals } from './national';
import {
  useDistrictStores,
  useNationalActivity,
  useNationalOrders,
  useNationalSummary,
} from './queries';
import {
  SAMPLE_NATIONAL_ORDERS,
  SAMPLE_STOCKOUTS_BY_DISTRICT,
  SAMPLE_WAREHOUSE_STOCK,
} from './sampleCharts';

const RECENT_EVENTS = 8;

/** National view of condom stock, hotspot orders and deliveries. */
export default function MohDashboardPage() {
  const params = useSearchParams();
  const context = useDistrictContext();
  const district = context ? context.district : params.get('district') || null;
  const summary = useNationalSummary(district);

  return (
    <div className="gap-section flex flex-col">
      <SampleDataNotice subject="Stock, orders and deliveries" />
      {!context && (
        <DistrictFilter
          value={district}
          hrefFor={(next) => listHref(MOH_PATHS.dashboard, { district: next })}
        />
      )}

      {summary.isError ? (
        <div className="bg-card rounded-card border">
          <ErrorState
            title={
              district
                ? 'Could not load the district figures'
                : 'Could not load the national figures'
            }
            error={summary.error}
            onRetry={() => void summary.refetch()}
            isRetrying={summary.isRefetching}
          />
        </div>
      ) : (
        <Headlines summary={summary} district={district} />
      )}

      <LatestOrder district={district} />

      {!district && (
        <div className="gap-section grid lg:grid-cols-3">
          <TrendChart
            title="National warehouse stock"
            description="Male condoms at NMS and JMS, last 12 weeks"
            categoryLabel="Week"
            series={[
              { key: 'nms', label: 'NMS', color: 'var(--chart-2)' },
              { key: 'jms', label: 'JMS', color: 'var(--chart-1)' },
            ]}
            rows={SAMPLE_WAREHOUSE_STOCK}
            isSample
          />
          <TrendChart
            title="Hotspot orders, national"
            description="Received vs fulfilled per week, last 8 weeks"
            categoryLabel="Week"
            series={[
              { key: 'received', label: 'Received', color: 'var(--chart-1)' },
              { key: 'fulfilled', label: 'Fulfilled', color: 'var(--chart-2)' },
            ]}
            rows={SAMPLE_NATIONAL_ORDERS}
            isSample
          />
          <ShareList
            title="Stockouts by district"
            description="Reported in the last 30 days"
            totalLabel="Stockouts"
            shares={SAMPLE_STOCKOUTS_BY_DISTRICT.map((share) => ({
              ...share,
              color: 'var(--chart-4)',
            }))}
            isSample
          />
        </div>
      )}

      <div className="gap-section grid lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Pipeline summary={summary} district={district} />
        <DistrictStores district={district} />
      </div>

      <RecentActivity district={district} />
    </div>
  );
}

type SummaryQuery = ReturnType<typeof useNationalSummary>;

function Headlines({ summary, district }: { summary: SummaryQuery; district: string | null }) {
  const data = summary.data;
  const stock = data ? warehouseTotals(data.warehouse_stock) : null;
  const orders = data ? openOrders(data.orders_by_status) : null;
  const lead = data?.average_lead_minutes ?? null;
  const isLoading = summary.isPending;
  return (
    <div className="flex flex-col gap-2">
      <StatCardGrid>
        <StatCard
          label="National warehouse stock"
          value={formatNumber(stock?.total)}
          icon={Package}
          accent="positive"
          href={listHref(MOH_PATHS.requests, { district })}
          isLoading={isLoading}
        />
        <StatCard
          label="Open hotspot orders"
          value={formatNumber(orders?.open)}
          icon={Inbox}
          accent="info"
          href={listHref(MOH_PATHS.orders, { district })}
          isLoading={isLoading}
        />
        <StatCard
          label="Stockouts in the last 7 days"
          value={formatNumber(data?.stockouts_last_7_days)}
          icon={CircleAlert}
          accent="caution"
          href={listHref(MOH_PATHS.orders, { district })}
          isLoading={isLoading}
        />
        <StatCard
          label="Average lead time"
          value={lead === null ? EMPTY_VALUE : formatDuration(lead * 60_000)}
          icon={Clock}
          accent="violet"
          href={listHref(MOH_PATHS.orders, { status: 'closed', district })}
          isLoading={isLoading}
        />
      </StatCardGrid>
      {stock && orders ? (
        <p className="text-muted-foreground text-xs">
          {stock.byWarehouse
            .map((entry) => `${entry.warehouse} ${formatNumber(entry.pieces)}`)
            .join(' · ')}{' '}
          pieces. {formatNumber(orders.onHold)}{' '}
          {orders.onHold === 1 ? 'open order is' : 'open orders are'} on hold for stock. Lead time
          runs from the stockout notification to confirmed receipt.
        </p>
      ) : null}
    </div>
  );
}

/** The newest open order, traced step by step, as the prototype's "Tracing" card. */
function LatestOrder({ district }: { district: string | null }) {
  const orders = useNationalOrders(district);
  if (orders.isPending) {
    return (
      <div role="status">
        <Skeleton className="h-32 w-full" />
        <span className="sr-only">Loading the latest order…</span>
      </div>
    );
  }
  if (orders.isError) {
    return (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load the latest order"
          error={orders.error}
          onRetry={() => void orders.refetch()}
          isRetrying={orders.isRefetching}
        />
      </div>
    );
  }
  const order = latestOpenOrder(orders.data);
  if (!order) {
    return (
      <div className="bg-card rounded-card border">
        <EmptyState
          icon={Inbox}
          title="No open hotspot orders"
          description={
            district
              ? `New stockout notifications from ${district} will be traced here.`
              : 'New stockout notifications from any district will be traced here.'
          }
        />
      </div>
    );
  }
  const status = ORDER_STATUS[order.status];
  return (
    <DetailHeader
      title={`Latest order ${order.id}`}
      status={<StatusBadge status={status.label} tone={status.tone} />}
      description={`${order.hotspot.name}${order.hotspot.district ? `, ${order.hotspot.district}` : ''} · ${formatQuantities(order.requested)} · raised by ${order.requested_by.name} (${order.requested_by.role})`}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href={MOH_PATHS.order(order.id)}>Audit trail</Link>
        </Button>
      }
    >
      <StepTracker aria-label={`Progress of ${order.id}`} steps={orderSteps(order, null)} />
    </DetailHeader>
  );
}

function Pipeline({ summary, district }: { summary: SummaryQuery; district: string | null }) {
  if (summary.isPending) {
    return (
      <div role="status" className="bg-card rounded-card border p-4">
        <Skeleton className="h-64 w-full" />
        <span className="sr-only">Loading orders by stage…</span>
      </div>
    );
  }
  // The headline figures above already report the failure and offer a retry.
  if (summary.isError) return null;
  return (
    <ShareList
      title="Hotspot orders by stage"
      description={`${district ?? 'All districts'}, open and closed this month`}
      totalLabel="Orders"
      shares={ordersByStage(summary.data.orders_by_status)}
    />
  );
}

function DistrictStores({ district }: { district: string | null }) {
  const router = useRouter();
  const stores = useDistrictStores();
  const columns = useMemo<DataTableColumn<DistrictStoreSummary>[]>(
    () => [
      { id: 'district', header: 'District', value: (store) => store.district },
      {
        id: 'male',
        header: 'Male',
        numeric: true,
        value: (store) => store.stock.male,
        cell: (store) => formatNumber(store.stock.male),
      },
      {
        id: 'female',
        header: 'Female',
        numeric: true,
        value: (store) => store.stock.female,
        cell: (store) => formatNumber(store.stock.female),
      },
      {
        id: 'open',
        header: 'Open orders',
        numeric: true,
        value: (store) => store.open_orders,
        cell: (store) => formatNumber(store.open_orders),
      },
      {
        id: 'status',
        header: 'Stock status',
        value: (store) => districtStockStatus(store).label,
        cell: (store) => {
          const status = districtStockStatus(store);
          return <StatusBadge status={status.label} tone={status.tone} />;
        },
      },
    ],
    [],
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>District stores</CardTitle>
        <CardDescription>Condoms in each district store against its minimum level</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          label="District stores"
          columns={columns}
          rows={
            district
              ? stores.data?.filter(
                  (store) => store.district.toLowerCase() === district.toLowerCase(),
                )
              : stores.data
          }
          getRowId={(store) => store.district}
          isLoading={stores.isPending}
          error={stores.error}
          onRetry={() => void stores.refetch()}
          isRetrying={stores.isRefetching}
          searchPlaceholder="Search districts…"
          emptyTitle="No district stores yet"
          emptyDescription="District stores appear here once they are set up."
          rowActions={(store) => (
            <RowActions
              label={`Actions for ${store.district}`}
              actions={[
                {
                  label: 'View hotspot orders',
                  icon: List,
                  onSelect: () => {
                    router.push(listHref(MOH_PATHS.orders, { district: store.district }));
                  },
                },
                {
                  label: 'View warehouse requests',
                  icon: Package,
                  onSelect: () => {
                    router.push(listHref(MOH_PATHS.requests, { district: store.district }));
                  },
                },
              ]}
            />
          )}
        />
      </CardContent>
    </Card>
  );
}

function RecentActivity({ district }: { district: string | null }) {
  const activity = useNationalActivity(district);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {district ? `Activity in ${district}` : 'Activity across the supply chain'}
        </CardTitle>
        <CardDescription>Latest actions by every role</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.isPending ? (
          <div role="status">
            <Skeleton className="h-32 w-full" />
            <span className="sr-only">Loading recent activity…</span>
          </div>
        ) : activity.isError ? (
          <ErrorState
            title="Could not load recent activity"
            error={activity.error}
            onRetry={() => void activity.refetch()}
            isRetrying={activity.isRefetching}
          />
        ) : activity.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
        ) : (
          <ActivityTimeline
            variant="compact"
            aria-label="Recent activity"
            entries={timelineEntries(activity.data.slice(0, RECENT_EVENTS), { feed: true })}
          />
        )}
      </CardContent>
    </Card>
  );
}
