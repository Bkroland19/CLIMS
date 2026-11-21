'use client';

import { Clock, Inbox, Package, Truck } from 'lucide-react';
import Link from 'next/link';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { ShareList } from '@/components/charts/ShareList';
import { TrendChart } from '@/components/charts/TrendChart';
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
import { formatNumber, formatTimestamp } from '@/lib/format';

import { timelineEntries } from './activity';
import type { HotspotOrder, OrderStatus } from './api';
import { PRODUCTS } from './products';
import { useActivity, useDistrictStore, useOrders, useRequests } from './queries';
import {
  SAMPLE_STOCKOUTS_BY_SUBCOUNTY,
  SAMPLE_STORE_STOCK,
  SAMPLE_WEEKLY_ORDERS,
} from './sampleCharts';
import { StockLevel } from './StockLevel';
import { DCFP_PATHS, dcfpTasks } from './tasks';

const RECENT_EVENTS = 6;
const SHARE_COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

function countOf(orders: readonly HotspotOrder[] | undefined, statuses: readonly OrderStatus[]) {
  if (!orders) return '—';
  return formatNumber(orders.filter((order) => statuses.includes(order.status)).length);
}

export default function DcfpDashboardPage() {
  const orders = useOrders();
  const requests = useRequests();
  const store = useDistrictStore();
  const activity = useActivity();

  return (
    <div className="gap-section flex flex-col">
      <SampleDataNotice subject="Orders, stock and warehouse requests" />

      <StatCardGrid>
        <StatCard
          label="Orders in queue"
          value={countOf(orders.data, ['queued'])}
          icon={Inbox}
          accent="info"
          href={`${DCFP_PATHS.queue}?status=queued`}
          isLoading={orders.isPending}
        />
        <StatCard
          label="On hold"
          value={countOf(orders.data, ['on_hold'])}
          icon={Clock}
          accent="caution"
          href={DCFP_PATHS.held}
          isLoading={orders.isPending}
        />
        <StatCard
          label="Ready to dispatch"
          value={countOf(orders.data, ['confirmed'])}
          icon={Package}
          accent="positive"
          href={DCFP_PATHS.dispatch}
          isLoading={orders.isPending}
        />
        <StatCard
          label="Out for delivery"
          value={countOf(orders.data, ['dispatched', 'in_transit', 'delivered'])}
          icon={Truck}
          accent="violet"
          href={DCFP_PATHS.dispatch}
          isLoading={orders.isPending}
        />
      </StatCardGrid>

      <div className="gap-section grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <TaskList
          title="Needs your action"
          tasks={
            orders.data && requests.data && store.data
              ? dcfpTasks(orders.data, requests.data, store.data.stock, (iso) =>
                  formatTimestamp(iso),
                )
              : undefined
          }
          isLoading={orders.isPending || requests.isPending || store.isPending}
          error={orders.error ?? requests.error ?? store.error}
          errorTitle="Could not load your tasks"
          onRetry={() => {
            void orders.refetch();
            void requests.refetch();
            void store.refetch();
          }}
          isRetrying={orders.isRefetching || requests.isRefetching || store.isRefetching}
          loadingLabel="Loading tasks…"
          empty={{
            title: 'Nothing needs you right now',
            description: 'New stockout notifications will appear here.',
          }}
        />

        <div className="gap-section flex min-w-0 flex-col">
          <Card>
            <CardHeader>
              <CardTitle>District store</CardTitle>
              <CardAction>
                <Button asChild variant="outline" size="sm">
                  <Link href={DCFP_PATHS.store}>View stock</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {store.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : store.isError ? (
                <ErrorState
                  title="Could not load the district store"
                  error={store.error}
                  onRetry={() => void store.refetch()}
                  isRetrying={store.isRefetching}
                />
              ) : (
                PRODUCTS.map((product) => (
                  <StockLevel
                    key={product.key}
                    product={product.key}
                    inStock={store.data.stock[product.key]}
                    minimum={store.data.min_levels[product.key]}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest updates on orders and stock in the district</CardDescription>
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
              ) : activity.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
              ) : (
                <ActivityTimeline
                  variant="compact"
                  entries={timelineEntries(activity.data.slice(0, RECENT_EVENTS), { feed: true })}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="gap-section grid lg:grid-cols-3">
        <TrendChart
          title="District store stock"
          description="Male condoms in the district store, last 30 days"
          categoryLabel="Date"
          series={[{ key: 'male', label: 'Male condoms', color: 'var(--chart-1)' }]}
          rows={SAMPLE_STORE_STOCK}
          isSample
        />
        <TrendChart
          title="Orders received vs delivered"
          description="Hotspot orders per week, last 8 weeks"
          categoryLabel="Week"
          series={[
            { key: 'received', label: 'Received', color: 'var(--chart-2)' },
            { key: 'delivered', label: 'Delivered', color: 'var(--chart-1)' },
          ]}
          rows={SAMPLE_WEEKLY_ORDERS}
          isSample
        />
        <ShareList
          title="Stockouts by sub-county"
          description="Reported in the last 30 days"
          totalLabel="Stockouts"
          shares={SAMPLE_STOCKOUTS_BY_SUBCOUNTY.map((share, index) => ({
            ...share,
            color: SHARE_COLOURS[index % SHARE_COLOURS.length] ?? 'var(--chart-1)',
          }))}
          isSample
        />
      </div>
    </div>
  );
}
