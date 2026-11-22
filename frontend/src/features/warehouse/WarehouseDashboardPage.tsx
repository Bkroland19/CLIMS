'use client';

import { useDistrictContext } from '@/features/district/DistrictContext';
import { Clock, Inbox, ListChecks, Truck } from 'lucide-react';
import Link from 'next/link';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { ShareList } from '@/components/charts/ShareList';
import { SampleDataNotice } from '@/components/SampleData';
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
import { timelineEntries } from '@/features/fulfilment/activity';
import type { WarehouseRequest } from '@/features/fulfilment/api';
import { PRODUCTS } from '@/features/fulfilment/products';
import { StockLevel } from '@/features/fulfilment/StockLevel';
import { formatNumber, formatTimestamp } from '@/lib/format';

import { WAREHOUSE_PATHS, withStore } from './paths';
import { useWarehouseActivity, useWarehouseRequests, useWarehouseStock } from './queries';
import { SAMPLE_REQUESTS_BY_DISTRICT, SAMPLE_WEEKLY_DISPATCHES } from './sampleCharts';
import { StoreSwitch } from './StoreSwitch';
import { REQUEST_FILTERS, warehouseTasks } from './tasks';
import { useWarehouseStore } from './useWarehouseStore';

const RECENT_EVENTS = 6;
const SHARE_COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

type FilterValue = (typeof REQUEST_FILTERS)[number]['value'];

function countOf(requests: readonly WarehouseRequest[] | undefined, value: FilterValue): string {
  const filter = REQUEST_FILTERS.find((candidate) => candidate.value === value);
  if (!requests || !filter) return '—';
  return formatNumber(requests.filter(filter.keeps).length);
}

export default function WarehouseDashboardPage() {
  const { store, href } = useWarehouseStore();
  const district = useDistrictContext()?.district;
  const requests = useWarehouseRequests(store);
  const visibleRequests = district
    ? requests.data?.filter((request) => request.district === district)
    : requests.data;
  const stock = useWarehouseStock(store);
  const activity = useWarehouseActivity(store);
  const requestIds = new Set(visibleRequests?.map((request) => request.id));
  const visibleActivity = district
    ? activity.data?.filter((event) => event.reference !== null && requestIds.has(event.reference))
    : activity.data;
  const filtered = (value: FilterValue) => href(WAREHOUSE_PATHS.requestsWithStatus(value));

  return (
    <div className="gap-section flex flex-col">
      <div className="flex flex-col gap-4">
        <StoreSwitch store={store} hrefFor={(code) => withStore(WAREHOUSE_PATHS.dashboard, code)} />
        <SampleDataNotice subject="District requests, stock and activity" />
      </div>

      <StatCardGrid>
        <StatCard
          label="New requests"
          value={countOf(visibleRequests, 'new')}
          icon={Inbox}
          accent="info"
          href={filtered('new')}
          isLoading={requests.isPending}
        />
        <StatCard
          label="Queued"
          value={countOf(visibleRequests, 'queued')}
          icon={ListChecks}
          accent="positive"
          href={filtered('queued')}
          isLoading={requests.isPending}
        />
        <StatCard
          label="On hold"
          value={countOf(visibleRequests, 'on_hold')}
          icon={Clock}
          accent="caution"
          href={filtered('on_hold')}
          isLoading={requests.isPending}
        />
        <StatCard
          label="In transit"
          value={countOf(visibleRequests, 'dispatched')}
          icon={Truck}
          accent="violet"
          href={filtered('dispatched')}
          isLoading={requests.isPending}
        />
      </StatCardGrid>

      <div className="gap-section grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <TaskList
          title="Needs your action"
          tasks={
            visibleRequests && stock.data
              ? warehouseTasks(visibleRequests, stock.data.batches, new Date(), (iso) =>
                  formatTimestamp(iso),
                ).map((task) => ({ ...task, href: href(task.href) }))
              : undefined
          }
          isLoading={requests.isPending || stock.isPending}
          error={requests.error ?? stock.error}
          errorTitle="Could not load your tasks"
          onRetry={() => {
            void requests.refetch();
            void stock.refetch();
          }}
          isRetrying={requests.isRefetching || stock.isRefetching}
          loadingLabel="Loading tasks…"
          empty={{
            title: 'Nothing needs you right now',
            description: 'New requests from district stores will appear here.',
          }}
        />

        <div className="gap-section flex min-w-0 flex-col">
          <Card>
            <CardHeader>
              <CardTitle>Stock at {store}</CardTitle>
              <CardAction>
                <Button asChild variant="outline" size="sm">
                  <Link href={href(WAREHOUSE_PATHS.stock)}>View stock</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {stock.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : stock.isError ? (
                <ErrorState
                  title={`Could not load ${store} stock`}
                  error={stock.error}
                  onRetry={() => void stock.refetch()}
                  isRetrying={stock.isRefetching}
                />
              ) : (
                PRODUCTS.map((product) => (
                  <StockLevel
                    key={product.key}
                    product={product.key}
                    inStock={stock.data.stock[product.key]}
                    minimum={stock.data.min_levels[product.key]}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest updates on requests and stock at {store}</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : activity.isError ? (
                <ErrorState
                  title="Could not load recent activity"
                  error={activity.error}
                  onRetry={() => void activity.refetch()}
                  isRetrying={activity.isRefetching}
                />
              ) : !visibleActivity?.length ? (
                <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
              ) : (
                <ActivityTimeline
                  variant="compact"
                  entries={timelineEntries(visibleActivity.slice(0, RECENT_EVENTS), { feed: true })}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {!district && (
        <div className="gap-section grid lg:grid-cols-2">
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
      )}
    </div>
  );
}
