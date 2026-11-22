'use client';

import { Clock, Inbox, PackageOpen, Truck } from 'lucide-react';
import Link from 'next/link';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { ShareList } from '@/components/charts/ShareList';
import { TrendChart } from '@/components/charts/TrendChart';
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
import { useAllHotspots } from '@/features/hotspots/queries';
import { useNotifications } from '@/features/notifications/queries';
import { formatNumber, formatTimestamp } from '@/lib/format';

import {
  ACTIVITY_SOURCE,
  activityOf,
  hotspotCoverage,
  stockoutsBySubcounty,
  weeklyAlerts,
} from './dashboard';
import { alertsIn, requestsIn } from './orders';
import { Loaded, useMe } from './parts';
import { useDistrictNames, useHotspotStock, useOrders, useStock } from './queries';
import { DCFP_PATHS, dcfpTasks } from './tasks';

const RECENT_ACTIVITY = 6;
const SHARE_COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export default function DistrictDashboardPage() {
  const now = new Date();
  const queued = useOrders('queued');
  const onHold = useOrders('on_hold');
  const dispatched = useOrders('dispatched');
  const stock = useStock();
  const submitted = useAllHotspots({ review_status: 'submitted' });
  const names = useDistrictNames();

  const work = [queued, onHold, dispatched, stock, submitted];
  const count = (orders: typeof queued, pick: typeof alertsIn) =>
    orders.data ? formatNumber(pick(orders.data.items).length) : '—';

  return (
    <div className="flex flex-col gap-6">
      <StatCardGrid>
        <StatCard
          label="New alerts"
          value={count(queued, alertsIn)}
          icon={Inbox}
          accent="info"
          href={`${DCFP_PATHS.queue}?status=queued`}
          isLoading={queued.isPending}
        />
        <StatCard
          label="Waiting for the warehouse"
          value={count(onHold, alertsIn)}
          icon={Clock}
          accent="caution"
          href={DCFP_PATHS.held}
          isLoading={onHold.isPending}
        />
        <StatCard
          label="Shipments to receive"
          value={count(dispatched, requestsIn)}
          icon={PackageOpen}
          accent="violet"
          href={`${DCFP_PATHS.requests}?status=dispatched`}
          isLoading={dispatched.isPending}
        />
        <StatCard
          label="With riders"
          value={count(dispatched, alertsIn)}
          icon={Truck}
          accent="positive"
          href={DCFP_PATHS.deliveries}
          isLoading={dispatched.isPending}
        />
      </StatCardGrid>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <TaskList
          title="Needs your action"
          tasks={
            work.every((query) => query.data) && !names.isPending
              ? dcfpTasks(
                  {
                    queued: queued.data?.items,
                    onHold: onHold.data?.items,
                    dispatched: dispatched.data?.items,
                    stock: stock.data,
                    submitted: submitted.data?.items,
                  },
                  names.names,
                  (iso) => formatTimestamp(iso, now),
                )
              : undefined
          }
          isLoading={work.some((query) => query.isPending) || names.isPending}
          error={work.find((query) => query.error)?.error ?? names.error}
          errorTitle="Could not load your tasks"
          onRetry={() => {
            for (const query of work) if (query.isError) void query.refetch();
            names.retry();
          }}
          isRetrying={work.some((query) => query.isRefetching)}
          loadingLabel="Loading tasks…"
          empty={{
            title: 'Nothing needs you right now',
            description: 'New stockout alerts and shipments to receive will appear here.',
          }}
        />

        <div className="flex min-w-0 flex-col gap-6">
          <StoreCard />
          <ActivityCard now={now} />
        </div>
      </div>

      <Charts now={now} />
    </div>
  );
}

function StoreCard() {
  const me = useMe();
  const stock = useStock();
  const supply = useHotspotStock();
  const rows = (stock.data ?? []).filter(
    (row) => me.storeId === null || row.store_id === me.storeId,
  );
  const coverage = supply.data ? hotspotCoverage(supply.data) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>District store</CardTitle>
        <CardDescription>
          {coverage
            ? `Stock has reached ${formatNumber(coverage.supplied)} hotspot${coverage.supplied === 1 ? '' : 's'}; ${formatNumber(coverage.waiting)} ${coverage.waiting === 1 ? 'is' : 'are'} waiting for some.`
            : 'Available to send now, by product and unit.'}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link href={DCFP_PATHS.store}>View stock</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Loaded
          isPending={stock.isPending}
          error={stock.error}
          errorTitle="Could not load the district store"
          onRetry={() => void stock.refetch()}
          isRetrying={stock.isRefetching}
        >
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stock recorded yet. Record each product&apos;s opening balance on the store page.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {rows.map((row) => (
                <li
                  key={`${row.condom_id}-${row.unit_of_measure_id}`}
                  className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.product}</span>
                    <span className="text-muted-foreground text-xs">
                      {row.unit}
                      {row.incoming > 0 ? ` · ${formatNumber(row.incoming)} on the way` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums">
                    <span
                      className={row.available > 0 ? 'font-semibold' : 'text-warning font-semibold'}
                    >
                      {formatNumber(row.available)}
                    </span>{' '}
                    <span className="text-muted-foreground text-xs">available</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Loaded>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ now }: { now: Date }) {
  const notifications = useNotifications();
  const items = (notifications.data ?? []).slice(0, RECENT_ACTIVITY).map(activityOf);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>The latest from your notifications</CardDescription>
      </CardHeader>
      <CardContent>
        <Loaded
          isPending={notifications.isPending}
          error={notifications.error}
          errorTitle="Could not load recent activity"
          onRetry={() => void notifications.refetch()}
          isRetrying={notifications.isRefetching}
        >
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
          ) : (
            <ActivityTimeline
              variant="compact"
              entries={items.map((item) => ({
                id: item.id,
                text: item.href ? (
                  <Link href={item.href} className="underline-offset-4 hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  item.title
                ),
                meta: `${ACTIVITY_SOURCE[item.role]} · ${formatTimestamp(item.at, now)}`,
                role: item.role,
              }))}
            />
          )}
        </Loaded>
      </CardContent>
    </Card>
  );
}

/** Alerts by week and by sub-county, worked out from the district's orders and hotspots. */
function Charts({ now }: { now: Date }) {
  const orders = useOrders(null);
  const hotspots = useAllHotspots();
  const error = orders.error ?? hotspots.error;
  if (error) {
    return (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load the charts"
          error={error}
          onRetry={() => {
            for (const query of [orders, hotspots]) if (query.isError) void query.refetch();
          }}
          isRetrying={orders.isRefetching || hotspots.isRefetching}
        />
      </div>
    );
  }
  if (!orders.data || !hotspots.data) {
    return (
      <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  const shares = stockoutsBySubcounty(orders.data.items, hotspots.data.items, now);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TrendChart
        title="Stockout alerts"
        description="Reported and delivered per week, last 8 weeks"
        categoryLabel="Week starting"
        series={[
          { key: 'reported', label: 'Reported', color: 'var(--chart-2)' },
          { key: 'delivered', label: 'Delivered', color: 'var(--chart-1)' },
        ]}
        rows={weeklyAlerts(orders.data.items, now)}
      />
      <ShareList
        title="Stockouts by sub-county"
        description="Reported in the last 30 days"
        totalLabel="Stockouts"
        shares={shares.map((share, index) => ({
          ...share,
          color: SHARE_COLOURS[index % SHARE_COLOURS.length] ?? 'var(--chart-1)',
        }))}
      />
    </div>
  );
}
